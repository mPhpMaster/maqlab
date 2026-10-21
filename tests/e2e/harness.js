// Plays real games against a real server, over real sockets, with signed-in
// players. Each player reads only its own snapshot and answers through the
// same events a phone sends, so a phase the client could not get through is
// a phase these players cannot get through either.
//
// Whoever is host presses "next" on every screen that is waiting to move on,
// so a game takes seconds rather than its full clocks.
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..', '..');
const SECRET = 'e2e-' + process.pid;
process.env.SESSION_SECRET = SECRET;
const { session } = require('../helpers/session');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// No DATABASE_URL: every game here also runs the "database is down" path,
// which is the one players hit when Neon is unreachable.
// Pass { db } to run against a real Postgres (the restart test needs one).
async function startServer(port, { db = '' } = {}) {
  const env = { ...process.env, PORT: String(port), SESSION_SECRET: SECRET, DATABASE_URL: db, NEON_DATABASE_URL: '' };
  // E2E_SERVER lets the suite be pointed at another build, to show it fails on one.
  const proc = spawn(process.execPath, [process.env.E2E_SERVER || 'server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 300 && !log.includes('running on'); i++) await sleep(50);
  if (!log.includes('running on')) { proc.kill(); throw new Error('server did not start:\n' + log); }
  const exited = new Promise(r => proc.on('exit', code => r(code)));
  // stop() is a deploy (SIGTERM, which Windows can only deliver as a kill);
  // it resolves with the exit code once the process is gone.
  const stop = (signal = 'SIGTERM') => { proc.kill(signal); return exited; };
  return { url: `http://localhost:${port}`, log: () => log, stop };
}

const call = (s, ev, arg, ms = 3000) => new Promise(r => {
  const t = setTimeout(() => r({ error: 'no reply' }), ms);
  s.emit(ev, arg, d => { clearTimeout(t); r(d); });
});

// One player: a socket, the latest snapshot it was sent, and the answer it
// gives in each phase. `seen` holds every phase it was shown, for the tests.
function player(url, id) {
  const p = { id, sock: null, s: null, me: null, token: null, code: null, done: new Set(), seen: new Set(), errors: [] };
  attach(p, url);
  return p;
}
function attach(p, url) {
  p.sock = io(url, { auth: { token: session(p.id, p.id) }, transports: ['websocket'], forceNew: true, reconnection: false });
  p.sock.on('room', s => {
    p.s = s;
    p.seen.add(s.phase);
    const mine = s.players.find(x => x.userId === p.id);
    if (mine) p.me = mine.id;
    act(p);
  });
}

// What the client does after a restart: a new socket, then join with the
// seat token the first join handed back.
async function rejoin(p, url) {
  p.sock.removeAllListeners();
  p.sock.disconnect();
  attach(p, url);
  for (let i = 0; i < 100 && !p.sock.connected; i++) await sleep(50);
  const r = await call(p.sock, 'join', { code: p.code, token: p.token });
  if (r.error) throw new Error(`${p.id} rejoin failed: ${r.error}`);
  return r;
}

// Answers once per phase and item. Anything the server refuses is recorded,
// apart from "late" and "dup", which are races the real client also loses.
function act(p) {
  const s = p.s, c = s && s.current;
  if (!s || !p.me || !c || !p.sock.connected || p.silent) return;
  const key = `${s.gameNo}:${s.round}:${s.phase}:${c.idx ?? ''}`;
  if (p.done.has(key)) return;
  const others = s.players.filter(x => x.connected && x.id !== p.me);
  const pick = list => (list || []).find(o => !o.hidden && !o.mine);
  const send = (ev, arg) => {
    p.done.add(key);
    p.sock.emit(ev, arg, r => {
      if (r && r.error && !['late', 'dup'].includes(r.error)) p.errors.push(`${s.phase} ${ev}: ${r.error}`);
    });
  };
  switch (s.phase) {
    case 'write': return send('lie', `made up by ${p.id} ${s.round}`);
    case 'vote': { const o = pick(c.options); return o && send('vote', { id: o.id, bet: 1 }); }
    case 'guess': return send('guess', 42);
    case 'blitz': return send('blitz', true);
    case 'emoji': case 'odd': { const o = pick(c.options); return o && send(s.phase, o.id); }
    case 'order': return send('order', c.items.map(i => i.id));
    case 'likelyVote': return others[0] && send('likely', others[0].id);
    case 'spyClue': return send('spyClue', `clue ${p.id}`);
    case 'spyVote': return others[0] && send('spyVote', others[0].id);
    case 'manyAsk': return send('many', true);
    case 'manyGuess': return send('manyGuess', 1);
    case 'nameWrite': return send('name', 'apple');
    case 'twoWrite': return send('two', { lines: ['one true', 'two true', 'a lie'], lie: 2 });
    case 'twoGuess': return c.whose !== p.me && send('twoGuess', 0);
    case 'minorPick': return send('minor', 'a');
    case 'higherPick': return send('higher', 'left');
    case 'missPick': return c.items[0] && send('miss', c.items[0].id);
    default: return undefined;
  }
}

// Sets up a room, plays one game and reports how it went.
//   n        number of human players
//   types    modes to enable (default: all)
//   rounds   3, 5, 8 or 12
//   during   optional async (players, room) => {} run once, when `when` first holds
//   when     (room) => bool, default: from round 2 on
//   silent   indexes of players who never answer
async function playGame(url, { n, types, rounds = 3, tag = 'g', during, when = s => s.round >= 2, silent = [], keepOpen = false, timeoutMs = 90000 }) {
  const players = Array.from({ length: n }, (_, i) => player(url, `${tag}-p${i}`));
  for (const i of silent) players[i].silent = true;
  const close = () => players.forEach(p => p.sock.disconnect());
  try {
    for (let i = 0; i < 100 && !players.every(p => p.sock.connected); i++) await sleep(50);
    const [host] = players;
    const made = await call(host.sock, 'create', { lang: 'en' });
    if (!made.code) throw new Error('create failed: ' + JSON.stringify(made));
    for (const p of players) {
      const r = await call(p.sock, 'join', { code: made.code });
      if (r.error) throw new Error(`${p.id} join failed: ${r.error}`);
      p.token = r.token; p.code = made.code;
    }
    const patch = { rounds, pace: 'fast' };
    if (types) patch.types = Object.fromEntries(types.map(t => [t, true]));
    const set = await call(host.sock, 'settings', patch);
    if (set.error) throw new Error('settings failed: ' + set.error);
    const started = await call(host.sock, 'start');
    if (started.error) throw new Error('start failed: ' + started.error);

    const end = Date.now() + timeoutMs;
    let ran = false, lastNext = 0;
    // How long the table sat in each phase. Everyone here answers at once, so
    // an answering phase that lasts seconds is one waiting out its clock.
    const longest = {}; let cur = null, since = Date.now();
    const live = () => players.filter(p => p.sock.connected);
    while (Date.now() < end) {
      const watcher = live()[0];
      const s = watcher && watcher.s;
      if (!s) { await sleep(50); continue; }
      const phaseKey = `${s.round}:${s.phase}:${s.current ? s.current.idx ?? '' : ''}`;
      if (phaseKey !== cur) {
        if (cur) { const ph = cur.split(':')[1]; longest[ph] = Math.max(longest[ph] || 0, Date.now() - since); }
        cur = phaseKey; since = Date.now();
      }
      if (s.phase === 'final') break;
      if (during && !ran && when(s)) { ran = true; await during(players, s); }
      // The host presses next on anything waiting to move on. After a host
      // leaves, the new host is whoever the server says it is.
      const host2 = live().find(p => p.s && p.me && p.s.hostId === p.me);
      if (host2 && host2.s.phase !== 'lobby' && Date.now() - lastNext > 600) {
        const waiting = host2.s.clock === 'next' || ['spin', 'missWatch'].includes(host2.s.phase);
        if (waiting) { lastNext = Date.now(); host2.sock.emit('next', null, () => {}); }
      }
      live().filter(p => !p.silent).forEach(act);
      await sleep(100);
    }
    const s = live()[0] && live()[0].s;
    const seen = new Set(players.flatMap(p => [...p.seen]));
    return {
      code: made.code,
      final: !!s && s.phase === 'final',
      phase: s && s.phase,
      round: s && s.round,
      hostId: s && s.hostId,
      longest,
      seen,
      errors: [...new Set(players.flatMap(p => p.errors))],
      players,
    };
  } finally {
    // keepOpen leaves the sockets up for checks after the game; the caller closes them.
    if (!keepOpen) close();
  }
}

// A new player arriving in a room that is already playing.
async function joinLate(url, id, code) {
  const p = player(url, id);
  for (let i = 0; i < 100 && !p.sock.connected; i++) await sleep(50);
  const r = await call(p.sock, 'join', { code });
  if (r.error) throw new Error(`${id} late join failed: ${r.error}`);
  p.token = r.token; p.code = code;
  await sleep(300);
  return p;
}

module.exports = { startServer, playGame, rejoin, joinLate, call, sleep };
