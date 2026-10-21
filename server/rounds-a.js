// Round types: The Bluff, Closest Number, Who's Most Likely, The Spy, Which is Bigger, What Went Missing, The Minority.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { content, matchAnswerCase } from './base.js';
import { connected, isTruth, normalize, rid, rnd, shuffle } from './helpers.js';
import { tookMs } from './snapshot.js';
import { broadcast, finishRound, gain, pace, setTimer, streakResult } from './flow.js';
import { advanceIfAllIn, showScores } from './end.js';

// ----- bluff -----
export function submitLie(room, p, text) {
  if (room.phase !== 'write') return { error: 'late' };
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  if (!text) return { error: 'empty' };
  if (isTruth(text, room.current.q)) return { error: 'truth' };
  text = matchAnswerCase(text, room.settings.lang);
  room.current.lies[p.id] = text;
  const offered = (room.current.offered || {})[p.id];
  if (offered) {
    room.current.stuckUsed = room.current.stuckUsed || {};
    room.current.stuckUsed[p.id] = normalize(offered) === normalize(text) ? 'asis' : 'edited';
  }
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

// Measured over 301 recorded rounds: 22% of players never submit a lie, the
// worst rate of any round type, and the rounds people skip are the rounds they
// have to type in. A blank box under a clock is the whole problem.
//
// The suggestion is a real answer from a different question, because that is
// what a good lie looks like: an ordinary, plausible thing. The house decoys
// are jokes on purpose ("a penguin") and would read as the game writing a bad
// one in your name.
//
// It fills the box, it does not send. Editing the suggestion is the point —
// a player who changes one word has written a lie, and has stayed in the round.
export const STUCK_MAX = 5; // re-rolls per player per round; enough to find one you like

export function stuckSuggestion(room, p) {
  const c = room.current;
  if (!c || c.type !== 'bluff' || room.phase !== 'write') return { error: 'late' };
  if (c.lies[p.id]) return { error: 'dup' };
  const used = c.stuck || (c.stuck = {});
  if ((used[p.id] || 0) >= STUCK_MAX) return { error: 'enough' };
  used[p.id] = (used[p.id] || 0) + 1;

  const L = room.settings.lang;
  // Never the real answer, never one of its accepted spellings, and never a
  // lie already in play — any of those would be a cruel suggestion.
  const taken = new Set([
    normalize(c.q.a[L]),
    ...(c.q.alt || []).map(normalize),
    ...Object.values(c.lies).map(normalize),
  ]);
  const pool = content.bluff
    .map(e => e.a[L])
    .filter(x => x && !taken.has(normalize(x)));
  if (!pool.length) return { error: 'none' };
  // Any real answer is plausible in the abstract; one shaped like *this*
  // question's answer is plausible here. A two-word answer suggested against a
  // two-word truth reads as a guess somebody made, which is the point — the
  // reveal puts the player's name next to it.
  const shape = x => String(x).trim().split(/\s+/).length;
  const want = shape(c.q.a[L]);
  const near = pool.slice().sort((x, y) => Math.abs(shape(x) - want) - Math.abs(shape(y) - want));
  const band = near.slice(0, Math.max(12, Math.ceil(near.length / 3)));
  const text = band[rnd(band.length)];
  // Remembered so the round can tell afterwards whether the suggestion was
  // sent as-is, edited first, or thrown away. Guessing at this from the text
  // alone did not work: a fifth of lies already matched some bank answer by
  // coincidence before the button existed.
  (c.offered || (c.offered = {}))[p.id] = text;
  return { ok: true, text };
}

export function startVote(room) {
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

export function submitVote(room, p, optionId, bet) {
  if (room.phase !== 'vote') return { error: 'late' };
  const opt = room.current.options.find(o => o.id === optionId);
  if (!opt) return { error: 'bad' };
  if (opt.authors.includes(p.id)) return { error: 'own' };
  bet = [1, 2, 3].includes(bet) ? bet : 1;
  room.current.votes[p.id] = { id: optionId, bet };
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealBluff(room) {
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
export function submitGuess(room, p, val) {
  if (room.phase !== 'guess') return { error: 'late' };
  const n = Number(String(val).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return { error: 'nan' };
  room.current.guesses[p.id] = n;
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealNumber(room) {
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
export function submitLikely(room, p, target) {
  if (room.phase !== 'likelyVote') return { error: 'late' };
  if (!room.players.get(target)?.connected) return { error: 'bad' };
  room.current.lvotes[p.id] = target;
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealLikely(room) {
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
export function submitSpyClue(room, p, text) {
  if (room.phase !== 'spyClue') return { error: 'late' };
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!text) return { error: 'empty' };
  room.current.clues[p.id] = text;
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function startSpyVote(room) {
  if (room.phase !== 'spyClue') return;
  room.phase = 'spyVote';
  setTimer(room, pace(room, 'spyVote'), () => revealSpy(room));
  broadcast(room);
}

export function submitSpyVote(room, p, targetId) {
  if (room.phase !== 'spyVote') return { error: 'late' };
  if (p.id === targetId) return { error: 'selfvote' };
  if (!room.players.get(targetId)?.connected) return { error: 'bad' };
  room.current.votes[p.id] = targetId;
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function submitSpyGuess(room, p, text) {
  if (room.phase !== 'spyVote') return { error: 'late' };
  if (p.id !== room.current.spyId) return { error: 'bad' };
  if (room.current.guess != null) return { error: 'dup' };
  room.current.guess = String(text || '').trim().slice(0, 40);
  broadcast(room);
  return { ok: true };
}

export function spyGuessCorrect(c) {
  if (c.guess == null || !c.guess) return false;
  const n = normalize(c.guess);
  return normalize(c.word.ar) === n || normalize(c.word.en) === n;
}

export function revealSpy(room) {
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

// ----- which is bigger -----
// Knowledge, not acquaintance. Nothing in this round needs the players to
// have met: a stranger can walk into a room and be on equal footing, which
// is not true of "who's most likely" and only half true of the rounds that
// ask about yourself.
export const HIGHER_POINTS = 300;
export const HIGHER_FAST = 150;

export function submitHigher(room, p, side) {
  const c = room.current;
  if (!c || room.phase !== 'higherPick') return { error: 'late' };
  if (c.picks[p.id]) return { error: 'dup' };
  if (side !== 'left' && side !== 'right') return { error: 'bad' };
  c.picks[p.id] = side;
  tookMs(room, p.id);
  if (side === c.correct && !c.fastest) c.fastest = p.id;
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealHigher(room) {
  if (room.phase !== 'higherPick') return;
  const c = room.current;
  for (const [pid, side] of Object.entries(c.picks)) {
    const right = side === c.correct;
    if (right) {
      gain(room, pid, 'higher', HIGHER_POINTS);
      const p = room.players.get(pid);
      if (p) { p.stats.correct += 1; p.stats.higherWins += 1; }
    }
    streakResult(room, pid, right);
  }
  if (c.fastest) {
    gain(room, c.fastest, 'fastest', HIGHER_FAST);
    const f = room.players.get(c.fastest);
    if (f) f.stats.fastest += 1;
  }
  for (const p of connected(room)) if (!c.picks[p.id]) streakResult(room, p.id, false);
  finishRound(room);
  room.phase = 'higherReveal';
  setTimer(room, pace(room, 'higherReveal'), () => showScores(room));
  broadcast(room);
}

// ----- what went missing -----
// A memory round rather than a knowledge one, so it does not favour whoever
// read the most trivia either. Four things are shown, then one of them is
// taken away.
export const MISS_POINTS = 350;
export const MISS_FAST = 150;

export function startMissPick(room) {
  if (room.phase !== 'missWatch') return;
  room.phase = 'missPick';
  setTimer(room, pace(room, 'missPick'), () => revealMiss(room));
  broadcast(room);
}

export function submitMiss(room, p, id) {
  const c = room.current;
  if (!c || room.phase !== 'missPick') return { error: 'late' };
  if (c.picks[p.id]) return { error: 'dup' };
  if (!c.items.some(it => it.id === id)) return { error: 'bad' };
  c.picks[p.id] = id;
  tookMs(room, p.id);
  if (id === c.goneId && !c.fastest) c.fastest = p.id;
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealMiss(room) {
  if (room.phase !== 'missPick') return;
  const c = room.current;
  for (const [pid, id] of Object.entries(c.picks)) {
    const right = id === c.goneId;
    if (right) {
      gain(room, pid, 'missing', MISS_POINTS);
      const p = room.players.get(pid);
      if (p) { p.stats.correct += 1; p.stats.missFound += 1; }
    }
    streakResult(room, pid, right);
  }
  if (c.fastest) {
    gain(room, c.fastest, 'fastest', MISS_FAST);
    const f = room.players.get(c.fastest);
    if (f) f.stats.fastest += 1;
  }
  for (const p of connected(room)) if (!c.picks[p.id]) streakResult(room, p.id, false);
  finishRound(room);
  room.phase = 'missReveal';
  setTimer(room, pace(room, 'missReveal'), () => showScores(room));
  broadcast(room);
}

// ----- the minority -----
// Two options, and the smaller side wins. Every other round in the game pays
// you for being right or for agreeing; this one pays for reading the room and
// going the other way, which makes the obvious answer the trap.
//
// It is also the only new round in a while that is a single tap. That is not
// a style choice: across 1,900 recorded player-rounds the rounds you tap are
// skipped 1-5% of the time and the rounds you type in 18-37%.
export const MINORITY_POINTS = 400;

export function submitMinor(room, p, side) {
  const c = room.current;
  if (!c || room.phase !== 'minorPick') return { error: 'late' };
  if (c.picks[p.id]) return { error: 'dup' };
  if (side !== 'a' && side !== 'b') return { error: 'bad' };
  c.picks[p.id] = side;
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealMinor(room) {
  if (room.phase !== 'minorPick') return;
  const c = room.current;
  const sides = { a: [], b: [] };
  for (const [pid, v] of Object.entries(c.picks)) if (sides[v]) sides[v].push(pid);
  // A tie pays nobody, and so does everyone choosing the same thing: in both
  // cases there is no minority to have been in.
  const winners = sides.a.length && sides.b.length
    ? (sides.a.length < sides.b.length ? sides.a : sides.b.length < sides.a.length ? sides.b : [])
    : [];
  for (const pid of winners) {
    gain(room, pid, 'minority', MINORITY_POINTS);
    const p = room.players.get(pid);
    if (p) { p.stats.correct += 1; p.stats.minorityWins += 1; }
  }
  for (const p of connected(room)) streakResult(room, p.id, winners.includes(p.id));
  c.winners = winners;
  c.counts = { a: sides.a.length, b: sides.b.length };
  finishRound(room);
  room.phase = 'minorReveal';
  setTimer(room, pace(room, 'minorReveal'), () => showScores(room));
  broadcast(room);
}
