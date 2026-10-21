// Admin tools, health, open rooms, the Discord Activity, error handling.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, MAX_PLAYERS, app, auth, content, contentCount, db, discordInstanceRooms, io, rooms, roomsFull } from './base.js';
import { cleanName, connected } from './helpers.js';
import { humans } from './snapshot.js';
import { broadcast, createRoom } from './flow.js';
import { checkProgress } from './end.js';
import { needsDb, signIn } from './http-accounts.js';
import { errorsSeen, noteError } from './boot.js';

// ---- admin ----
// Non-admins get a 404 rather than a 403, so these routes don't advertise
// that they exist.
export const adminOr404 = (req, res) => {
  const s = auth.sessionFrom(req.headers);
  if (!s || !auth.isAdmin(s.id)) { res.status(404).end(); return null; }
  return s;
};

// A ban has to take effect now, not on their next visit.
export function kickEverywhere(userId) {
  for (const r of rooms.values()) {
    for (const p of r.players.values()) {
      if (p.userId !== userId) continue;
      if (p.socketId) io.to(p.socketId).emit('kicked');
      r.players.delete(p.id);
      checkProgress(r); broadcast(r);
    }
  }
}

// The side effects of this part, run once by main.js in this order.
export function registerAdmin() {

app.get('/api/admin/state', async (req, res) => {
  const s = adminOr404(req, res); if (!s) return;
  if (needsDb(res)) return;
  const [reports, suggestions, banned] = await Promise.all([db.openReports(), db.openSuggestions(), db.bannedUsers()]);
  res.json({ reports, suggestions, banned });
});

app.post('/api/admin/action', async (req, res) => {
  const s = adminOr404(req, res); if (!s) return;
  if (needsDb(res)) return;
  const { action, userId, id, reason, term } = req.body || {};
  if (action === 'ban') {
    if (auth.isAdmin(userId)) return res.status(400).json({ error: 'cannot_ban_admin' });
    await db.setBan(userId, reason, s.id);
    kickEverywhere(userId);
  } else if (action === 'unban') await db.unban(userId);
  else if (action === 'reset') await db.resetProfile(userId);
  else if (action === 'handleReport') await db.handleReport(id, s.id);
  else if (action === 'handleSuggestion') await db.handleSuggestion(id, s.id);
  else if (action === 'search') return res.json({ results: await db.searchProfiles(String(term || '')) });
  else return res.status(400).json({ error: 'unknown_action' });
  res.json({ ok: true });
});

// ---- public lobbies ----
// Straight off the in-memory rooms; no database needed.
// Cheap to poll and enough to tell whether a bad report is the server, the
// database, or just one player's connection.
app.get('/health', (_, res) => {
  let players = 0, active = 0;
  for (const r of rooms.values()) {
    const n = connected(r).length;
    players += n;
    if (n) active += 1;
  }
  res.json({
    ok: true,
    // Which build is actually serving. Without it, "is the deploy live?" is
    // answered by watching the uptime reset and inferring — and a change that
    // only touches content leaves no other trace at all.
    commit: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'local',
    content: contentCount,
    uptimeSeconds: Math.round(process.uptime()),
    rooms: rooms.size,
    activeRooms: active,
    players,
    database: db.on() ? 'connected' : 'off',
    discord: DISCORD_CLIENT_ID ? 'configured' : 'off',
    // Server errors since this process started, and the latest one's first
    // line. A number that moves is the signal; the logs have the rest.
    errors: errorsSeen,
  });
});

app.get('/api/lobbies', (_, res) => {
  const list = [];
  for (const r of rooms.values()) {
    // Bots are padding, not company: a room advertised as having three
    // players should have three people in it.
    const online = humans(r).filter(p => p.connected);
    if (!r.settings.public || !online.length || r.players.size >= MAX_PLAYERS) continue;
    // Only rooms still waiting to start. A room was listed for as long as it
    // was public, so a stranger could tap in on round seven of a game among
    // friends — arriving with no score, into a round already half answered.
    // Listing stops at kickoff and starts again when the room comes back to
    // the lobby; the code still works the whole time, for the people who were
    // given it.
    if (r.phase !== 'lobby') continue;
    const host = r.players.get(r.hostId);
    list.push({
      code: r.code, players: online.length, phase: r.phase, round: r.round,
      rounds: r.settings.rounds, lang: r.settings.lang,
      host: host ? host.name : '', avatar: host ? host.avatar : null,
    });
  }
  list.sort((a, b) => b.players - a.players);
  res.json({ lobbies: list.slice(0, 30) });
});

// ---- Discord Activity support ----
// Public, non-secret config the client needs to boot the Discord SDK.
app.get('/api/discord/config', (_, res) => { console.log('activity: config requested'); res.json({ clientId: DISCORD_CLIENT_ID || null }); });

// Exchanges a Discord OAuth `code` (from the client's authorize() call) for an
// access token, using the client secret which must never reach the browser.
app.post('/api/discord/token', async (req, res) => {
  console.log('activity: token exchange requested');
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) return res.status(500).json({ error: 'not_configured' });
  const code = String(req.body?.code || '');
  if (!code) return res.status(400).json({ error: 'missing_code' });
  try {
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code }),
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) return res.status(502).json({ error: 'exchange_failed' });

    // Inside Discord there is no place to run the normal OAuth redirect: the
    // Activity iframe cannot navigate to discord.com, which is exactly the
    // white page people were landing on. So the session is minted right here
    // from the code the SDK already handed us. The identity comes from
    // Discord's own API with that token, never from the client, and it is
    // returned as a bearer token because third-party cookies are unreliable
    // inside the iframe.
    const who = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `Bearer ${data.access_token}` },
    }).then(x => (x.ok ? x.json() : null)).catch(() => null);
    if (!who || !who.id) return res.status(502).json({ error: 'exchange_failed' });

    const name = cleanName(who.global_name || who.username || 'Player');
    const signed = await signIn(res, { id: who.id, name });
    if (signed.error) return res.status(403).json(signed);

    console.log('activity: signed in', who.id);
    res.json({ access_token: data.access_token, session: auth.mint({ id: who.id, name }), user: { id: who.id, name }, isAdmin: auth.isAdmin(who.id) });
  } catch (e) {
    console.error('discord token exchange failed:', e.message);
    res.status(502).json({ error: 'exchange_failed' });
  }
});

// One room per Discord Activity instance (= one per voice channel session),
// so everyone who launches the Activity from the same channel lands together.
app.post('/api/discord/room', (req, res) => {
  console.log('activity: room requested');
  const instanceId = String(req.body?.instanceId || '').slice(0, 80);
  if (!instanceId) return res.status(400).json({ error: 'missing_instance' });
  const existing = discordInstanceRooms.get(instanceId);
  if (existing && rooms.has(existing)) return res.json({ code: existing });
  // No session here on purpose: this runs alongside sign-in so the Activity
  // opens without a wait. The cap is what keeps it from filling the server.
  if (roomsFull()) return res.status(503).json({ error: 'busy' });
  const room = createRoom();
  room.settings.public = false; // a voice-channel game isn't advertised to strangers
  room.discordInstance = instanceId;
  discordInstanceRooms.set(instanceId, room.code);
  res.json({ code: room.code });
});


// A failing database must never take the game down with it: a game in
// progress never touches it. Express 4 does not catch rejections
// from async handlers, so both nets are needed.
app.use((err, req, res, _next) => {
  noteError(err);
  console.error('request failed:', req.method, req.originalUrl, '-', err.message);
  if (!res.headersSent) res.status(503).json({ error: 'unavailable' });
});
process.on('unhandledRejection', e => { noteError(e); console.error('unhandled rejection:', e && e.message ? e.message : e); });
process.on('uncaughtException', e => { noteError(e); console.error('uncaught exception:', e && e.stack ? e.stack : e); });

}
