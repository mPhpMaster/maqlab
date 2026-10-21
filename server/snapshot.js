// What each player is sent: the room as that player is allowed to see it.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { MAX_PLAYERS, MIN_PLAYERS, bots, hostq, progress } from './base.js';
import { connected, freshPowers, freshStats, rid, rnd, shuffle } from './helpers.js';
import { botAction } from './flow.js';
import { correctPairs } from './rounds-b.js';
import { isRevealPhase } from './end.js';

// ---------------- snapshots ----------------
export function publicPlayer(p) {
  return { id: p.id, name: p.name, avatar: p.avatar, score: p.score, connected: p.connected, streak: p.streak, powers: p.powers, team: p.team, ready: p.ready, userId: p.userId || null, bot: !!p.bot, watching: !!p.watching };
}

export const MAX_BOTS = 5;
export const humans = room => [...room.players.values()].filter(p => !p.bot);
export const randomAvatar = () => ({ s: rnd(6), c: rnd(14), e: rnd(10), m: rnd(10), h: rnd(12) });

export function addBot(room) {
  if (room.players.size >= MAX_PLAYERS) return null;
  if ([...room.players.values()].filter(p => p.bot).length >= MAX_BOTS) return null;
  const p = {
    id: rid(), name: bots.freeName([...room.players.values()].map(x => x.name)),
    avatar: randomAvatar(), score: 0, streak: 0, stats: freshStats(), powers: freshPowers(),
    connected: true, socketId: null, team: null, ready: true, userId: null, bot: true,
  };
  if (room.settings.teams) p.team = smallerTeam(room);
  room.players.set(p.id, p);
  return p;
}

// Bots exist to make a round playable, so they go when the round types that
// needed them are no longer in play — and they must never be the last ones
// standing, or the room would keep itself alive with nobody in it.
export function dropBots(room) {
  for (const [id, p] of room.players) if (p.bot) room.players.delete(id);
}

// How long this player took, from the moment the phase opened. Stored on the
// round rather than the player: it is a fact about the round they were in.
export function tookMs(room, pid) {
  const c = room.current;
  if (!c || !room.phaseStart) return;
  (c.ms || (c.ms = {}))[pid] = Math.max(0, Date.now() - room.phaseStart);
}

// One name for "this item, in this round", used both where a peek is stored
// and where it is read back. Spelling it out separately in each place is how
// Odd One Out ended up with a button the client happily enabled and the server
// refused: the round was added, the power was not.
export const peekKey = (c, idx) => (c.type === 'bluff' ? 'vote' : c.type[0] + (idx == null ? c.idx : idx));

export function snapshot(room, pid) {
  const c = room.current;
  const s = {
    code: room.code, hostId: room.hostId, phase: room.phase, settings: room.settings,
    players: [...room.players.values()].map(publicPlayer),
    round: room.round, gameNo: room.gameNo, deadline: room.deadline, now: Date.now(),
    // What the host's control should say: a reveal or the scoreboard is
    // waiting to move on, anything else is still being answered and gets
    // skipped. Decided here off the set the server already keeps, so the
    // client does not hold its own copy of which phases are which.
    clock: isRevealPhase(room.phase) || room.phase === 'scores' ? 'next' : 'skip',
    // Whether players are answering right now, from the same table that
    // decides when everyone is in. The timer ring used to keep its own list,
    // which stopped at ten phases, so the newer modes had no ring.
    answering: !!progress.ANSWERED[room.phase],
    // How many people each mode needs, so the lobby can say so on the toggle
    // itself. Sent rather than copied into the client: the client had no idea
    // these thresholds existed, so a host could switch everything else off
    // and start a game whose every round was unplayable.
    mins: MIN_PLAYERS,
    teamScores: teamScores(room), balloon: { size: room.balloon.size, pops: room.balloon.pops },
  };
  // The host's own questions go only to the host: everyone else would be
  // reading the answers to rounds they have not played yet. The rest of the
  // room sees how many are queued, which is all they need to know.
  s.hostQ = { count: hostq.pending(room), max: hostq.MAX_QUESTIONS };
  if (pid === room.hostId) s.hostQ.list = (room.customQ || []).map(e => ({ q: e.q.en, a: e.a.en, played: !!e.played }));
  if (!c) return s;
  const L = room.settings.lang, ph = room.phase;
  s.current = { type: c.type, mod: c.mod, doubled: Object.keys(c.doubled || {}) };
  const peeked = key => (c.peeked[pid] && c.peeked[pid].key === key ? c.peeked[pid].ids : []);

  if (c.type === 'bluff' && ['write', 'vote', 'bluffReveal'].includes(ph)) {
    s.current.question = c.q.q[L];
    s.current.submitted = Object.keys(c.lies);
    s.current.myLie = c.lies[pid] || null;
    if (ph === 'vote') {
      const hidden = peeked(peekKey(c));
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
    const hidden = peeked(peekKey(c));
    Object.assign(s.current, { idx: c.idx, total: c.items.length, emoji: it.e });
    s.current.options = it.opts.map(o => ({ id: o.id, text: o.text[L], hidden: hidden.includes(o.id) }));
    const ans = c.answers[c.idx];
    s.current.answered = Object.keys(ans);
    s.current.myAnswer = ans[pid] ? ans[pid].id : null;
    if (ph === 'emojiResult') Object.assign(s.current, { correctId: it.correctId, results: ans, fastest: c.fastest[c.idx] || null });
  }
  if (c.type === 'order' && ['order', 'orderResult'].includes(ph)) {
    s.current.question = c.q[L];
    s.current.items = c.items.map(it => ({ id: it.id, text: it[L] }));
    s.current.submitted = Object.keys(c.orders);
    s.current.myOrder = c.orders[pid] || null;
    // Values and the true order go out only once the round is over: together
    // they are the whole answer.
    if (ph === 'orderResult') {
      const by = Object.fromEntries(c.items.map(it => [it.id, it]));
      s.current.truth = c.truth.map(id => ({ id, text: by[id][L], v: by[id].v }));
      s.current.results = Object.fromEntries(Object.entries(c.orders).map(([pid2, seq]) => [pid2, { seq, pairs: correctPairs(seq, c.truth) }]));
    }
  }
  if (c.type === 'odd' && ['odd', 'oddResult'].includes(ph)) {
    const it = c.items[c.idx];
    const hidden = peeked(peekKey(c));
    Object.assign(s.current, { idx: c.idx, total: c.items.length });
    s.current.options = it.opts.map(o => ({ id: o.id, text: o.text[L], hidden: hidden.includes(o.id) }));
    const ans = c.answers[c.idx];
    s.current.answered = Object.keys(ans);
    s.current.myAnswer = ans[pid] ? ans[pid].id : null;
    // The reason is only ever sent once the answer is out, or it would be
    // the answer.
    if (ph === 'oddResult') Object.assign(s.current, { correctId: it.correctId, why: it.why[L], results: ans, fastest: c.fastest[c.idx] || null });
  }
  if (c.type === 'likely' && ['likelyVote', 'likelyReveal'].includes(ph)) {
    s.current.prompt = c.prompt[L];
    s.current.voted = Object.keys(c.lvotes);
    s.current.myVote = c.lvotes[pid] || null;
    if (ph === 'likelyReveal') Object.assign(s.current, { votes: c.lvotes, tally: c.tally, winners: c.winners });
  }
  if (c.type === 'higher' && ['higherPick', 'higherReveal'].includes(ph)) {
    Object.assign(s.current, { question: c.q[L], left: c.left[L], right: c.right[L] });
    s.current.myPick = c.picks[pid] || null;
    s.current.picked = Object.keys(c.picks);
    // Which side is bigger is the answer, so it waits for the reveal.
    if (ph === 'higherReveal') Object.assign(s.current, { correct: c.correct, picks: c.picks, fastest: c.fastest });
  }
  if (c.type === 'missing' && ['missWatch', 'missPick', 'missReveal'].includes(ph)) {
    s.current.items = c.items.map(it => ({ id: it.id, text: it[L] }));
    s.current.watching = ph === 'missWatch';
    // During the watch phase everything is on screen; from the pick phase on,
    // the one that went is simply not in the list the client is given.
    if (ph !== 'missWatch') s.current.items = s.current.items.filter(it => it.id !== c.goneId);
    s.current.all = c.items.map(it => ({ id: it.id, text: it[L] }));
    s.current.myPick = c.picks[pid] || null;
    s.current.picked = Object.keys(c.picks);
    if (ph === 'missReveal') Object.assign(s.current, { goneId: c.goneId, picks: c.picks, fastest: c.fastest });
  }
  if (c.type === 'minor' && ['minorPick', 'minorReveal'].includes(ph)) {
    Object.assign(s.current, { a: c.pair.a[L], b: c.pair.b[L] });
    s.current.myPick = c.picks[pid] || null;
    // Only how many have answered, never which side they took: knowing the
    // split before you choose is the entire game, handed over.
    s.current.picked = Object.keys(c.picks);
    if (ph === 'minorReveal') {
      Object.assign(s.current, { picks: c.picks, winners: c.winners, counts: c.counts });
    }
  }
  if (c.type === 'two' && ['twoWrite', 'twoGuess', 'twoResult'].includes(ph)) {
    s.current.submitted = Object.keys(c.sets);
    s.current.mine = c.sets[pid] || null;
    if (ph !== 'twoWrite') {
      const whose = c.order[c.idx];
      const set = c.sets[whose] || { lines: [], lie: 0 };
      Object.assign(s.current, {
        whose, idx: c.idx, total: c.order.length, lines: set.lines,
        myPick: c.picks[c.idx] ? c.picks[c.idx][pid] : null,
        picked: Object.keys(c.picks[c.idx] || {}),
      });
      // Which line is the lie is the answer, so it waits for the result. The
      // author is the exception: it is their own lie, they already know.
      if (ph === 'twoResult' || pid === whose) s.current.lie = set.lie;
      if (ph === 'twoResult') s.current.picks = c.picks[c.idx];
    }
  }
  if (c.type === 'name' && ['nameWrite', 'nameReveal'].includes(ph)) {
    s.current.prompt = c.q.q[L];
    s.current.submitted = Object.keys(c.said);
    s.current.mine = c.said[pid] || null;
    // Everyone's answers go out together at the reveal. Sending them while
    // people are still writing would turn the round into copying.
    if (ph === 'nameReveal') s.current.groups = (c.groups || []).map(g => ({ text: g.text, ids: g.ids }));
  }
  if (c.type === 'many' && ['manyAsk', 'manyGuess', 'manyReveal'].includes(ph)) {
    s.current.prompt = c.prompt[L];
    s.current.answered = Object.keys(c.said);
    s.current.myAnswer = c.said[pid] == null ? null : c.said[pid];
    s.current.total = connected(room).length;
    if (ph === 'manyGuess' || ph === 'manyReveal') {
      s.current.guessed = Object.keys(c.guesses);
      s.current.myGuess = c.guesses[pid] == null ? null : c.guesses[pid];
    }
    // The count is the answer. It goes out at the reveal and not one phase
    // before, or there is nothing left to guess.
    if (ph === 'manyReveal') Object.assign(s.current, { count: c.count, yesIds: c.yesIds, guesses: c.guesses });
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

export function teamScores(room) {
  if (!room.settings.teams) return null;
  const t = { A: 0, B: 0 };
  for (const p of room.players.values()) if (p.team && (p.connected || p.score)) t[p.team] += p.score;
  return t;
}
export function laughCounts(c) {
  const n = {};
  for (const id of Object.values(c.laughs || {})) n[id] = (n[id] || 0) + 1;
  return n;
}
export function smallerTeam(room) {
  const ps = connected(room);
  return ps.filter(p => p.team === 'A').length <= ps.filter(p => p.team === 'B').length ? 'A' : 'B';
}
export function balanceTeams(room) {
  const ps = shuffle(connected(room));
  for (const p of ps) if (!p.team) p.team = smallerTeam(room);
  // neither team may be empty when there are 2+ players
  const a = ps.filter(p => p.team === 'A'), b = ps.filter(p => p.team === 'B');
  if (ps.length > 1 && !a.length) b[0].team = 'A';
  if (ps.length > 1 && !b.length) a[0].team = 'B';
}

// Bots act once per step, through the same submit functions a human calls.
// The step key stops a re-broadcast from queueing a second answer, and every
// timer re-checks it on the way out so a bot that was still "thinking" when
// the round moved on simply does nothing.
export function scheduleBots(room) {
  const c = room.current;
  const key = `${room.gameNo}:${room.round}:${room.phase}:${c && c.idx != null ? c.idx : ''}`;
  if (room.botKey === key) return;
  room.botKey = key;
  const mine = [...room.players.values()].filter(p => p.bot);
  // With nobody human left there is no game to play and no one to play it
  // for. Bots must never be the reason a room stays warm.
  if (!mine.length || !c || !humans(room).some(p => p.connected)) return;

  for (const b of mine) {
    const act = botAction(room, b);
    if (!act) continue;
    setTimeout(() => {
      // The world may have moved several times while this was pending.
      if (room.botKey !== key || !room.players.get(b.id)) return;
      try { act(); } catch (e) { console.error('bot action failed:', e.message); }
    }, bots.thinkFor(room.phase));
  }
}
