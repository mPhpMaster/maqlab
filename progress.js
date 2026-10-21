// When is everyone done? Each answering phase keeps its answers in its own
// shape, so "has this player answered" is a different question in each one.
//
// It used to be asked twice: once in every submit function, and again in
// checkProgress, which runs when someone leaves or is kicked. The second copy
// stopped at the nine phases that existed when it was written. So when the
// last player a table was waiting for left during one of the nine newer
// phases, everyone else sat out the whole clock — up to 95 seconds in Two
// Truths — with every answer already in.
//
// One table now, read by both. tests/progress.test.js fails if a phase in
// ACTIVE (server.js) is missing here.
const quick = (c, id) => !!c.answers[c.idx][id];

const ANSWERED = {
  write: (c, id) => !!c.lies[id],
  vote: (c, id) => !!c.votes[id],
  guess: (c, id) => c.guesses[id] != null,
  likelyVote: (c, id) => !!c.lvotes[id],
  blitz: quick,
  emoji: quick,
  odd: quick,
  order: (c, id) => !!c.orders[id],
  spyClue: (c, id) => !!c.clues[id],
  spyVote: (c, id) => !!c.votes[id],
  manyAsk: (c, id) => c.said[id] != null,
  manyGuess: (c, id) => c.guesses[id] != null,
  nameWrite: (c, id) => !!c.said[id],
  twoWrite: (c, id) => !!c.sets[id],
  // Whoever wrote the set on screen does not guess their own.
  twoGuess: (c, id) => id === c.order[c.idx] || c.picks[c.idx][id] != null,
  minorPick: (c, id) => !!c.picks[id],
  higherPick: (c, id) => !!c.picks[id],
  missPick: (c, id) => !!c.picks[id],
};

// players is who is still in the room. Nobody left means nothing to finish:
// the room is reaped by the cleanup sweep instead.
function allAnswered(phase, c, players) {
  const has = ANSWERED[phase];
  return !!(has && c && players.length && players.every(p => has(c, p.id)));
}

module.exports = { ANSWERED, allAnswered };
