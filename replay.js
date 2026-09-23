// A finished match is worth more than its final score. Every question, every
// lie somebody wrote, every vote and every guess was already on screen while
// the game was running — this keeps it, so /match/<id> can show the whole
// match instead of a column of numbers.
//
// Text is flattened into the language the game was played in rather than kept
// bilingual on purpose: a replay should show what the players actually saw,
// not a translation of it.
//
// Nothing here is new information. Every field below is taken from a reveal
// screen that was broadcast to everyone in the room, so a shared match link
// gives away nothing that the players did not already see — including the
// spy's identity, which is revealed at the end of the round by design.

// A guard, not a feature: rounds are capped in settings long before this, and
// it only exists so a bug in the round loop cannot grow a row without end.
const MAX_ROUNDS = 40;

// Content is bilingual ({ar, en}); answers players typed are plain strings.
const say = (v, L) => (v && typeof v === 'object' && !Array.isArray(v) ? v[L] ?? v.en ?? '' : v);

// One entry per quick-round item (blitz / emoji / odd all share the shape).
function quickItems(c, L) {
  return (c.items || []).map((it, i) => {
    const answers = {};
    for (const [pid, a] of Object.entries(c.answers[i] || {})) {
      answers[pid] = { v: a.v, id: a.id, ok: !!a.correct, t: a.t };
    }
    const row = { answers, fastest: (c.fastest || [])[i] || null };
    if (c.type === 'blitz') return Object.assign(row, { text: say(it.s, L), truth: !!it.t });
    row.opts = it.opts.map(o => ({ id: o.id, text: say(o.text, L) }));
    row.correctId = it.correctId;
    if (c.type === 'emoji') row.e = it.e; else row.why = say(it.why, L);
    return row;
  });
}

// Called once per round, at the moment the scoreboard opens: by then every
// reveal has run, so the round's result is final and room.gains still holds
// what this round alone was worth.
function roundEntry(room, L) {
  const c = room.current;
  if (!c) return null;
  const e = { n: room.round, type: c.type, mod: c.mod, pts: {} };
  for (const [pid, g] of Object.entries(room.gains || {})) if (g && g.total) e.pts[pid] = g.total;

  if (c.type === 'bluff') {
    e.q = say(c.q.q, L);
    e.truth = say(c.q.a, L);
    e.options = (c.options || []).map(o => ({
      id: o.id, text: o.text, truth: !!o.truth, house: !!o.house, authors: (o.authors || []).slice(),
    }));
    e.votes = { ...c.votes };
  } else if (c.type === 'number') {
    e.q = say(c.q.q, L);
    e.answer = c.q.a;
    e.guesses = { ...c.guesses };
    e.bulls = (c.numResults || []).filter(r => r.bull).map(r => r.pid);
  } else if (c.type === 'likely') {
    e.q = say(c.prompt, L);
    e.votes = { ...c.lvotes };
    e.winners = (c.winners || []).slice();
  } else if (c.type === 'spy') {
    e.word = say(c.word, L);
    e.cat = say(c.cat, L);
    e.spyId = c.spyId;
    e.clues = { ...c.clues };
    e.votes = { ...c.votes };
    e.guess = c.guess || null;
    e.caught = !!c.caught;
    e.guessRight = !!c.guessRight;
  } else if (c.type === 'order') {
    e.q = say(c.q, L);
    e.items = (c.items || []).map(it => ({ id: it.id, text: say(it, L), v: it.v }));
    e.truth = (c.truth || []).slice();
    e.orders = { ...c.orders };
  } else {
    e.items = quickItems(c, L);
  }
  return e;
}

// The roster is part of the replay rather than read back from game_results,
// because that table only has rows for signed-in players — a round whose best
// lie was written by a guest would replay with a blank where the author goes.
const roster = ranked =>
  ranked.map((p, i) => ({
    pid: p.id, userId: p.userId || null, name: p.name, avatar: p.avatar,
    bot: !!p.bot, score: p.score, place: i + 1,
  }));

module.exports = { MAX_ROUNDS, roundEntry, roster, say };
