// Round types: Two Truths and a Lie, Name Something, How Many of Us, the quick rounds, Line Them Up; and power-ups.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { ACTIVE, TYPES, matchAnswerCase } from './base.js';
import { connected, normalize, shuffle } from './helpers.js';
import { peekKey, tookMs } from './snapshot.js';
import { broadcast, finishRound, gain, pace, setTimer, streakResult } from './flow.js';
import { advanceIfAllIn, showScores } from './end.js';

// ----- two truths and a lie -----
// Everybody writes at the same time and then a few of the sets are played one
// after another. Letting one player write while the rest watch a clock would
// be the only dead phase in the game, and dead time is how a table drifts off
// to another tab.
//
// It is also the only round whose content the room supplies, so it never runs
// out and never repeats — and the two points it pays are deliberately mirror
// images: you earn for seeing through someone, and they earn for every person
// they got past.
export const TWO_SETS_PER_ROUND = 3;
export const TWO_LINE_MAX = 60;
// The write clock is a ceiling, not a duration: the round moves on the moment
// everyone has submitted, so a longer ceiling costs a quick table nothing and
// only buys time for the people who were being cut off. It does make a round
// with a missing player drag, which is the price, and the next report will
// say whether it was worth paying.
export const TWO_SPOT_POINTS = 300; // for picking the lie out
export const TWO_FOOL_POINTS = 150; // to the author, per person fooled

export function submitTwo(room, p, lines, lie) {
  if (room.phase !== 'twoWrite') return { error: 'late' };
  if (room.current.sets[p.id]) return { error: 'dup' };
  if (!Array.isArray(lines) || lines.length !== 3) return { error: 'bad' };
  const clean = lines.map(x => String(x || '').replace(/\s+/g, ' ').trim().slice(0, TWO_LINE_MAX));
  if (clean.some(x => !x)) return { error: 'empty' };
  const idx = Number(lie);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) return { error: 'bad' };
  room.current.sets[p.id] = {
    lines: clean.map(x => matchAnswerCase(x, room.settings.lang)),
    lie: idx,
  };
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function startTwoGuess(room) {
  if (room.phase !== 'twoWrite') return;
  const c = room.current;
  // Only sets from people still in the room, and only a few of them, so the
  // round stays a round instead of becoming the whole evening.
  c.order = shuffle(connected(room).filter(x => c.sets[x.id]).map(x => x.id)).slice(0, TWO_SETS_PER_ROUND);
  // Nobody wrote a set, so there is nothing to play. showScores only runs
  // from a registered reveal phase, so the phase has to be moved first: left
  // in twoWrite it returned, set no clock, and the game stopped there with
  // nothing in the log. The round's own 95-second clock did this too — the
  // host's skip only made it easy to reach.
  if (!c.order.length) { finishRound(room); room.phase = 'twoResult'; return showScores(room); }
  c.idx = 0;
  c.picks = c.order.map(() => ({}));
  room.phase = 'twoGuess';
  setTimer(room, pace(room, 'twoGuess'), () => revealTwo(room));
  broadcast(room);
}

export function submitTwoGuess(room, p, i) {
  const c = room.current;
  if (!c || room.phase !== 'twoGuess') return { error: 'late' };
  if (p.id === c.order[c.idx]) return { error: 'own' };
  if (c.picks[c.idx][p.id] != null) return { error: 'dup' };
  const idx = Number(i);
  if (!Number.isInteger(idx) || idx < 0 || idx > 2) return { error: 'bad' };
  c.picks[c.idx][p.id] = idx;
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealTwo(room) {
  if (room.phase !== 'twoGuess') return;
  const c = room.current;
  const whose = c.order[c.idx];
  const set = c.sets[whose] || { lines: [], lie: 0 };
  const picks = c.picks[c.idx];
  let fooled = 0;
  for (const [pid, pick] of Object.entries(picks)) {
    if (pick === set.lie) {
      gain(room, pid, 'twoSpot', TWO_SPOT_POINTS);
      const g = room.players.get(pid);
      if (g) g.stats.correct += 1;
    } else fooled += 1;
  }
  if (fooled) {
    gain(room, whose, 'twoFooled', fooled * TWO_FOOL_POINTS);
    const a = room.players.get(whose);
    if (a) {
      a.stats.fooled += fooled;
      // Everyone who guessed, got it wrong — and with enough of them for that
      // to mean something rather than be one person's coin toss.
      const guesses = Object.keys(picks).length;
      if (guesses >= 2 && fooled === guesses) a.stats.twoFoolAll += 1;
    }
  }
  for (const p of connected(room)) {
    if (p.id === whose) continue;
    streakResult(room, p.id, picks[p.id] === set.lie);
  }
  room.phase = 'twoResult';
  setTimer(room, pace(room, 'twoResult'), () => advanceTwo(room));
  broadcast(room);
}

// Named rather than inlined, so a room restored after a restart can be handed
// back the same call its timer was holding.
export function advanceTwo(room) {
  const c = room.current;
  if (!c) return;
  if (c.idx + 1 < (c.order || []).length) {
    c.idx += 1;
    room.phase = 'twoGuess';
    setTimer(room, pace(room, 'twoGuess'), () => revealTwo(room));
    return broadcast(room);
  }
  finishRound(room);
  showScores(room);
}

// ----- name something -----
// You score for every other person who wrote what you wrote, so the round
// rewards saying the obvious thing — the exact opposite of the bluff round.
// Alone is worth nothing, which is the whole idea.
export const NAME_MATCH_POINTS = 200;

export function submitName(room, p, text) {
  if (room.phase !== 'nameWrite') return { error: 'late' };
  if (room.current.said[p.id]) return { error: 'dup' };
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (!text) return { error: 'empty' };
  room.current.said[p.id] = matchAnswerCase(text, room.settings.lang);
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

// Answers are grouped by the same fold the rest of the game uses for typed
// text, so "التفاح" and "تفاح", or "The apple" and "apple", land together —
// otherwise players would be punished for spelling rather than for thinking.
export function nameGroups(said) {
  const by = new Map();
  for (const [pid, text] of Object.entries(said)) {
    const key = normalize(text);
    if (!key) continue;
    if (!by.has(key)) by.set(key, { text, ids: [] });
    by.get(key).ids.push(pid);
  }
  return [...by.values()].sort((a, b) => b.ids.length - a.ids.length);
}

export function revealName(room) {
  if (room.phase !== 'nameWrite') return;
  const c = room.current;
  const groups = nameGroups(c.said);
  for (const g of groups) {
    const others = g.ids.length - 1;
    if (others <= 0) continue;
    for (const pid of g.ids) {
      gain(room, pid, 'nameMatch', others * NAME_MATCH_POINTS);
      const p = room.players.get(pid);
      if (p) {
        p.stats.correct += 1;
        // Not merely matching someone: reaching for the same word as most of
        // the room at once, which is what this round rewards.
        if (others >= 3) p.stats.nameCrowd += 1;
      }
    }
  }
  for (const p of connected(room)) {
    const mine = groups.find(g => g.ids.includes(p.id));
    streakResult(room, p.id, !!mine && mine.ids.length > 1);
  }
  c.groups = groups;
  finishRound(room);
  room.phase = 'nameReveal';
  setTimer(room, pace(room, 'nameReveal'), () => showScores(room));
  broadcast(room);
}

// ----- how many of us -----
// Exact is the whole game; one either side is close enough to be worth
// something, because reading a room to within one person is still reading it.
export const MANY_EXACT = 500;
export const MANY_NEAR = 250;

export function submitMany(room, p, yes) {
  if (room.phase !== 'manyAsk') return { error: 'late' };
  if (room.current.said[p.id] != null) return { error: 'dup' };
  room.current.said[p.id] = !!yes;
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function startManyGuess(room) {
  if (room.phase !== 'manyAsk') return;
  room.phase = 'manyGuess';
  setTimer(room, pace(room, 'manyGuess'), () => revealMany(room));
  broadcast(room);
}

export function submitManyGuess(room, p, n) {
  if (room.phase !== 'manyGuess') return { error: 'late' };
  if (room.current.guesses[p.id] != null) return { error: 'dup' };
  const max = connected(room).length;
  const v = Number(n);
  if (!Number.isInteger(v) || v < 0 || v > max) return { error: 'bad' };
  room.current.guesses[p.id] = v;
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealMany(room) {
  if (room.phase !== 'manyGuess') return;
  const c = room.current;
  const yesIds = connected(room).filter(p => c.said[p.id]).map(p => p.id);
  const count = yesIds.length;
  for (const p of connected(room)) {
    const g = c.guesses[p.id];
    if (g == null) { streakResult(room, p.id, false); continue; }
    const off = Math.abs(g - count);
    if (off === 0) { gain(room, p.id, 'manyExact', MANY_EXACT); p.stats.correct += 1; p.stats.snipes += 1; p.stats.manyExact += 1; }
    else if (off === 1) gain(room, p.id, 'manyNear', MANY_NEAR);
    streakResult(room, p.id, off === 0);
  }
  Object.assign(c, { yesIds, count });
  finishRound(room);
  room.phase = 'manyReveal';
  setTimer(room, pace(room, 'manyReveal'), () => showScores(room));
  broadcast(room);
}

// ----- quick rounds: blitz (true/false) and emoji (4 options) -----
// The quick rounds are all the same shape: a handful of items, everyone
// answers against a clock, points for right plus points for fast. Only the
// labels and the numbers differ, so they live in one table instead of being
// spelled out again in every branch — which is what made adding a third one
// a refactor rather than a line.
export const QUICK = {
  blitz: { phase: 'blitz', result: 'blitzResult', base: 200, speed: 20 },
  emoji: { phase: 'emoji', result: 'emojiResult', base: 300, speed: 30 },
  odd: { phase: 'odd', result: 'oddResult', base: 300, speed: 30 },
};

// Quick rounds where a peek makes sense: the ones that deal four options.
// Derived from QUICK so another one added later is covered without anybody
// having to remember this line.
export const PEEKABLE = TYPES.filter(t => QUICK[t] && t !== 'blitz');

export function startQuickItem(room) {
  const c = room.current;
  c.itemStart = Date.now();
  room.phase = QUICK[c.type].phase;
  c.itemDur = pace(room, room.phase) * 1000;
  setTimer(room, c.itemDur / 1000, () => resolveQuickItem(room));
  broadcast(room);
}

export function submitQuick(room, p, value) {
  const c = room.current;
  if (!c || !QUICK[c.type] || room.phase !== QUICK[c.type].phase) return { error: 'late' };
  const ans = c.answers[c.idx];
  if (ans[p.id]) return { error: 'dup' };
  if (c.type === 'blitz') ans[p.id] = { v: !!value, t: Date.now() - c.itemStart };
  else {
    if (!c.items[c.idx].opts.some(o => o.id === value)) return { error: 'bad' };
    ans[p.id] = { id: value, t: Date.now() - c.itemStart };
  }
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function resolveQuickItem(room) {
  const c = room.current;
  const q = QUICK[c && c.type];
  if (!q || room.phase !== q.phase) return;
  const ans = c.answers[c.idx];
  const blitz = c.type === 'blitz';
  let fastest = null;
  for (const [pid, a] of Object.entries(ans)) {
    a.correct = blitz ? a.v === c.items[c.idx].t : a.id === c.items[c.idx].correctId;
    if (!a.correct) continue;
    const speed = Math.max(0, 1 - a.t / c.itemDur);
    gain(room, pid, c.type, q.base);
    gain(room, pid, 'speed', Math.round(speed * q.speed) * 10);
    c.correctCount[pid] = (c.correctCount[pid] || 0) + 1;
    if (!fastest || a.t < ans[fastest].t) fastest = pid;
  }
  if (fastest) { gain(room, fastest, 'fastest', 100); const fp = room.players.get(fastest); if (fp) fp.stats.fastest += 1; }
  c.fastest[c.idx] = fastest;
  room.phase = q.result;
  setTimer(room, pace(room, room.phase), () => advanceQuick(room));
  broadcast(room);
}

// On to the next item, or out of the round. Named rather than inline because
// a restored room has to be able to pick this up again, and a closure cannot
// be written to a database.
export function advanceQuick(room) {
  const c = room.current;
  if (!c) return;
  if (c.idx + 1 < c.items.length) { c.idx += 1; startQuickItem(room); return; }
  for (const p of connected(room)) {
    const n = c.correctCount[p.id] || 0;
    p.stats.correct += n;
    // Odd One Out never had anything of its own either. A clean sweep of the
    // round is the thing it rewards: three groups read correctly in a row.
    if (c.type === 'odd' && n === c.items.length) p.stats.oddSweeps += 1;
    streakResult(room, p.id, n >= 2);
  }
  finishRound(room);
  showScores(room);
}

// ----- line them up -----
// Scored by neighbouring pairs rather than exact positions: getting the top
// two right is worth something even if the bottom two are swapped, which is
// how people actually half-know an order.
export const PAIR_POINTS = 250;
export const PERFECT_BONUS = 250;

export function correctPairs(seq, truth) {
  const rank = Object.fromEntries(truth.map((id, i) => [id, i]));
  let n = 0;
  for (let i = 0; i + 1 < seq.length; i++) if (rank[seq[i]] < rank[seq[i + 1]]) n += 1;
  return n;
}

export function submitOrder(room, p, ids) {
  const c = room.current;
  if (!c || room.phase !== 'order') return { error: 'late' };
  if (c.orders[p.id]) return { error: 'dup' };
  if (!Array.isArray(ids) || ids.length !== c.items.length) return { error: 'bad' };
  // Must be a permutation of exactly this round's items, or the pair count
  // below would be scoring something that was never on screen.
  const want = new Set(c.items.map(i => i.id));
  const got = new Set(ids.map(String));
  if (got.size !== want.size || [...got].some(id => !want.has(id))) return { error: 'bad' };
  c.orders[p.id] = ids.map(String);
  tookMs(room, p.id);
  if (!advanceIfAllIn(room)) broadcast(room);
  return { ok: true };
}

export function revealOrder(room) {
  if (room.phase !== 'order') return;
  const c = room.current;
  for (const p of connected(room)) {
    const seq = c.orders[p.id];
    if (!seq) continue;
    const n = correctPairs(seq, c.truth);
    if (n) gain(room, p.id, 'orderPairs', n * PAIR_POINTS);
    if (n === c.truth.length - 1) { gain(room, p.id, 'orderPerfect', PERFECT_BONUS); p.stats.correct += 1; p.stats.perfectOrders += 1; }
    streakResult(room, p.id, n === c.truth.length - 1);
  }
  room.phase = 'orderResult';
  setTimer(room, pace(room, 'orderResult'), () => { finishRound(room); showScores(room); });
  broadcast(room);
}

// ----- power-ups -----
export function usePower(room, p, kind) {
  const c = room.current;
  if (!c || !ACTIVE.includes(room.phase)) return { error: 'late' };
  if (!p.powers || !p.powers[kind]) return { error: 'nopower' };
  if (kind === 'double') {
    if (c.doubled[p.id]) return { error: 'dup' };
    c.doubled[p.id] = true;
  } else if (kind === 'peek') {
    // Peek removes two wrong options, so it only means anything where there
    // are wrong options to remove: the bluff vote, and the quick rounds that
    // offer four. True or false offers two, and taking the wrong one away
    // would simply be handing over the answer.
    let wrong;
    if (room.phase === 'vote') {
      if (c.votes[p.id]) return { error: 'dup' };
      wrong = c.options.filter(o => !o.truth && !o.authors.includes(p.id)).map(o => o.id);
    } else if (PEEKABLE.includes(c.type) && room.phase === QUICK[c.type].phase) {
      if (c.answers[c.idx][p.id]) return { error: 'dup' };
      wrong = c.items[c.idx].opts.filter(o => !o.ok).map(o => o.id);
    } else return { error: 'nopeek' };
    c.peeked[p.id] = { key: peekKey(c), ids: shuffle(wrong).slice(0, 2) };
  } else return { error: 'bad' };
  p.powers[kind] -= 1;
  broadcast(room);
  return { ok: true };
}
