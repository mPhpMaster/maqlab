// Bots, broadcasting, clocks and scoring, and starting a game and its rounds.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { ACTIVE, ITEMS_PER_QUICK_ROUND, MAX_PLAYERS, MIN_PLAYERS, MODS, T, TYPES, bots, content, db, hostq, io, plan, progress, rooms, roundType, seen } from './base.js';
import { connected, freshPowers, freshStats, newCode, rid, rnd, shuffle } from './helpers.js';
import { addBot, balanceTeams, humans, scheduleBots, snapshot } from './snapshot.js';
import { revealHigher, revealLikely, revealMinor, revealNumber, startMissPick, startSpyVote, startVote, submitGuess, submitHigher, submitLie, submitLikely, submitMinor, submitMiss, submitSpyClue, submitSpyGuess, submitSpyVote, submitVote } from './rounds-a.js';
import { revealName, revealOrder, startManyGuess, startQuickItem, startTwoGuess, submitMany, submitManyGuess, submitName, submitOrder, submitQuick, submitTwo, submitTwoGuess } from './rounds-b.js';
import { finishGame } from './end.js';
import { saveRoom } from './rooms-saved.js';

// Returns a thunk that performs this bot's move for the current phase, or
// null when the phase asks nothing of it.
export function botAction(room, b) {
  const c = room.current, L = room.settings.lang, ph = room.phase;

  if (ph === 'write' && !c.lies[b.id]) {
    // Lies are borrowed from real answers to other questions, so they read
    // exactly like the truth — because somewhere else they are the truth.
    const decoys = shuffle(content.bluff.map(e => e.a[L])).slice(0, 8);
    const text = bots.lie({ decoys, truth: c.q.a[L] });
    return text && (() => submitLie(room, b, text));
  }
  if (ph === 'vote' && !c.votes[b.id]) {
    const v = bots.bluffVote({ options: c.options, myId: b.id });
    return v && (() => submitVote(room, b, v.id, v.bet));
  }
  if (ph === 'guess' && c.guesses[b.id] == null) {
    const g = bots.numberGuess({ answer: c.q.a });
    return g != null && (() => submitGuess(room, b, g));
  }
  if (ph === 'likelyVote' && !c.lvotes[b.id]) {
    const t = bots.votePlayer({ players: connected(room), myId: b.id });
    return t && (() => submitLikely(room, b, t));
  }
  if (ph === 'blitz' && !c.answers[c.idx][b.id]) {
    const v = bots.blitzAnswer({ truth: c.items[c.idx].t });
    return () => submitQuick(room, b, v);
  }
  if ((ph === 'emoji' || ph === 'odd') && !c.answers[c.idx][b.id]) {
    const it = c.items[c.idx];
    const id = bots.emojiAnswer({ options: it.opts, correctId: it.correctId });
    return id && (() => submitQuick(room, b, id));
  }
  if (ph === 'order' && !c.orders[b.id]) {
    const seq = bots.orderGuess({ correctIds: c.truth });
    return seq && (() => submitOrder(room, b, seq));
  }
  if (ph === 'higherPick' && !c.picks[b.id]) {
    return () => submitHigher(room, b, bots.higherPick({ correct: c.correct }));
  }
  if (ph === 'missPick' && !c.picks[b.id]) {
    return () => submitMiss(room, b, bots.missPick({ ids: c.items.map(i => i.id), goneId: c.goneId }));
  }
  if (ph === 'minorPick' && !c.picks[b.id]) {
    return () => submitMinor(room, b, bots.minorPick());
  }
  if (ph === 'twoWrite' && !c.sets[b.id]) {
    const set = bots.twoLines({ lang: room.settings.lang });
    return () => submitTwo(room, b, set.lines, set.lie);
  }
  if (ph === 'twoGuess' && c.order[c.idx] !== b.id && c.picks[c.idx] && c.picks[c.idx][b.id] == null) {
    return () => submitTwoGuess(room, b, bots.twoGuess());
  }
  if (ph === 'nameWrite' && !c.said[b.id]) {
    return () => submitName(room, b, bots.nameAnswer({ common: c.q.common, lang: room.settings.lang }));
  }
  if (ph === 'manyAsk' && c.said[b.id] == null) {
    return () => submitMany(room, b, bots.manyAnswer());
  }
  if (ph === 'manyGuess' && c.guesses[b.id] == null) {
    return () => submitManyGuess(room, b, bots.manyGuess({ total: connected(room).length }));
  }
  if (ph === 'spyClue' && !c.clues[b.id]) {
    // The clue comes from the category alone whether or not this bot is the
    // spy, so a bot that happens to know the word cannot leak it by being
    // suspiciously specific.
    return () => submitSpyClue(room, b, bots.spyClue({ category: c.cat.en, taken: Object.values(c.clues) })[L]);
  }
  if (ph === 'spyVote' && !c.votes[b.id]) {
    const t = bots.votePlayer({ players: connected(room), myId: b.id });
    if (!t) return null;
    return () => {
      // The spy votes like everyone else — the round does not move until
      // every player has — and guesses on top of that, from the category
      // alone, which is all a human spy has to go on either.
      if (c.spyId === b.id) {
        const candidates = content.spy.filter(e => e.cat.en === c.cat.en).map(e => e.w[L]);
        const guess = bots.spyGuess({ candidates });
        if (guess) submitSpyGuess(room, b, guess);
      }
      submitSpyVote(room, b, t);
    };
  }
  return null;
}

export function broadcast(room) {
  room.touched = Date.now();
  for (const p of room.players.values()) if (p.socketId) io.to(p.socketId).emit('room', snapshot(room, p.id));
  scheduleBots(room);
  saveRoom(room);
}

export function clearTimer(room) { if (room.timer) clearTimeout(room.timer); room.timer = null; }
// How each answering phase ended: everyone answered, the clock ran out, or
// the host moved it on. Counted per phase, kept in the match replay, and read
// by the round report; it says which modes people do not finish, without
// keeping a word of what anyone wrote.
export function noteEnd(room, how) {
  const c = room.current;
  if (!c || !progress.ANSWERED[room.phase]) return;
  const e = (c.ended = c.ended || {});
  const k = (e[room.phase] = e[room.phase] || {});
  k[how] = (k[how] || 0) + 1;
}

export function setTimer(room, sec, fn) {
  clearTimer(room);
  // When this phase began. The quick rounds have always timed their answers;
  // the rounds you type in had no clock at all, so a player who skipped one
  // was indistinguishable from a player who ran out of time — which is the
  // difference between a round nobody understands and a round nobody can
  // finish, and they want opposite fixes.
  room.phaseStart = Date.now();
  room.deadline = Date.now() + sec * 1000;
  // Kept so the host can run the clock out early. Every phase already knows
  // what happens when its time is up; "skip" and "next" are that, sooner.
  // Not persisted — a room restored from the database is restored mid-phase
  // and sets its own clock again.
  room.onTime = fn;
  room.timer = setTimeout(() => { noteEnd(room, 'clock'); fn(); }, sec * 1000);
  // Every phase change comes through here, which makes it the one checkpoint
  // worth writing down without waiting for the throttle.
  saveRoom(room, true);
}
export const pace = (room, key) => {
  const base = T[room.settings.pace][key];
  const short = room.current && room.current.mod === 'speed' && ACTIVE.includes(key);
  return short ? Math.max(4, Math.round(base * 0.6)) : base;
};

// ---------------- scoring ----------------
export function gain(room, pid, key, base, applyMult = true) {
  if (!room.players.has(pid)) return;
  const v = applyMult && base > 0 ? Math.round((base * room.current.mult) / 10) * 10 : base;
  const g = room.gains[pid] || (room.gains[pid] = { total: 0, items: [] });
  const ex = g.items.find(i => i.k === key);
  if (ex) ex.v += v; else g.items.push({ k: key, v });
  g.total += v;
}

export function streakResult(room, pid, success) {
  const p = room.players.get(pid);
  if (!p) return;
  if (success) {
    p.streak += 1;
    p.stats.bestStreak = Math.max(p.stats.bestStreak, p.streak);
    if (p.streak >= 2) gain(room, pid, 'streak', Math.min(500, 100 * (p.streak - 1)));
  } else p.streak = 0;
}

export function finishRound(room) {
  const c = room.current;
  // 💎 double power-up: doubles that player's positive round total
  for (const pid of Object.keys(c.doubled)) {
    const g = room.gains[pid];
    if (g && g.total > 0) gain(room, pid, 'double', g.total, false);
  }
  // 🎁 jackpot: round's biggest earner gets a mystery bonus. Ties are drawn
  // rather than sorted: Array.prototype.sort is stable, so a plain sort handed
  // the bonus to whoever joined the room first, every single time. That was
  // invisible while ties were rare, and became the rule the moment a round
  // arrived where everyone who agrees scores exactly the same.
  if (c.mod === 'jackpot') {
    const earners = Object.entries(room.gains).filter(([, g]) => g.total > 0);
    const top = Math.max(0, ...earners.map(([, g]) => g.total));
    const tied = earners.filter(([, g]) => g.total === top);
    if (tied.length) gain(room, tied[rnd(tied.length)][0], 'jackpot', 500 + rnd(21) * 50, false);
  }
  for (const [pid, g] of Object.entries(room.gains)) {
    const p = room.players.get(pid);
    if (p) p.score = Math.max(0, p.score + g.total);
  }
}

// ---------------- game flow ----------------
export function createRoom() {
  const room = {
    code: newCode(), hostId: null, phase: 'lobby',
    // Every type on, derived from TYPES rather than listed. Spelling them out
    // meant a new round type was off in every new room, so nobody would ever
    // meet it — they would have to know it existed and go and switch it on.
    // Twelve, not eight: there are ten round types now, and a plan shorter than
    // the list cannot fit them all in — a whole game could go by without a
    // player meeting four of them.
    settings: { lang: 'en', rounds: 12, types: Object.fromEntries(TYPES.map(t => [t, true])), pace: 'normal', teams: false, public: true },
    players: new Map(), round: 0, gameNo: 0, current: null, deadline: null, timer: null,
    used: {}, customQ: [], plan: [], gains: {}, prevRank: {}, awards: [], bestLie: null, pairs: {}, rivals: {}, log: [], touched: Date.now(),
    balloon: { size: 0, target: 20 + rnd(20), pops: {} },
  };
  rooms.set(room.code, room);
  return room;
}

// Plan the whole game up front. The dealing rule lives in plan.js; what
// belongs here is which types the room can actually play.
//
// Round one used to be pinned to bluff, on the theory that it is the type
// everyone understands without being told. The cost was that every single
// game opened with the same screen, which reads as a game with one mode and
// eleven variations. It is drawn like any other round now.
export function planTypes(room) {
  const enabled = TYPES.filter(t => room.settings.types[t]);
  const crowd = connected(room).length;
  // Which modes this many people can play, read off MIN_PLAYERS rather than
  // named here. "likely" and "spy" were the two spelled out by hand, so the
  // four thresholds added after them went into the bag anyway and were pulled
  // back out when the round came up — which is where a repeat came from. At
  // three players that was 85% of games playing one mode twice while another
  // never appeared.
  const fits = enabled.filter(t => crowd >= (MIN_PLAYERS[t] || 1));
  return plan.drawPlan(fits.length ? fits : enabled, room.settings.rounds);
}

export function chooseMod(room) {
  if (room.round === room.settings.rounds) return { id: 'golden', mult: 3 };
  if (room.round === 1) return MODS[0];
  const total = MODS.reduce((n, m) => n + m.w, 0);
  let r = rnd(total);
  for (const m of MODS) if ((r -= m.w) < 0) return m;
  return MODS[0];
}

export function pickFrom(room, type, count = 1) {
  const bank = content[type];
  const used = room.used[type] || (room.used[type] = new Set());
  let idx = bank.map((_, i) => i).filter(i => !used.has(i));
  if (idx.length < count) { used.clear(); idx = bank.map((_, i) => i); }
  // Within what this room has not used, prefer what the people in it have not
  // met in an earlier game. room.used alone made the regulars — the players
  // who come back most — the players most likely to see a question twice.
  const pool = seen.fresh(idx, bank, type, room.seenBefore);
  const chosen = shuffle(pool.length >= count ? pool : idx).slice(0, count);
  chosen.forEach(i => used.add(i));
  const picked = chosen.map(i => bank[i]);
  seen.note(room, type, picked);
  return picked;
}

// Alone, four of the six round types work and two do not: "who's most
// likely" needs three people to be a question at all, and the spy needs four
// to have anyone to hide among. Rather than quietly dropping those rounds
// from a solo game, sit some bots down at the table.
//
// Only for a player who is genuinely on their own. With anyone else in the
// room the host decides, with the button.
export function fillForSolo(room) {
  if (humans(room).filter(p => p.connected).length !== 1) return;
  const enabled = TYPES.filter(t => room.settings.types[t]);
  const needed = Math.min(MAX_PLAYERS, Math.max(1, ...enabled.map(t => MIN_PLAYERS[t] || 1)));
  while (connected(room).length < needed && addBot(room));
}

export function startGame(room) {
  Object.assign(room, { round: 0, gameNo: room.gameNo + 1, gains: {}, awards: [], bestLie: null, used: {}, log: [] });
  for (const p of room.players.values()) { p.score = 0; p.streak = 0; p.stats = freshStats(); p.powers = freshPowers(); p.watching = false; }
  room.pairs = {}; room.rivals = {};
  for (const p of room.players.values()) p.ready = false;
  if (room.settings.teams) balanceTeams(room); else for (const p of room.players.values()) p.team = null;
  // Read once, at kickoff, for everyone signed in at the table. A player who
  // joins later plays the plan that was already drawn.
  room.seenThisGame = new Set();
  room.seenBefore = null;
  if (db.on()) {
    const who = seen.owners([...room.players.values()]);
    db.seenBy(who).then(set => { room.seenBefore = set; }).catch(() => {});
  }
  room.plan = planTypes(room);
  nextRound(room);
}

export function rankMap(room) {
  const m = {};
  [...room.players.values()].sort((a, b) => b.score - a.score).forEach((p, i) => { m[p.id] = i; });
  return m;
}

export function nextRound(room) {
  if (room.round >= room.settings.rounds) return finishGame(room);
  room.round += 1;
  const mod = chooseMod(room);
  room.gains = {};
  room.prevRank = rankMap(room);
  room.current = { type: roundType(room), mod: mod.id, mult: mod.mult, doubled: {}, peeked: {} };
  room.phase = 'spin';
  setTimer(room, pace(room, 'spin'), () => beginRound(room));
  broadcast(room);
}

export function beginRound(room) {
  const c = room.current;
  if (c.type === 'bluff') {
    Object.assign(c, { q: hostq.takeQuestion(room) || pickFrom(room, 'bluff')[0], lies: {}, votes: {}, options: [] });
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
  } else if (c.type === 'order') {
    // Four things to put in order, largest first. The values are never sent
    // while the round is live — they are the answer.
    const entry = pickFrom(room, 'order')[0];
    const items = shuffle(entry.items.map(it => ({ ...it, id: rid(6) })));
    const truth = items.slice().sort((a, b) => b.v - a.v).map(it => it.id);
    Object.assign(c, { q: entry.q, items, truth, orders: {} });
    room.phase = 'order';
    setTimer(room, pace(room, 'order'), () => revealOrder(room));
  } else if (c.type === 'higher') {
    const e = pickFrom(room, 'higher')[0];
    // Which side is shown first is drawn, so the answer is not always on the
    // same button for a player who has met the question before.
    const flip = rnd(2) === 1;
    Object.assign(c, {
      q: e.q,
      left: flip ? e.b : e.a,
      right: flip ? e.a : e.b,
      correct: (e.bigger === 'a') === !flip ? 'left' : 'right',
      picks: {}, fastest: null,
    });
    room.phase = 'higherPick';
    setTimer(room, pace(room, 'higherPick'), () => revealHigher(room));
  } else if (c.type === 'missing') {
    // Built from the Odd One Out bank: four things from one category, which is
    // exactly what this needs and costs the content banks nothing.
    const e = pickFrom(room, 'odd')[0];
    const items = shuffle([e.odd, ...e.rest]).map(x => ({ ...x, id: rid(6) }));
    Object.assign(c, { items, goneId: items[rnd(items.length)].id, picks: {}, fastest: null });
    room.phase = 'missWatch';
    setTimer(room, pace(room, 'missWatch'), () => startMissPick(room));
  } else if (c.type === 'minor') {
    Object.assign(c, { pair: pickFrom(room, 'minor')[0], picks: {} });
    room.phase = 'minorPick';
    setTimer(room, pace(room, 'minorPick'), () => revealMinor(room));
  } else if (c.type === 'two') {
    // The only round with no content bank: the players write it, about
    // themselves, while the clock runs.
    Object.assign(c, { sets: {}, order: [], idx: 0, picks: [] });
    room.phase = 'twoWrite';
    setTimer(room, pace(room, 'twoWrite'), () => startTwoGuess(room));
  } else if (c.type === 'name') {
    Object.assign(c, { q: pickFrom(room, 'name')[0], said: {} });
    room.phase = 'nameWrite';
    setTimer(room, pace(room, 'nameWrite'), () => revealName(room));
  } else if (c.type === 'many') {
    // The content is the room, not a fact: everyone answers yes or no about
    // themselves, then guesses how many said yes. That is why the same prompt
    // never plays the same way twice.
    Object.assign(c, { prompt: pickFrom(room, 'many')[0], said: {}, guesses: {} });
    room.phase = 'manyAsk';
    setTimer(room, pace(room, 'manyAsk'), () => startManyGuess(room));
  } else if (c.type === 'odd') {
    // Four things, one of which does not belong. The group is never named —
    // working out what the other three have in common is the round.
    const items = pickFrom(room, 'odd', ITEMS_PER_QUICK_ROUND).map(it => {
      const opts = shuffle([{ text: it.odd, ok: true }, ...it.rest.map(r => ({ text: r }))]).map(o => ({ ...o, id: rid(6) }));
      return { why: it.why, opts, correctId: opts.find(o => o.ok).id };
    });
    Object.assign(c, { items, idx: 0, fastest: [], correctCount: {} });
    c.answers = c.items.map(() => ({}));
    return startQuickItem(room);
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
