const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const content = require('./content');
const db = require('./db');
const auth = require('./auth');
const achievements = require('./achievements');

const PORT = process.env.PORT || 3000;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_PLAYERS = 12;
const ROOM_TTL_MS = 30 * 60 * 1000;
const ITEMS_PER_QUICK_ROUND = 3; // blitz & emoji rounds have 3 quick items
const REACTIONS = ['😂', '🔥', '😱', '👏', '🤡', '💀', '😈', '❤️'];
const TYPES = ['bluff', 'number', 'blitz', 'likely', 'emoji', 'spy'];
const ACTIVE = ['write', 'vote', 'guess', 'blitz', 'likelyVote', 'emoji', 'spyClue', 'spyVote'];
const PHRASES = 12; // number of preset taunts the client knows

const T = {
  chill: { spin: 6, write: 70, vote: 35, guess: 35, blitz: 10, blitzResult: 3.5, numReveal: 9, scores: 12, likelyVote: 30, likelyReveal: 9, emoji: 15, emojiResult: 3.5, spyClue: 50, spyVote: 30, spyReveal: 10 },
  normal: { spin: 6, write: 45, vote: 25, guess: 25, blitz: 8, blitzResult: 3, numReveal: 8, scores: 10, likelyVote: 20, likelyReveal: 8, emoji: 10, emojiResult: 3, spyClue: 35, spyVote: 20, spyReveal: 9 },
  fast: { spin: 5.5, write: 30, vote: 15, guess: 15, blitz: 5, blitzResult: 2.5, numReveal: 7, scores: 8, likelyVote: 14, likelyReveal: 7, emoji: 7, emojiResult: 2.5, spyClue: 22, spyVote: 13, spyReveal: 7 },
};
const MODS = [
  { id: 'normal', w: 50, mult: 1 },
  { id: 'double', w: 20, mult: 2 },
  { id: 'speed', w: 15, mult: 1.5 },
  { id: 'jackpot', w: 15, mult: 1 },
];

const rooms = new Map();
const discordInstanceRooms = new Map(); // Discord Activity instanceId -> room code, so a whole voice channel lands in one room

// ---------------- helpers ----------------
const rid = (n = 16) => crypto.randomBytes(24).toString('base64url').slice(0, n);
const rnd = n => Math.floor(Math.random() * n);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => CODE_CHARS[rnd(CODE_CHARS.length)]).join(''); } while (rooms.has(c));
  return c;
}

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/(^|\s)(ال|the |a |an )/g, '$1')
    .replace(/[^\p{L}\p{N}.]+/gu, '')
    .trim();
}
function isTruth(text, q) {
  const n = normalize(text);
  return [q.a.ar, q.a.en, ...(q.alt || [])].some(v => normalize(v) === n);
}
function cleanAvatar(a) {
  const n = (v, max) => { v = Math.floor(Number(v)); return Number.isFinite(v) && v >= 0 ? v % max : 0; };
  a = a && typeof a === 'object' ? a : {};
  return { s: n(a.s, 6), c: n(a.c, 14), e: n(a.e, 10), m: n(a.m, 10), h: n(a.h, 12) };
}
const connected = room => [...room.players.values()].filter(p => p.connected);
const freshStats = () => ({ fooled: 0, correct: 0, snipes: 0, bullseyes: 0, fastest: 0, highBets: 0, bestStreak: 0, famous: 0, spyCaught: 0, spyEvaded: 0 });
const freshPowers = () => ({ peek: 1, double: 1 });

// ---------------- snapshots ----------------
function publicPlayer(p) {
  return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.connected, streak: p.streak, powers: p.powers, team: p.team, ready: p.ready, userId: p.userId || null };
}

function snapshot(room, pid) {
  const c = room.current;
  const s = {
    code: room.code, hostId: room.hostId, phase: room.phase, settings: room.settings,
    players: [...room.players.values()].map(publicPlayer),
    round: room.round, gameNo: room.gameNo, deadline: room.deadline, now: Date.now(),
    teamScores: teamScores(room), balloon: { size: room.balloon.size, pops: room.balloon.pops },
  };
  if (!c) return s;
  const L = room.settings.lang, ph = room.phase;
  s.current = { type: c.type, mod: c.mod, doubled: Object.keys(c.doubled || {}) };
  const peeked = key => (c.peeked[pid] && c.peeked[pid].key === key ? c.peeked[pid].ids : []);

  if (c.type === 'bluff' && ['write', 'vote', 'bluffReveal'].includes(ph)) {
    s.current.question = c.q.q[L];
    s.current.submitted = Object.keys(c.lies);
    s.current.myLie = c.lies[pid] || null;
    if (ph === 'vote') {
      const hidden = peeked('vote');
      s.current.options = c.options.map(o => ({ id: o.id, text: o.text, mine: o.authors.includes(pid), hidden: hidden.includes(o.id) }));
      s.current.voted = Object.keys(c.votes);
      s.current.myVote = c.votes[pid] || null;
    }
    if (ph === 'bluffReveal') {
      s.current.options = c.options.map(o => ({
        id: o.id, text: o.text, truth: o.truth, authors: o.authors,
        voters: Object.entries(c.votes).filter(([, v]) => v.id === o.id).map(([vid, v]) => ({ id: vid, bet: v.bet })),
      }));
      s.current.laughs = laughCounts(c);
      s.current.myLaugh = (c.laughs || {})[pid] || null;
    }
  }
  if (c.type === 'number' && ['guess', 'numReveal'].includes(ph)) {
    s.current.question = c.q.q[L];
    s.current.unit = c.q.unit ? c.q.unit[L] : '';
    s.current.submitted = Object.keys(c.guesses);
    s.current.myGuess = c.guesses[pid] ?? null;
    if (ph === 'numReveal') { s.current.answer = c.q.a; s.current.results = c.numResults; }
  }
  if (c.type === 'blitz' && ['blitz', 'blitzResult'].includes(ph)) {
    const st = c.items[c.idx];
    Object.assign(s.current, { idx: c.idx, total: c.items.length, statement: st.s[L] });
    const ans = c.answers[c.idx];
    s.current.answered = Object.keys(ans);
    s.current.myAnswer = ans[pid] ? ans[pid].v : null;
    if (ph === 'blitzResult') Object.assign(s.current, { truth: st.t, results: ans, fastest: c.fastest[c.idx] || null });
  }
  if (c.type === 'emoji' && ['emoji', 'emojiResult'].includes(ph)) {
    const it = c.items[c.idx];
    const hidden = peeked('e' + c.idx);
    Object.assign(s.current, { idx: c.idx, total: c.items.length, emoji: it.e });
    s.current.options = it.opts.map(o => ({ id: o.id, text: o.text[L], hidden: hidden.includes(o.id) }));
    const ans = c.answers[c.idx];
    s.current.answered = Object.keys(ans);
    s.current.myAnswer = ans[pid] ? ans[pid].id : null;
    if (ph === 'emojiResult') Object.assign(s.current, { correctId: it.correctId, results: ans, fastest: c.fastest[c.idx] || null });
  }
  if (c.type === 'likely' && ['likelyVote', 'likelyReveal'].includes(ph)) {
    s.current.prompt = c.prompt[L];
    s.current.voted = Object.keys(c.lvotes);
    s.current.myVote = c.lvotes[pid] || null;
    if (ph === 'likelyReveal') Object.assign(s.current, { votes: c.lvotes, tally: c.tally, winners: c.winners });
  }
  if (c.type === 'spy' && ['spyClue', 'spyVote', 'spyReveal'].includes(ph)) {
    const amSpy = pid === c.spyId;
    Object.assign(s.current, { amSpy, category: c.cat[L] });
    if (!amSpy && ph !== 'spyReveal') s.current.word = c.word[L];
    s.current.submitted = Object.keys(c.clues);
    s.current.myClue = c.clues[pid] || null;
    if (ph === 'spyVote' || ph === 'spyReveal') {
      s.current.clues = Object.entries(c.clues).map(([id, text]) => ({ id, text }));
      s.current.voted = Object.keys(c.votes);
      s.current.myVote = c.votes[pid] || null;
      if (amSpy) s.current.myGuess = c.guess;
    }
    if (ph === 'spyReveal') {
      Object.assign(s.current, { spyId: c.spyId, word: c.word[L], tally: c.tally, votes: c.votes, caught: c.caught, guess: c.guess, guessRight: c.guessRight });
    }
  }
  if (ph === 'scores' || ph === 'final') { s.gains = room.gains; s.prevRank = room.prevRank; }
  if (ph === 'final') { s.awards = room.awards; s.bestLie = room.bestLie; s.rivals = room.rivals; }
  return s;
}

function teamScores(room) {
  if (!room.settings.teams) return null;
  const t = { A: 0, B: 0 };
  for (const p of room.players.values()) if (p.team && (p.connected || p.score)) t[p.team] += p.score;
  return t;
}
function laughCounts(c) {
  const n = {};
  for (const id of Object.values(c.laughs || {})) n[id] = (n[id] || 0) + 1;
  return n;
}
function smallerTeam(room) {
  const ps = connected(room);
  return ps.filter(p => p.team === 'A').length <= ps.filter(p => p.team === 'B').length ? 'A' : 'B';
}
function balanceTeams(room) {
  const ps = shuffle(connected(room));
  for (const p of ps) if (!p.team) p.team = smallerTeam(room);
  // neither team may be empty when there are 2+ players
  const a = ps.filter(p => p.team === 'A'), b = ps.filter(p => p.team === 'B');
  if (ps.length > 1 && !a.length) b[0].team = 'A';
  if (ps.length > 1 && !b.length) a[0].team = 'B';
}

function broadcast(room) {
  room.touched = Date.now();
  for (const p of room.players.values()) if (p.socketId) io.to(p.socketId).emit('room', snapshot(room, p.id));
}

function clearTimer(room) { if (room.timer) clearTimeout(room.timer); room.timer = null; }
function setTimer(room, sec, fn) {
  clearTimer(room);
  room.deadline = Date.now() + sec * 1000;
  room.timer = setTimeout(fn, sec * 1000);
}
const pace = (room, key) => {
  const base = T[room.settings.pace][key];
  const short = room.current && room.current.mod === 'speed' && ACTIVE.includes(key);
  return short ? Math.max(4, Math.round(base * 0.6)) : base;
};

// ---------------- scoring ----------------
function gain(room, pid, key, base, applyMult = true) {
  if (!room.players.has(pid)) return;
  const v = applyMult && base > 0 ? Math.round((base * room.current.mult) / 10) * 10 : base;
  const g = room.gains[pid] || (room.gains[pid] = { total: 0, items: [] });
  const ex = g.items.find(i => i.k === key);
  if (ex) ex.v += v; else g.items.push({ k: key, v });
  g.total += v;
}

function streakResult(room, pid, success) {
  const p = room.players.get(pid);
  if (!p) return;
  if (success) {
    p.streak += 1;
    p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
    if (p.streak >= 2) gain(room, pid, 'streak', Math.min(500, 100 * (p.streak - 1)));
  } else p.streak = 0;
}

function finishRound(room) {
  const c = room.current;
  // 💎 double power-up: doubles that player's positive round total
  for (const pid of Object.keys(c.doubled)) {
    const g = room.gains[pid];
    if (g && g.total > 0) gain(room, pid, 'double', g.total, false);
  }
  // 🎁 jackpot: round's biggest earner gets a mystery bonus
  if (c.mod === 'jackpot') {
    const best = Object.entries(room.gains).filter(([, g]) => g.total > 0).sort((a, b) => b[1].total - a[1].total)[0];
    if (best) gain(room, best[0], 'jackpot', 500 + rnd(21) * 50, false);
  }
  for (const [pid, g] of Object.entries(room.gains)) {
    const p = room.players.get(pid);
    if (p) p.score = Math.max(0, p.score + g.total);
  }
}

// ---------------- game flow ----------------
function createRoom() {
  const room = {
    code: newCode(), hostId: null, phase: 'lobby',
    settings: { lang: 'ar', rounds: 8, types: { bluff: true, number: true, blitz: true, likely: true, emoji: true, spy: true }, pace: 'normal', teams: false, public: true },
    players: new Map(), round: 0, gameNo: 0, current: null, deadline: null, timer: null,
    used: {}, plan: [], gains: {}, prevRank: {}, awards: [], bestLie: null, pairs: {}, rivals: {}, touched: Date.now(),
    balloon: { size: 0, target: 20 + rnd(20), pops: {} },
  };
  rooms.set(room.code, room);
  return room;
}

// Plan the whole game up front: bluff first, no back-to-back repeats,
// bluff weighted double, and every enabled type shows up at least once.
function planTypes(room) {
  let enabled = TYPES.filter(t => room.settings.types[t]);
  const crowd = connected(room).length;
  // "who's most likely" needs a crowd
  if (crowd < 3 && enabled.length > 1) enabled = enabled.filter(t => t !== 'likely');
  // spy needs a spy + a few civilians to be worth playing
  if (crowd < 4 && enabled.length > 1) enabled = enabled.filter(t => t !== 'spy');
  const n = room.settings.rounds, plan = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 && enabled.includes('bluff')) { plan.push('bluff'); continue; }
    const pool = enabled.filter(t => enabled.length === 1 || t !== plan[i - 1]);
    const weighted = pool.flatMap(t => (t === 'bluff' ? [t, t] : [t]));
    plan.push(weighted[rnd(weighted.length)]);
  }
  for (const t of enabled) {
    if (plan.includes(t)) continue;
    const spots = plan.map((_, i) => i).filter(i => i > 0 && plan.filter(y => y === plan[i]).length > 1 && plan[i - 1] !== t && plan[i + 1] !== t);
    if (spots.length) plan[spots[rnd(spots.length)]] = t;
  }
  return plan;
}

function chooseMod(room) {
  if (room.round === room.settings.rounds) return { id: 'golden', mult: 3 };
  if (room.round === 1) return MODS[0];
  const total = MODS.reduce((n, m) => n + m.w, 0);
  let r = rnd(total);
  for (const m of MODS) if ((r -= m.w) < 0) return m;
  return MODS[0];
}

function pickFrom(room, type, count = 1) {
  const bank = content[type];
  const used = room.used[type] || (room.used[type] = new Set());
  let idx = bank.map((_, i) => i).filter(i => !used.has(i));
  if (idx.length < count) { used.clear(); idx = bank.map((_, i) => i); }
  const chosen = shuffle(idx).slice(0, count);
  chosen.forEach(i => used.add(i));
  return chosen.map(i => bank[i]);
}

function startGame(room) {
  Object.assign(room, { round: 0, gameNo: room.gameNo + 1, gains: {}, awards: [], bestLie: null, used: {} });
  for (const p of room.players.values()) { p.score = 0; p.streak = 0; p.stats = freshStats(); p.powers = freshPowers(); }
  room.pairs = {}; room.rivals = {};
  for (const p of room.players.values()) p.ready = false;
  if (room.settings.teams) balanceTeams(room); else for (const p of room.players.values()) p.team = null;
  room.plan = planTypes(room);
  nextRound(room);
}

function rankMap(room) {
  const m = {};
  [...room.players.values()].sort((a, b) => b.score - a.score).forEach((p, i) => { m[p.id] = i; });
  return m;
}

function nextRound(room) {
  if (room.round >= room.settings.rounds) return finishGame(room);
  room.round += 1;
  const mod = chooseMod(room);
  room.gains = {};
  room.prevRank = rankMap(room);
  room.current = { type: room.plan[room.round - 1], mod: mod.id, mult: mod.mult, doubled: {}, peeked: {} };
  room.phase = 'spin';
  setTimer(room, pace(room, 'spin'), () => beginRound(room));
  broadcast(room);
}

function beginRound(room) {
  const c = room.current;
  if (c.type === 'bluff') {
    Object.assign(c, { q: pickFrom(room, 'bluff')[0], lies: {}, votes: {}, options: [] });
    room.phase = 'write';
    setTimer(room, pace(room, 'write'), () => startVote(room));
  } else if (c.type === 'number') {
    Object.assign(c, { q: pickFrom(room, 'number')[0], guesses: {} });
    room.phase = 'guess';
    setTimer(room, pace(room, 'guess'), () => revealNumber(room));
  } else if (c.type === 'likely') {
    Object.assign(c, { prompt: pickFrom(room, 'likely')[0], lvotes: {} });
    room.phase = 'likelyVote';
    setTimer(room, pace(room, 'likelyVote'), () => revealLikely(room));
  } else if (c.type === 'blitz') {
    Object.assign(c, { items: pickFrom(room, 'blitz', ITEMS_PER_QUICK_ROUND), idx: 0, fastest: [], correctCount: {} });
    c.answers = c.items.map(() => ({}));
    return startQuickItem(room);
  } else if (c.type === 'spy') {
    const ps = connected(room);
    if (!ps.length) return; // everyone left mid-round; room will be reaped by the cleanup sweep
    const entry = pickFrom(room, 'spy')[0];
    const spyId = ps[rnd(ps.length)].id;
    Object.assign(c, { word: entry.w, cat: entry.cat, spyId, clues: {}, votes: {}, guess: null });
    room.phase = 'spyClue';
    setTimer(room, pace(room, 'spyClue'), () => startSpyVote(room));
  } else {
    const items = pickFrom(room, 'emoji', ITEMS_PER_QUICK_ROUND).map(it => {
      const opts = shuffle([{ text: it.a, ok: true }, ...it.d.map(d => ({ text: d }))]).map(o => ({ ...o, id: rid(6) }));
      return { e: it.e, opts, correctId: opts.find(o => o.ok).id };
    });
    Object.assign(c, { items, idx: 0, fastest: [], correctCount: {} });
    c.answers = c.items.map(() => ({}));
    return startQuickItem(room);
  }
  broadcast(room);
}

// ----- bluff -----
function submitLie(room, p, text) {
  if (room.phase !== 'write') return { error: 'late' };
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!text) return { error: 'empty' };
  if (isTruth(text, room.current.q)) return { error: 'truth' };
  room.current.lies[p.id] = text;
  if (connected(room).every(x => room.current.lies[x.id])) startVote(room); else broadcast(room);
  return { ok: true };
}

function startVote(room) {
  if (room.phase !== 'write') return;
  const c = room.current, L = room.settings.lang;
  const opts = [{ id: rid(6), text: c.q.a[L], truth: true, authors: [] }];
  for (const [pid, text] of Object.entries(c.lies)) {
    const same = opts.find(o => normalize(o.text) === normalize(text));
    if (same) { if (!same.truth) same.authors.push(pid); } else opts.push({ id: rid(6), text, truth: false, authors: [pid] });
  }
  const decoys = { ar: ['لا أحد يعرف', 'قطعة جبن', 'بطريق', 'ملعقة'], en: ['Nobody knows', 'A piece of cheese', 'A penguin', 'A spoon'] };
  while (opts.length < 3) opts.push({ id: rid(6), text: decoys[L][opts.length], truth: false, authors: [], house: true });
  c.options = shuffle(opts);
  room.phase = 'vote';
  setTimer(room, pace(room, 'vote'), () => revealBluff(room));
  broadcast(room);
}

function submitVote(room, p, optionId, bet) {
  if (room.phase !== 'vote') return { error: 'late' };
  const opt = room.current.options.find(o => o.id === optionId);
  if (!opt) return { error: 'bad' };
  if (opt.authors.includes(p.id)) return { error: 'own' };
  bet = [1, 2, 3].includes(bet) ? bet : 1;
  room.current.votes[p.id] = { id: optionId, bet };
  if (connected(room).every(x => room.current.votes[x.id])) revealBluff(room); else broadcast(room);
  return { ok: true };
}

function revealBluff(room) {
  if (room.phase !== 'vote') return;
  const c = room.current;
  for (const p of connected(room)) {
    const v = c.votes[p.id];
    if (!v) { streakResult(room, p.id, false); continue; }
    const opt = c.options.find(o => o.id === v.id);
    if (v.bet > 1) p.stats.highBets += 1;
    if (opt.truth) {
      gain(room, p.id, 'correct', 500 * v.bet);
      p.stats.correct += 1;
      streakResult(room, p.id, true);
    } else {
      if (v.bet > 1) gain(room, p.id, 'betLoss', -150 * (v.bet - 1), false);
      for (const a of opt.authors) {
        gain(room, a, 'fooled', 300);
        const ap = room.players.get(a); if (ap) ap.stats.fooled += 1;
        const row = room.pairs[p.id] || (room.pairs[p.id] = {}); row[a] = (row[a] || 0) + 1;
      }
      streakResult(room, p.id, false);
    }
  }
  for (const o of c.options) {
    if (o.truth || !o.authors.length) continue;
    const fooled = Object.values(c.votes).filter(v => v.id === o.id).length;
    if (fooled && (!room.bestLie || fooled > room.bestLie.fooled)) room.bestLie = { text: o.text, authors: o.authors, fooled };
  }
  finishRound(room);
  room.phase = 'bluffReveal';
  setTimer(room, 5 + c.options.filter(o => !o.truth).length * 2.4, () => showScores(room));
  broadcast(room);
}

// ----- number -----
function submitGuess(room, p, val) {
  if (room.phase !== 'guess') return { error: 'late' };
  const n = Number(String(val).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return { error: 'nan' };
  room.current.guesses[p.id] = n;
  if (connected(room).every(x => room.current.guesses[x.id] != null)) revealNumber(room); else broadcast(room);
  return { ok: true };
}

function revealNumber(room) {
  if (room.phase !== 'guess') return;
  const c = room.current, a = c.q.a;
  const list = Object.entries(c.guesses).map(([pid, g]) => ({ pid, g, diff: Math.abs(g - a) })).sort((x, y) => x.diff - y.diff);
  let rank = -1, prev = null;
  list.forEach((r, i) => { if (r.diff !== prev) { rank = i; prev = r.diff; } r.rank = rank; r.bull = r.diff <= a * 0.01 && (a >= 100 || r.diff === 0); });
  const podium = list.length >= 4 ? 3 : list.length >= 2 ? 2 : 1;
  for (const r of list) {
    const p = room.players.get(r.pid);
    if (!p) continue;
    if (r.bull) { gain(room, r.pid, 'bullseye', 1000); p.stats.bullseyes += 1; p.stats.snipes += 1; streakResult(room, r.pid, true); }
    else if (r.rank === 0 && r.rank < podium) { gain(room, r.pid, 'closest', 600); p.stats.snipes += 1; streakResult(room, r.pid, true); }
    else if (r.rank === 1 && r.rank < podium) { gain(room, r.pid, 'second', 300); streakResult(room, r.pid, false); }
    else if (r.rank === 2 && r.rank < podium) { gain(room, r.pid, 'third', 150); streakResult(room, r.pid, false); }
    else streakResult(room, r.pid, false);
  }
  for (const p of connected(room)) if (c.guesses[p.id] == null) streakResult(room, p.id, false);
  c.numResults = list;
  finishRound(room);
  room.phase = 'numReveal';
  setTimer(room, pace(room, 'numReveal'), () => showScores(room));
  broadcast(room);
}

// ----- who's most likely -----
function submitLikely(room, p, target) {
  if (room.phase !== 'likelyVote') return { error: 'late' };
  if (!room.players.get(target)?.connected) return { error: 'bad' };
  room.current.lvotes[p.id] = target;
  if (connected(room).every(x => room.current.lvotes[x.id])) revealLikely(room); else broadcast(room);
  return { ok: true };
}

function revealLikely(room) {
  if (room.phase !== 'likelyVote') return;
  const c = room.current;
  const tally = {};
  for (const t of Object.values(c.lvotes)) tally[t] = (tally[t] || 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  const winners = max ? Object.keys(tally).filter(k => tally[k] === max) : [];
  for (const p of connected(room)) {
    const v = c.lvotes[p.id];
    const withCrowd = !!v && winners.includes(v);
    if (withCrowd) gain(room, p.id, 'majority', 300);
    streakResult(room, p.id, withCrowd);
  }
  for (const w of winners) { gain(room, w, 'famous', 150); const wp = room.players.get(w); if (wp) wp.stats.famous += 1; }
  Object.assign(c, { tally, winners });
  finishRound(room);
  room.phase = 'likelyReveal';
  setTimer(room, pace(room, 'likelyReveal'), () => showScores(room));
  broadcast(room);
}

// ----- spy -----
function submitSpyClue(room, p, text) {
  if (room.phase !== 'spyClue') return { error: 'late' };
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!text) return { error: 'empty' };
  room.current.clues[p.id] = text;
  if (connected(room).every(x => room.current.clues[x.id])) startSpyVote(room); else broadcast(room);
  return { ok: true };
}

function startSpyVote(room) {
  if (room.phase !== 'spyClue') return;
  room.phase = 'spyVote';
  setTimer(room, pace(room, 'spyVote'), () => revealSpy(room));
  broadcast(room);
}

function submitSpyVote(room, p, targetId) {
  if (room.phase !== 'spyVote') return { error: 'late' };
  if (p.id === targetId) return { error: 'selfvote' };
  if (!room.players.get(targetId)?.connected) return { error: 'bad' };
  room.current.votes[p.id] = targetId;
  if (connected(room).every(x => room.current.votes[x.id])) revealSpy(room); else broadcast(room);
  return { ok: true };
}

function submitSpyGuess(room, p, text) {
  if (room.phase !== 'spyVote') return { error: 'late' };
  if (p.id !== room.current.spyId) return { error: 'bad' };
  if (room.current.guess != null) return { error: 'dup' };
  room.current.guess = String(text || '').trim().slice(0, 40);
  broadcast(room);
  return { ok: true };
}

function spyGuessCorrect(c) {
  if (c.guess == null || !c.guess) return false;
  const n = normalize(c.guess);
  return normalize(c.word.ar) === n || normalize(c.word.en) === n;
}

function revealSpy(room) {
  if (room.phase !== 'spyVote') return;
  const c = room.current, spyId = c.spyId, ps = connected(room);
  const tally = {};
  for (const t of Object.values(c.votes)) tally[t] = (tally[t] || 0) + 1;
  const spyVotes = tally[spyId] || 0;
  const caught = spyVotes * 2 > ps.length;
  const guessRight = spyGuessCorrect(c);
  for (const p of ps) {
    if (p.id === spyId) continue;
    const correct = c.votes[p.id] === spyId;
    if (correct) { gain(room, p.id, 'spyCatch', 350); p.stats.correct += 1; p.stats.spyCaught += 1; }
    streakResult(room, p.id, correct);
  }
  if (room.players.has(spyId)) {
    if (!caught) { gain(room, spyId, 'spyEvade', 500); room.players.get(spyId).stats.spyEvaded += 1; }
    streakResult(room, spyId, !caught);
    if (guessRight) gain(room, spyId, 'spyGuess', 300);
  }
  Object.assign(c, { tally, caught, guessRight });
  finishRound(room);
  room.phase = 'spyReveal';
  setTimer(room, pace(room, 'spyReveal'), () => showScores(room));
  broadcast(room);
}

// ----- quick rounds: blitz (true/false) and emoji (4 options) -----
function startQuickItem(room) {
  const c = room.current;
  c.itemStart = Date.now();
  room.phase = c.type === 'blitz' ? 'blitz' : 'emoji';
  c.itemDur = pace(room, room.phase) * 1000;
  setTimer(room, c.itemDur / 1000, () => resolveQuickItem(room));
  broadcast(room);
}

function submitQuick(room, p, value) {
  const c = room.current;
  if (!c || room.phase !== (c.type === 'blitz' ? 'blitz' : 'emoji')) return { error: 'late' };
  const ans = c.answers[c.idx];
  if (ans[p.id]) return { error: 'dup' };
  if (c.type === 'blitz') ans[p.id] = { v: !!value, t: Date.now() - c.itemStart };
  else {
    if (!c.items[c.idx].opts.some(o => o.id === value)) return { error: 'bad' };
    ans[p.id] = { id: value, t: Date.now() - c.itemStart };
  }
  if (connected(room).every(x => ans[x.id])) resolveQuickItem(room); else broadcast(room);
  return { ok: true };
}

function resolveQuickItem(room) {
  const c = room.current;
  if (room.phase !== 'blitz' && room.phase !== 'emoji') return;
  const ans = c.answers[c.idx];
  const blitz = c.type === 'blitz';
  let fastest = null;
  for (const [pid, a] of Object.entries(ans)) {
    a.correct = blitz ? a.v === c.items[c.idx].t : a.id === c.items[c.idx].correctId;
    if (!a.correct) continue;
    const speed = Math.max(0, 1 - a.t / c.itemDur);
    gain(room, pid, blitz ? 'blitz' : 'emoji', blitz ? 200 : 300);
    gain(room, pid, 'speed', Math.round(speed * (blitz ? 20 : 30)) * 10);
    c.correctCount[pid] = (c.correctCount[pid] || 0) + 1;
    if (!fastest || a.t < ans[fastest].t) fastest = pid;
  }
  if (fastest) { gain(room, fastest, 'fastest', 100); const fp = room.players.get(fastest); if (fp) fp.stats.fastest += 1; }
  c.fastest[c.idx] = fastest;
  room.phase = blitz ? 'blitzResult' : 'emojiResult';
  setTimer(room, pace(room, room.phase), () => {
    if (c.idx + 1 < c.items.length) { c.idx += 1; startQuickItem(room); return; }
    for (const p of connected(room)) {
      const n = c.correctCount[p.id] || 0;
      p.stats.correct += n;
      streakResult(room, p.id, n >= 2);
    }
    finishRound(room);
    showScores(room);
  });
  broadcast(room);
}

// ----- power-ups -----
function usePower(room, p, kind) {
  const c = room.current;
  if (!c || !ACTIVE.includes(room.phase)) return { error: 'late' };
  if (!p.powers || !p.powers[kind]) return { error: 'nopower' };
  if (kind === 'double') {
    if (c.doubled[p.id]) return { error: 'dup' };
    c.doubled[p.id] = true;
  } else if (kind === 'peek') {
    let key, wrong;
    if (room.phase === 'vote') {
      if (c.votes[p.id]) return { error: 'dup' };
      key = 'vote';
      wrong = c.options.filter(o => !o.truth && !o.authors.includes(p.id)).map(o => o.id);
    } else if (room.phase === 'emoji') {
      if (c.answers[c.idx][p.id]) return { error: 'dup' };
      key = 'e' + c.idx;
      wrong = c.items[c.idx].opts.filter(o => !o.ok).map(o => o.id);
    } else return { error: 'nopeek' };
    c.peeked[p.id] = { key, ids: shuffle(wrong).slice(0, 2) };
  } else return { error: 'bad' };
  p.powers[kind] -= 1;
  broadcast(room);
  return { ok: true };
}

// ----- scores / final -----
// funniest lie: laughs collected during the reveal pay out when the scoreboard opens
function payLaughs(room) {
  const c = room.current;
  const counts = laughCounts(c);
  const max = Math.max(0, ...Object.values(counts));
  if (!max) return;
  for (const o of c.options) {
    if (counts[o.id] !== max) continue;
    for (const a of o.authors) {
      gain(room, a, 'funniest', 200, false);
      const p = room.players.get(a); if (p) p.score += 200;
    }
  }
}

function showScores(room) {
  if (!['bluffReveal', 'numReveal', 'blitzResult', 'emojiResult', 'likelyReveal', 'spyReveal'].includes(room.phase)) return;
  if (room.phase === 'bluffReveal') payLaughs(room);
  room.phase = 'scores';
  setTimer(room, pace(room, 'scores'), () => nextRound(room));
  broadcast(room);
}

function computeAwards(room) {
  const ps = [...room.players.values()].filter(p => p.stats);
  const defs = [['liar', 'fooled'], ['detective', 'correct'], ['sniper', 'snipes'], ['lightning', 'fastest'], ['gambler', 'highBets'], ['fire', 'bestStreak'], ['star', 'famous']];
  const out = [];
  for (const [key, stat] of defs) {
    const best = ps.slice().sort((a, b) => b.stats[stat] - a.stats[stat])[0];
    if (best && best.stats[stat] >= (stat === 'bestStreak' ? 2 : 1)) out.push({ key, pid: best.id, value: best.stats[stat] });
  }
  return out;
}

// Lifetime totals are written once, here, and only for signed-in players.
// Guests keep playing exactly as before — they just leave no trace.
async function recordResults(room) {
  if (!db.on()) return;
  const ranked = [...room.players.values()].filter(p => p.score > 0 || p.connected).sort((a, b) => b.score - a.score);
  const top = ranked.length ? ranked[0].score : 0;
  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    if (!p.userId) continue;
    const won = p.score > 0 && p.score === top;
    const awards = room.awards.filter(a => a.pid === p.id).length;
    const game = {
      userId: p.userId, roomCode: room.code, gameNo: room.gameNo, score: p.score,
      place: i + 1, players: ranked.length, rounds: room.settings.rounds, won,
      xp: 50 + Math.floor(p.score / 10) + awards * 100 + (won ? 200 : 0),
      stats: p.stats, achievements: [],
    };
    try {
      if (!await db.recordGame(game)) continue; // already recorded
      const profile = await db.getProfile(p.userId);
      const fresh = profile ? achievements.earned(profile, game) : [];
      if (fresh.length) {
        await db.addAchievements(p.userId, fresh);
        if (p.socketId) io.to(p.socketId).emit('achievements', fresh);
      }
    } catch (e) {
      console.error('could not record game for', p.userId, e.message);
    }
  }
}

function finishGame(room) {
  clearTimer(room);
  room.deadline = null;
  room.awards = computeAwards(room);
  // rivals: who fooled you the most, and who you fooled the most
  room.rivals = {};
  for (const p of room.players.values()) {
    const mine = Object.entries(room.pairs[p.id] || {}).sort((a, b) => b[1] - a[1])[0];
    let victim = null;
    for (const [vid, row] of Object.entries(room.pairs)) if (vid !== p.id && row[p.id] && (!victim || row[p.id] > victim[1])) victim = [vid, row[p.id]];
    if (mine || victim) room.rivals[p.id] = { nemesis: mine ? { id: mine[0], n: mine[1] } : null, victim: victim ? { id: victim[0], n: victim[1] } : null };
  }
  room.phase = 'final';
  broadcast(room);
  recordResults(room).catch(e => console.error('recordResults', e.message));
}

function backToLobby(room) {
  clearTimer(room);
  Object.assign(room, { phase: 'lobby', round: 0, current: null, deadline: null, gains: {}, prevRank: {}, awards: [], bestLie: null });
  for (const p of room.players.values()) { p.score = 0; p.streak = 0; p.powers = freshPowers(); p.ready = false; }
  broadcast(room);
}

function checkProgress(room) {
  const ps = connected(room), c = room.current;
  if (!ps.length || !c) return;
  if (room.phase === 'write' && ps.every(p => c.lies[p.id])) startVote(room);
  else if (room.phase === 'vote' && ps.every(p => c.votes[p.id])) revealBluff(room);
  else if (room.phase === 'guess' && ps.every(p => c.guesses[p.id] != null)) revealNumber(room);
  else if (room.phase === 'likelyVote' && ps.every(p => c.lvotes[p.id])) revealLikely(room);
  else if ((room.phase === 'blitz' || room.phase === 'emoji') && ps.every(p => c.answers[c.idx][p.id])) resolveQuickItem(room);
  else if (room.phase === 'spyClue' && ps.every(p => c.clues[p.id])) startSpyVote(room);
  else if (room.phase === 'spyVote' && ps.every(p => c.votes[p.id])) revealSpy(room);
}

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

  socket.on('create', (_, cb) => reply(cb, { code: createRoom().code }));

  socket.on('join', async ({ code, token, name, avatar } = {}, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return reply(cb, { error: 'noroom' });
    if (session && db.on()) {
      const banned = await db.isBanned(session.id).catch(() => null);
      if (banned) return reply(cb, { error: 'banned' });
    }
    name = String(name || '').trim().slice(0, 14) || 'Player';
    avatar = cleanAvatar(avatar);
    let p = token && r.players.get(token);
    if (!p) {
      if (connected(r).length >= MAX_PLAYERS) return reply(cb, { error: 'full' });
      p = { id: rid(), name, avatar, score: 0, streak: 0, stats: freshStats(), powers: freshPowers(), connected: true, socketId: null, team: null, ready: false, userId: session ? session.id : null };
      if (r.settings.teams) p.team = smallerTeam(r);
      r.players.set(p.id, p);
    } else { p.name = name; p.avatar = avatar; if (session) p.userId = session.id; }
    if (session && db.on()) db.touchProfile({ userId: session.id, name, avatar }).catch(() => {});
    if (room && player && room !== r) leave(false);
    room = r; player = p;
    p.connected = true; p.socketId = socket.id;
    if (!r.hostId || !r.players.get(r.hostId)?.connected) r.hostId = p.id;
    socket.join(r.code);
    io.to(r.code).emit('joined', { id: p.id, name: p.name });
    reply(cb, { ok: true, token: p.id, code: r.code });
    broadcast(r);
  });

  socket.on('settings', (patch = {}, cb) => {
    if (!host() || room.phase !== 'lobby') return reply(cb, { error: 'host' });
    const s = room.settings;
    if (['ar', 'en'].includes(patch.lang)) s.lang = patch.lang;
    if ([3, 5, 8, 12].includes(patch.rounds)) s.rounds = patch.rounds;
    if (['chill', 'normal', 'fast'].includes(patch.pace)) s.pace = patch.pace;
    if (typeof patch.teams === 'boolean') { s.teams = patch.teams; if (s.teams) balanceTeams(room); }
    if (typeof patch.public === 'boolean') s.public = patch.public;
    if (patch.types && typeof patch.types === 'object') {
      const t = Object.fromEntries(TYPES.map(k => [k, !!patch.types[k]]));
      if (Object.values(t).some(Boolean)) s.types = t;
    }
    broadcast(room);
    reply(cb, { ok: true });
  });

  socket.on('start', (_, cb) => {
    if (!host() || room.phase !== 'lobby') return reply(cb, { error: 'host' });
    startGame(room);
    reply(cb, { ok: true });
  });

  socket.on('lie', (text, cb) => room && reply(cb, submitLie(room, player, text)));
  socket.on('vote', ({ id, bet } = {}, cb) => room && reply(cb, submitVote(room, player, id, bet)));
  socket.on('guess', (v, cb) => room && reply(cb, submitGuess(room, player, v)));
  socket.on('blitz', (v, cb) => room && reply(cb, submitQuick(room, player, v)));
  socket.on('emoji', (id, cb) => room && reply(cb, submitQuick(room, player, id)));
  socket.on('likely', (target, cb) => room && reply(cb, submitLikely(room, player, target)));
  socket.on('power', (kind, cb) => room && reply(cb, usePower(room, player, kind)));
  socket.on('spyClue', (text, cb) => room && reply(cb, submitSpyClue(room, player, text)));
  socket.on('spyVote', (id, cb) => room && reply(cb, submitSpyVote(room, player, id)));
  socket.on('spyGuess', (text, cb) => room && reply(cb, submitSpyGuess(room, player, text)));

  socket.on('next', (_, cb) => {
    if (!host()) return reply(cb, { error: 'host' });
    if (['bluffReveal', 'numReveal', 'likelyReveal', 'spyReveal'].includes(room.phase)) showScores(room);
    else if (room.phase === 'scores') { clearTimer(room); nextRound(room); }
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

  function leave(soft) {
    if (!room || !player) return;
    const r = room, p = player;
    p.connected = false; p.socketId = null;
    socket.leave(r.code);
    if (!soft && r.phase === 'lobby') r.players.delete(p.id);
    if (r.hostId === p.id) { const n = connected(r)[0]; if (n) r.hostId = n.id; }
    checkProgress(r); broadcast(r);
    room = null; player = null;
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (!connected(r).length && now - r.touched > (r.players.size ? ROOM_TTL_MS : 5 * 60 * 1000)) { clearTimer(r); rooms.delete(code); }
  }
  for (const [instanceId, code] of discordInstanceRooms) {
    if (!rooms.has(code)) discordInstanceRooms.delete(instanceId);
  }
}, 60 * 1000);

// ---------------- http ----------------
app.set('trust proxy', 1); // Render terminates TLS ahead of us; needed for secure cookies + req.protocol
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/room/:code', (req, res) => {
  const r = rooms.get(String(req.params.code).toUpperCase());
  if (!r) return res.status(404).json({ exists: false });
  res.json({ exists: true, phase: r.phase, players: connected(r).length });
});
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.text || '').slice(0, 300), { type: 'svg', margin: 1, color: { dark: '#1d1842', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch { res.status(400).end(); }
});

// ---- sign in ----
const origin = req => `${req.protocol}://${req.get('host')}`;
const OAUTH_STATE = 'maqlab_oauth';

async function signIn(res, { id, name, avatar }) {
  if (db.on()) {
    const banned = await db.isBanned(id);
    if (banned) return { error: 'banned', reason: banned.ban_reason };
    await db.touchProfile({ userId: id, name, avatar: avatar || {} });
  }
  auth.setCookie(res, auth.mint({ id, name }));
  return { ok: true };
}

app.get('/api/auth/discord/start', (req, res) => {
  if (!DISCORD_CLIENT_ID) return res.status(500).send('Discord sign-in is not configured');
  const state = crypto.randomBytes(16).toString('base64url');
  res.cookie(OAUTH_STATE, state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID, redirect_uri: `${origin(req)}/api/auth/discord/callback`,
    response_type: 'code', scope: 'identify', state,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const expected = auth.readCookie(req.headers.cookie, OAUTH_STATE);
  if (!req.query.code || !req.query.state || req.query.state !== expected) return res.redirect('/?login=failed');
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
    if (!tok.access_token) return res.redirect('/?login=failed');
    const me = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    }).then(r => r.json());
    if (!me.id) return res.redirect('/?login=failed');
    const r = await signIn(res, { id: me.id, name: (me.global_name || me.username || 'Player').slice(0, 14) });
    res.redirect(r.error === 'banned' ? '/?login=banned' : '/?login=ok');
  } catch {
    res.redirect('/?login=failed');
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

// Local-only shortcut so the signed-in UI can be developed without a Discord
// app. Needs DEV_LOGIN=1 *and* a loopback caller, and is never set in prod.
app.post('/api/auth/dev', async (req, res) => {
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
  if (process.env.DEV_LOGIN !== '1' || !loopback) return res.status(404).end();
  const id = String(req.body?.id || 'dev-1');
  await signIn(res, { id, name: String(req.body?.name || 'Dev').slice(0, 14) });
  res.json({ ok: true });
});

// ---- profiles, leaderboard, social ----
const needsDb = (res) => { if (db.on()) return false; res.status(503).json({ error: 'no_db' }); return true; };
const sessionOr401 = (req, res) => {
  const s = auth.sessionFrom(req.headers);
  if (!s) res.status(401).json({ error: 'sign_in' });
  return s;
};
const lastPost = new Map(); // userId -> ts, so reports/suggestions can't be spammed
const tooSoon = (id, ms) => {
  const n = Date.now();
  if (n - (lastPost.get(id) || 0) < ms) return true;
  lastPost.set(id, n);
  return false;
};

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
  res.json({
    profile, rank, games, follows,
    isMe: !!me && me.id === profile.user_id,
    isFollowing: me ? await db.isFollowing(me.id, profile.user_id) : false,
    viewerIsAdmin: auth.isAdmin(me && me.id),
  });
});

app.get('/api/leaderboard', async (req, res) => {
  if (needsDb(res)) return;
  const me = auth.sessionFrom(req.headers);
  res.json({
    entries: await db.leaderboard(50),
    meId: me ? me.id : null,
    myRank: me ? await db.rankOf(me.id) : null,
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

// ---- admin ----
// Non-admins get a 404 rather than a 403, so these routes don't advertise
// that they exist.
const adminOr404 = (req, res) => {
  const s = auth.sessionFrom(req.headers);
  if (!s || !auth.isAdmin(s.id)) { res.status(404).end(); return null; }
  return s;
};

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

// A ban has to take effect now, not on their next visit.
function kickEverywhere(userId) {
  for (const r of rooms.values()) {
    for (const p of r.players.values()) {
      if (p.userId !== userId) continue;
      if (p.socketId) io.to(p.socketId).emit('kicked');
      r.players.delete(p.id);
      checkProgress(r); broadcast(r);
    }
  }
}

// ---- public lobbies ----
// Straight off the in-memory rooms; no database needed.
app.get('/api/lobbies', (_, res) => {
  const list = [];
  for (const r of rooms.values()) {
    const online = connected(r);
    if (!r.settings.public || !online.length || online.length >= MAX_PLAYERS) continue;
    const host = r.players.get(r.hostId);
    list.push({
      code: r.code, players: online.length, phase: r.phase, round: r.round,
      rounds: r.settings.rounds, lang: r.settings.lang,
      host: host ? host.name : '', avatar: host ? host.avatar : null,
    });
  }
  list.sort((a, b) => (a.phase === 'lobby' ? -1 : 1) - (b.phase === 'lobby' ? -1 : 1) || b.players - a.players);
  res.json({ lobbies: list.slice(0, 30) });
});

// ---- Discord Activity support ----
// Public, non-secret config the client needs to boot the Discord SDK.
app.get('/api/discord/config', (_, res) => res.json({ clientId: DISCORD_CLIENT_ID || null }));

// Exchanges a Discord OAuth `code` (from the client's authorize() call) for an
// access token, using the client secret which must never reach the browser.
app.post('/api/discord/token', async (req, res) => {
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
    res.json({ access_token: data.access_token });
  } catch {
    res.status(502).json({ error: 'exchange_failed' });
  }
});

// One room per Discord Activity instance (= one per voice channel session),
// so everyone who launches the Activity from the same channel lands together.
app.post('/api/discord/room', (req, res) => {
  const instanceId = String(req.body?.instanceId || '').slice(0, 80);
  if (!instanceId) return res.status(400).json({ error: 'missing_instance' });
  const existing = discordInstanceRooms.get(instanceId);
  if (existing && rooms.has(existing)) return res.json({ code: existing });
  const room = createRoom();
  room.settings.public = false; // a voice-channel game isn't advertised to strangers
  discordInstanceRooms.set(instanceId, room.code);
  res.json({ code: room.code });
});

app.get(['/room/:code', '/profile'], (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.init()
  .then(ok => console.log(ok ? 'database connected' : 'no DATABASE_URL — profiles, leaderboard and moderation are off'))
  .catch(e => console.error('database unavailable, running without it:', e.message));

server.listen(PORT, () => console.log(`MAQLAB running on http://localhost:${PORT}`));
