// Which round type each round of a game will be.
//
// The rule: a type cannot come round again until every other enabled type has
// been played. So the plan is dealt from a bag holding one of each; when the
// bag empties it is refilled and reshuffled. A twelve-round game with eleven
// types plays all eleven and then one repeat, never six of one and none of
// another.
//
// This replaced a weighted draw that picked each round independently. That was
// fine on average and bad in a single game, which is the only place anyone
// experiences it: a run of three Bluffs and no Spy at all is a perfectly
// ordinary outcome of rolling a die twelve times, and it reads as the game
// being broken. It also means Bluff no longer comes up twice as often as the
// rest — a bag cannot hold a preference, and equal shares are the price of
// the guarantee.
//
// Lives in its own file because the guarantee is worth a real test, and a
// function buried in the server can only be checked by reading it.

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawPlan(enabled, rounds) {
  const types = (enabled || []).filter(Boolean);
  if (!types.length || rounds <= 0) return [];
  const plan = [];
  let bag = [];
  while (plan.length < rounds) {
    if (!bag.length) {
      bag = shuffled(types);
      // A refill can otherwise put the same type on both sides of the seam —
      // allowed by the rule, since the cycle did complete, but it still reads
      // as the same round twice in a row. Swapping the first two fixes it,
      // and they are always different types.
      if (plan.length && bag.length > 1 && bag[0] === plan[plan.length - 1]) {
        [bag[0], bag[1]] = [bag[1], bag[0]];
      }
    }
    plan.push(bag.shift());
  }
  return plan;
}

module.exports = { drawPlan };
