// Every socket event a player can send, and the sweep that frees empty rooms.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { ANSWER_EVENTS, EVENT_BURST, EVENT_RATE, FLOOD_DISCONNECT, GHOST_MS, MAX_PLAYERS, OBJECT_PAYLOADS, PHRASES, REACTIONS, ROOM_TTL_MS, TYPES, auth, db, discordInstanceRooms, hostq, io, joinBlocked, noteJoinFail, rooms, roomsFull } from './base.js';
import { cleanAvatar, cleanName, connected, freshPowers, freshStats, rid, rnd } from './helpers.js';
import { addBot, balanceTeams, dropBots, humans, laughCounts, smallerTeam } from './snapshot.js';
import { broadcast, clearTimer, createRoom, fillForSolo, noteEnd, startGame } from './flow.js';
import { stuckSuggestion, submitGuess, submitHigher, submitLie, submitLikely, submitMinor, submitMiss, submitSpyClue, submitSpyGuess, submitSpyVote, submitVote } from './rounds-a.js';
import { submitMany, submitManyGuess, submitName, submitOrder, submitQuick, submitTwo, submitTwoGuess, usePower } from './rounds-b.js';
import { backToLobby, checkProgress, finishGame } from './end.js';
import { forgetRoom } from './rooms-saved.js';
import { shuttingDown } from './boot.js';


// The side effects of this part, run once by main.js in this order.
export function attachSockets() {
// ---------------- sockets ----------------
io.on('connection', socket => {
  let room = null, player = null;
  // The Activity iframe can't rely on cookies, so it passes the same token in
  // socket auth instead.
  const hs = socket.handshake;
  const session = auth.sessionFrom(hs.auth && hs.auth.token ? { authorization: `Bearer ${hs.auth.token}` } : hs.headers);
  const reply = (cb, d) => typeof cb === 'function' && cb(d);
  const host = () => room && player && room.hostId === player.id;
  const limits = {};
  const limited = (k, ms) => { const n = Date.now(); if (n - (limits[k] || 0) < ms) return true; limits[k] = n; return false; };

  // Under the per-event limits, one budget for everything a socket sends:
  // EVENT_RATE a second, bursts up to EVENT_BURST. Nobody playing comes near
  // it; a script does, and its extra packets are dropped before any handler
  // runs. A socket that keeps going after that is disconnected.
  let budget = EVENT_BURST, refilled = Date.now(), dropped = 0;
  socket.use((packet, next) => {
    const now = Date.now();
    budget = Math.min(EVENT_BURST, budget + ((now - refilled) / 1000) * EVENT_RATE);
    refilled = now;
    if (budget < 1) { if (++dropped > FLOOD_DISCONNECT) socket.disconnect(true); return; }
    budget -= 1;
    // These handlers destructure their payload, and null or a bare string
    // would throw inside them instead of being turned away.
    if (OBJECT_PAYLOADS.has(packet[0]) && (packet[1] === null || typeof packet[1] !== 'object')) packet[1] = {};
    // Someone watching this game cannot answer in it. Turned away here, once,
    // rather than in each of the submit functions.
    if (player && player.watching && ANSWER_EVENTS.has(packet[0])) {
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack({ error: 'watching' });
      return;
    }
    next();
  });

  socket.on('create', (opts, cb) => {
    // Joining has always needed a Discord account; creating did not, so a
    // script could open rooms nobody could ever sit down in.
    if (!session) return reply(cb, { error: 'signin' });
    if (shuttingDown || limited('create', 3000) || roomsFull()) return reply(cb, { error: 'busy' });
    const room = createRoom();
    // The room opens in the language the person creating it is reading. They
    // can still change it; it is a starting point, not a decision taken for
    // them — and it beats an Arabic interface asking English questions.
    const want = opts && opts.lang;
    if (['ar', 'en'].includes(want)) room.settings.lang = want;
    reply(cb, { code: room.code });
  });

  socket.on('join', async ({ code, token, name, avatar } = {}, cb) => {
    const ip = socket.handshake.address;
    if (joinBlocked(ip)) return reply(cb, { error: 'noroom' });
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) { noteJoinFail(ip); return reply(cb, { error: 'noroom' }); }
    // Players are their Discord account. The client no longer supplies a name,
    // so nobody can sit down as someone else.
    if (!session) return reply(cb, { error: 'signin' });
    let profile = null;
    if (db.on()) {
      profile = await db.getProfile(session.id).catch(() => null);
      if (profile && profile.banned_at) return reply(cb, { error: 'banned' });
    }
    name = cleanName(profile ? profile.name : session.name);
    avatar = cleanAvatar(avatar);
    let p = token && r.players.get(token);
    if (!p) {
      // Watchers take a seat too: they are players from the next game on.
      if ([...r.players.values()].filter(x => x.connected).length >= MAX_PLAYERS) return reply(cb, { error: 'full' });
      p = { id: rid(), name, avatar, score: 0, streak: 0, stats: freshStats(), powers: freshPowers(), connected: true, socketId: null, team: null, ready: false, userId: session.id,
        joinedRound: r.phase === 'lobby' ? 0 : r.round, leftRound: null,
        // Arriving mid-game: watch this one, play from the next. A newcomer
        // seated with no points could not catch up (one finished on 500
        // against 8,920), and every round had to wait for someone who had
        // not seen how it works.
        watching: !['lobby', 'final'].includes(r.phase) };
      if (r.settings.teams) p.team = smallerTeam(r);
      r.players.set(p.id, p);
    } else { p.name = name; p.avatar = avatar; p.userId = session.id; p.leftRound = null; }
    if (db.on()) db.touchProfile({ userId: session.id, name, avatar }).catch(() => {});
    if (room && player && room !== r) leave(false);
    room = r; player = p;
    p.connected = true; p.socketId = socket.id;
    if (!r.hostId || !r.players.get(r.hostId)?.connected || r.players.get(r.hostId)?.bot) r.hostId = p.id;
    socket.join(r.code);
    io.to(r.code).emit('joined', { id: p.id, name: p.name });
    reply(cb, { ok: true, token: p.id, code: r.code });
    broadcast(r);
  });

  socket.on('stuck', (_, cb) => room && reply(cb, stuckSuggestion(room, player)));

  socket.on('askQ', (payload, cb) => {
    if (!host()) return reply(cb, { error: 'host' });
    const r = hostq.addQuestion(room, payload);
    if (r.ok) broadcast(room);
    reply(cb, r);
  });

  socket.on('unaskQ', (i, cb) => {
    if (!host()) return reply(cb, { error: 'host' });
    const r = hostq.removeQuestion(room, i);
    if (r.ok) broadcast(room);
    reply(cb, r);
  });

  socket.on('settings', (patch = {}, cb) => {
    if (!host() || room.phase !== 'lobby') return reply(cb, { error: 'host' });
    const s = room.settings;
    if (['ar', 'en'].includes(patch.lang)) s.lang = patch.lang;
    if ([3, 5, 8, 12].includes(patch.rounds)) s.rounds = patch.rounds;
    if (['chill', 'normal', 'fast'].includes(patch.pace)) s.pace = patch.pace;
    if (typeof patch.teams === 'boolean') { s.teams = patch.teams; if (s.teams) balanceTeams(room); }
    if (typeof patch.public === 'boolean') {
      s.public = patch.public;
      // Listing the room publicly takes the host's own questions with it.
      hostq.clearIfPublic(room);
    }
    // Toggling flips against the server's own copy. The client used to send the
    // whole map computed from its local state, so two quick taps raced: the
    // second was built from state the first had already changed, and undid it.
    if (typeof patch.toggleType === 'string' && TYPES.includes(patch.toggleType)) {
      const next = { ...s.types, [patch.toggleType]: !s.types[patch.toggleType] };
      if (Object.values(next).some(Boolean)) s.types = next;
    }
    if (patch.types && typeof patch.types === 'object') {
      const t = Object.fromEntries(TYPES.map(k => [k, !!patch.types[k]]));
      if (Object.values(t).some(Boolean)) s.types = t;
    }
    broadcast(room);
    reply(cb, { ok: true });
  });

  socket.on('start', (_, cb) => {
    if (!host() || room.phase !== 'lobby') return reply(cb, { error: 'host' });
    fillForSolo(room);
    startGame(room);
    reply(cb, { ok: true });
  });

  socket.on('addBot', (_, cb) => {
    if (!host() || room.phase !== 'lobby') return reply(cb, { error: 'host' });
    const b = addBot(room);
    if (!b) return reply(cb, { error: 'full' });
    broadcast(room);
    reply(cb, { ok: true });
  });

  socket.on('removeBot', (pid, cb) => {
    if (!host() || room.phase !== 'lobby') return reply(cb, { error: 'host' });
    const b = room.players.get(String(pid || ''));
    if (!b || !b.bot) return reply(cb, { error: 'bad' });
    room.players.delete(b.id);
    broadcast(room);
    reply(cb, { ok: true });
  });

  socket.on('lie', (text, cb) => room && reply(cb, submitLie(room, player, text)));
  socket.on('vote', ({ id, bet } = {}, cb) => room && reply(cb, submitVote(room, player, id, bet)));
  socket.on('guess', (v, cb) => room && reply(cb, submitGuess(room, player, v)));
  socket.on('blitz', (v, cb) => room && reply(cb, submitQuick(room, player, v)));
  socket.on('emoji', (id, cb) => room && reply(cb, submitQuick(room, player, id)));
  socket.on('odd', (id, cb) => room && reply(cb, submitQuick(room, player, id)));
  socket.on('order', (ids, cb) => room && reply(cb, submitOrder(room, player, ids)));
  socket.on('likely', (target, cb) => room && reply(cb, submitLikely(room, player, target)));
  socket.on('power', (kind, cb) => room && reply(cb, usePower(room, player, kind)));
  socket.on('spyClue', (text, cb) => room && reply(cb, submitSpyClue(room, player, text)));
  socket.on('spyVote', (id, cb) => room && reply(cb, submitSpyVote(room, player, id)));
  socket.on('spyGuess', (text, cb) => room && reply(cb, submitSpyGuess(room, player, text)));
  socket.on('minor', (side, cb) => room && reply(cb, submitMinor(room, player, side)));
  socket.on('higher', (side, cb) => room && reply(cb, submitHigher(room, player, side)));
  socket.on('miss', (id, cb) => room && reply(cb, submitMiss(room, player, id)));

  socket.on('two', ({ lines, lie } = {}, cb) => room && reply(cb, submitTwo(room, player, lines, lie)));
  socket.on('twoGuess', (i, cb) => room && reply(cb, submitTwoGuess(room, player, i)));
  socket.on('name', (text, cb) => room && reply(cb, submitName(room, player, text)));
  socket.on('many', (yes, cb) => room && reply(cb, submitMany(room, player, yes)));
  socket.on('manyGuess', (n, cb) => room && reply(cb, submitManyGuess(room, player, n)));

  // The host cutting the clock short — "Next" on a reveal, "Skip" while
  // people are still answering. Both are the same thing: run what this phase
  // was going to do when its time ran out.
  //
  // This replaced a list of four phase names. There are fourteen reveals, so
  // the button did nothing on ten of them, and no phase anyone was still
  // answering in could be cut short at all — a table that had all answered a
  // typed round sat watching eighty seconds of clock. Running the phase's own
  // callback means there is no second route through the game to keep in step,
  // and a round type added later needs nothing here. Every callback already
  // guards on the phase it belongs to, so a stale one does nothing.
  socket.on('next', (_, cb) => {
    if (!host()) return reply(cb, { error: 'host' });
    // A double tap is not a mistake worth a message: the first tap moved the
    // screen on. Without the throttle the second one would run the next
    // phase's clock too, and a reveal would skip straight past the scores.
    if (limited('next', 500)) return reply(cb, { ok: true });
    const fn = room.onTime;
    if (!fn || room.phase === 'lobby' || room.phase === 'final') return reply(cb, { error: 'late' });
    noteEnd(room, 'host');
    clearTimer(room);
    fn();
    reply(cb, { ok: true });
  });
  socket.on('end', (_, cb) => { if (host() && room.phase !== 'lobby') finishGame(room); reply(cb, { ok: true }); });
  socket.on('lobby', (_, cb) => { if (host()) backToLobby(room); reply(cb, { ok: true }); });

  socket.on('kick', (pid, cb) => {
    if (!host() || pid === player.id) return reply(cb, { error: 'host' });
    const t = room.players.get(pid);
    if (!t) return;
    if (t.socketId) io.to(t.socketId).emit('kicked');
    room.players.delete(pid);
    checkProgress(room); broadcast(room);
    reply(cb, { ok: true });
  });

  socket.on('makeHost', (pid, cb) => {
    if (!host()) return reply(cb, { error: 'host' });
    const t = room.players.get(pid);
    if (!t || !t.connected || pid === player.id) return reply(cb, { error: 'bad' });
    room.hostId = pid;
    broadcast(room);
    reply(cb, { ok: true });
  });

  socket.on('react', e => {
    if (!room || !player || !REACTIONS.includes(e) || limited('react', 350)) return;
    io.to(room.code).emit('react', { pid: player.id, e });
  });
  socket.on('typing', () => {
    if (!room || !player || !['write', 'guess', 'spyClue'].includes(room.phase) || limited('typing', 900)) return;
    socket.to(room.code).emit('typing', player.id);
  });
  socket.on('poke', target => {
    if (!room || !player || !room.players.has(target) || limited('poke', 700)) return;
    io.to(room.code).emit('poke', { from: player.id, to: target });
  });

  // ---- social ----
  socket.on('team', team => {
    if (!room || !player || room.phase !== 'lobby' || !room.settings.teams || !['A', 'B'].includes(team)) return;
    player.team = team; broadcast(room);
  });
  socket.on('ready', () => {
    if (!room || !player || room.phase !== 'lobby' || limited('ready', 300)) return;
    player.ready = !player.ready; broadcast(room);
  });
  socket.on('pump', () => {
    if (!room || !player || room.phase !== 'lobby' || limited('pump', 110)) return;
    const b = room.balloon;
    b.size += 1;
    if (b.size >= b.target) {
      b.pops[player.id] = (b.pops[player.id] || 0) + 1;
      b.size = 0; b.target = 20 + rnd(25);
      io.to(room.code).emit('pop', { by: player.id, pops: b.pops });
    } else io.to(room.code).emit('balloon', { size: b.size, by: player.id });
  });
  socket.on('say', i => {
    if (!room || !player || !Number.isInteger(i) || i < 0 || i >= PHRASES || limited('say', 1500)) return;
    io.to(room.code).emit('say', { pid: player.id, i });
  });
  socket.on('laugh', optionId => {
    if (!room || !player || room.phase !== 'bluffReveal' || limited('laugh', 250)) return;
    const c = room.current;
    const o = c.options.find(x => x.id === optionId);
    if (!o || o.truth || !o.authors.length || o.authors.includes(player.id)) return;
    c.laughs = c.laughs || {};
    c.laughs[player.id] = optionId;
    io.to(room.code).emit('laughs', laughCounts(c));
  });

  socket.on('leave', () => leave(false));
  socket.on('disconnect', () => { if (player && player.socketId === socket.id) leave(true); });

  // A player who drops out of the lobby and does not come back is a ghost:
  // an empty seat that still counts towards the room. We wait long enough for
  // a page refresh or a phone waking up, then clear it. Mid-game seats are
  // never swept, because the score in them belongs to someone.
  function sweepGhost(r, pid) {
    setTimeout(() => {
      const cur = r.players.get(pid);
      if (!cur || cur.connected || r.phase !== 'lobby') return;
      r.players.delete(pid);
      if (r.hostId === pid) { const n = humans(r).find(x => x.connected); if (n) r.hostId = n.id; }
      if (rooms.has(r.code)) broadcast(r);
    }, GHOST_MS);
  }

  function leave(soft) {
    if (!room || !player) return;
    const r = room, p = player;
    p.connected = false; p.socketId = null;
    if (r.phase !== 'lobby' && r.phase !== 'final') p.leftRound = r.round;
    socket.leave(r.code);
    if (!soft && r.phase === 'lobby') r.players.delete(p.id);
    else if (soft && r.phase === 'lobby') sweepGhost(r, p.id);
    if (r.hostId === p.id) { const n = humans(r).find(x => x.connected); if (n) r.hostId = n.id; }
    checkProgress(r); broadcast(r);
    room = null; player = null;
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    const people = humans(r);
    if (!people.some(p => p.connected)) {
      // Bots do not keep a room alive, and they do not outlive the last
      // person in it either.
      if (r.players.size !== people.length) dropBots(r);
      if (now - r.touched > (people.length ? ROOM_TTL_MS : 5 * 60 * 1000)) { clearTimer(r); rooms.delete(code); forgetRoom(code); }
    }
  }
  for (const [instanceId, code] of discordInstanceRooms) {
    if (!rooms.has(code)) discordInstanceRooms.delete(instanceId);
  }
}, 60 * 1000);

}
