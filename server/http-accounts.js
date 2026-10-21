// Discord sign-in, profiles, a player's own data, matches, the leaderboard, social.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, achievements, app, auth, crypto, db } from './base.js';
import { cleanName } from './helpers.js';
import { kickEverywhere } from './http-admin.js';

// ---- sign in ----
export const origin = req => `${req.protocol}://${req.get('host')}`;
export const OAUTH_STATE = 'maqlab_oauth';
// Where to come back to after Discord. An invited friend used to sign in and
// land on the home screen with the room code gone. Only a room link or home is
// accepted, so this can never become a redirect to somewhere else.
export const OAUTH_NEXT = 'maqlab_next';
export const safeNext = p => (/^\/room\/[A-Za-z]{4,5}$/.test(String(p || '')) ? String(p) : '/');
export const oauthCookie = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 };

export async function signIn(res, { id, name, avatar }) {
  if (db.on()) {
    const banned = await db.isBanned(id);
    if (banned) return { error: 'banned', reason: banned.ban_reason };
    await db.touchProfile({ userId: id, name, avatar: avatar || {} });
  }
  auth.setCookie(res, auth.mint({ id, name }));
  return { ok: true };
}


// ---- profiles, leaderboard, social ----
export const needsDb = (res) => { if (db.on()) return false; res.status(503).json({ error: 'no_db' }); return true; };
export const sessionOr401 = (req, res) => {
  const s = auth.sessionFrom(req.headers);
  if (!s) res.status(401).json({ error: 'sign_in' });
  return s;
};
export const lastPost = new Map(); // userId -> ts, so reports/suggestions can't be spammed
export const tooSoon = (id, ms) => {
  const n = Date.now();
  if (n - (lastPost.get(id) || 0) < ms) return true;
  lastPost.set(id, n);
  return false;
};

export const BAN_FIELDS = ['banned_at', 'ban_reason', 'banned_by'];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The side effects of this part, run once by main.js in this order.
export function registerAccounts() {

app.get('/api/auth/discord/start', (req, res) => {
  if (!DISCORD_CLIENT_ID) return res.status(500).send('Discord sign-in is not configured');
  const state = crypto.randomBytes(16).toString('base64url');
  res.cookie(OAUTH_STATE, state, oauthCookie);
  res.cookie(OAUTH_NEXT, safeNext(req.query.next), oauthCookie);
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID, redirect_uri: `${origin(req)}/api/auth/discord/callback`,
    response_type: 'code', scope: 'identify', state,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const expected = auth.readCookie(req.headers.cookie, OAUTH_STATE);
  const next = safeNext(auth.readCookie(req.headers.cookie, OAUTH_NEXT));
  const back = outcome => res.redirect(`${next}?login=${outcome}`);
  res.clearCookie(OAUTH_NEXT);
  if (!req.query.code || !req.query.state || req.query.state !== expected) return back('failed');
  res.clearCookie(OAUTH_STATE);
  try {
    const tok = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code', code: String(req.query.code),
        redirect_uri: `${origin(req)}/api/auth/discord/callback`,
      }),
    }).then(r => r.json());
    if (!tok.access_token) return back('failed');
    const me = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then(r => r.json());
    if (!me.id) return back('failed');
    const r = await signIn(res, { id: me.id, name: cleanName(me.global_name || me.username) });
    back(r.error === 'banned' ? 'banned' : 'ok');
  } catch {
    back('failed');
  }
});

app.post('/api/auth/logout', (_, res) => { auth.clearCookie(res); res.json({ ok: true }); });

app.get('/api/auth/me', async (req, res) => {
  const s = auth.sessionFrom(req.headers);
  if (!s) return res.json({ user: null, isAdmin: false });
  const profile = db.on() ? await db.getProfile(s.id) : null;
  if (profile && profile.banned_at) { auth.clearCookie(res); return res.json({ user: null, isAdmin: false, banned: profile.ban_reason }); }
  res.json({ user: { id: s.id, name: profile ? profile.name : s.name }, isAdmin: auth.isAdmin(s.id) });
});

// ---- a player's own data ----
app.get('/api/account/export', async (req, res) => {
  const s = sessionOr401(req, res); if (!s) return;
  if (needsDb(res)) return;
  const data = await db.exportAccount(s.id);
  if (!data) return res.status(404).json({ error: 'not_found' });
  res.setHeader('Content-Disposition', `attachment; filename="maqlab-${s.id}.json"`);
  res.json(data);
});

app.post('/api/account/delete', async (req, res) => {
  const s = sessionOr401(req, res); if (!s) return;
  if (needsDb(res)) return;
  // Sent by the confirm button, so a stray request cannot delete anyone.
  if (req.body?.confirm !== 'delete') return res.status(400).json({ error: 'confirm' });
  // A ban would go with the profile, and signing in again would start clean.
  // Banned accounts are removed by an admin instead.
  if (await db.isBanned(s.id)) return res.status(403).json({ error: 'banned' });
  const r = await db.deleteAccount(s.id);
  kickEverywhere(s.id);
  auth.clearCookie(res);
  console.log(`account deleted (${r.matches} replays anonymised)`);
  res.json({ ok: true });
});
app.get('/api/profile/:userId', async (req, res) => {
  if (needsDb(res)) return;
  const me = auth.sessionFrom(req.headers);
  const profile = await db.getProfile(req.params.userId);
  if (!profile) return res.status(404).json({ error: 'not_found' });
  const [rank, games, follows] = await Promise.all([
    db.rankOf(profile.user_id),
    db.recentGames(profile.user_id, 10),
    db.followCounts(profile.user_id),
  ]);
  // Moderation is between the player and the admins. The whole row used to go
  // to anyone who opened a profile, ban reason and banning admin included.
  const viewerIsAdmin = auth.isAdmin(me && me.id);
  if (!viewerIsAdmin) for (const k of BAN_FIELDS) delete profile[k];
  res.json({
    profile, rank, games, follows,
    isMe: !!me && me.id === profile.user_id,
    isFollowing: me ? await db.isFollowing(me.id, profile.user_id) : false,
    viewerIsAdmin,
  });
});

// A finished scoreboard, readable by anyone with the link. Names and avatars
// are already public on profiles, and nothing here is per-viewer, so there is
// no session check — that is what makes the link shareable.
app.get('/api/match/:id', async (req, res) => {
  if (needsDb(res)) return;
  if (!UUID.test(req.params.id)) return res.status(404).json({ error: 'not_found' });
  const [rows, rep] = await Promise.all([db.getMatch(req.params.id), db.getReplay(req.params.id)]);
  if (!rows.length && !rep) return res.status(404).json({ error: 'not_found' });
  // The replay's roster is the whole table; game_results is only the accounts.
  // Games finished before replays existed have no roster, so fall back to it.
  let players;
  if (rep) {
    const top = Math.max(0, ...rep.data.players.map(p => p.score));
    players = rep.data.players.map(p => ({
      userId: p.userId, pid: p.pid, name: p.name, avatar: p.avatar, bot: !!p.bot,
      score: p.score, place: p.place, won: p.score > 0 && p.score === top,
    }));
  } else {
    players = rows.map(r => ({
      userId: r.user_id, pid: null, name: r.name, avatar: r.avatar, bot: false,
      score: r.score, place: r.place, won: r.won,
    }));
  }
  res.json({
    id: req.params.id,
    finishedAt: rep ? rep.finished_at : rows[0].finished_at,
    rounds: rep ? rep.rounds : rows[0].rounds,
    lang: rep ? rep.lang : null,
    players,
    log: rep ? rep.data.log || [] : null,
  });
});

// the client renders the grid from this, so the two lists can't drift apart
app.get('/api/achievements', (_, res) => res.json({ list: achievements.LIST.map(({ id, e }) => ({ id, e })) }));

app.get('/api/leaderboard', async (req, res) => {
  if (needsDb(res)) return;
  const me = auth.sessionFrom(req.headers);
  const week = req.query.range === 'week';
  res.json({
    range: week ? 'week' : 'all',
    entries: week ? await db.weeklyBoard(50) : await db.leaderboard(50),
    meId: me ? me.id : null,
    myRank: me ? (week ? await db.weeklyRank(me.id) : await db.rankOf(me.id)) : null,
    isAdmin: auth.isAdmin(me && me.id),
  });
});

app.post('/api/follow', async (req, res) => {
  if (needsDb(res)) return;
  const s = sessionOr401(req, res); if (!s) return;
  const target = String(req.body?.userId || '');
  if (!target || target === s.id) return res.status(400).json({ error: 'bad_target' });
  await (req.body?.follow ? db.follow(s.id, target) : db.unfollow(s.id, target));
  res.json({ ok: true, following: !!req.body?.follow });
});

app.get('/api/following', async (req, res) => {
  if (needsDb(res)) return;
  const s = sessionOr401(req, res); if (!s) return;
  res.json({ following: await db.following(s.id) });
});

app.post('/api/report', async (req, res) => {
  if (needsDb(res)) return;
  const s = sessionOr401(req, res); if (!s) return;
  if (tooSoon(`report:${s.id}`, 30_000)) return res.status(429).json({ error: 'slow_down' });
  const target = await db.getProfile(String(req.body?.userId || ''));
  if (!target || target.user_id === s.id) return res.status(400).json({ error: 'bad_target' });
  const me = await db.getProfile(s.id);
  await db.createReport({
    reporterId: s.id, reporterName: me ? me.name : s.name,
    reportedId: target.user_id, reportedName: target.name,
    reason: String(req.body?.reason || 'other').slice(0, 40),
    details: String(req.body?.details || ''),
  });
  res.json({ ok: true });
});

app.post('/api/suggest', async (req, res) => {
  if (needsDb(res)) return;
  const s = sessionOr401(req, res); if (!s) return;
  if (tooSoon(`suggest:${s.id}`, 30_000)) return res.status(429).json({ error: 'slow_down' });
  const body = String(req.body?.body || '').trim();
  if (body.length < 3) return res.status(400).json({ error: 'too_short' });
  const me = await db.getProfile(s.id);
  await db.createSuggestion({ userId: s.id, name: me ? me.name : s.name, body });
  res.json({ ok: true });
});

}
