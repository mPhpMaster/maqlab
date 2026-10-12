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

// The round that actually comes up, when the crowd is not the crowd the plan
// was dealt for. Some modes need three or four people; the plan is dealt once
// at kickoff and players leave.
//
// The rule is the same rule: no mode twice until the rest have had their turn.
// So the answer is a trade, not a fresh draw — the bag dealt one of each, and
// swapping two rounds of the same plan keeps every count exactly where it was.
// Reaching outside the plan for a random playable mode is what broke the
// guarantee: it could deal a third Blitz while Odd One Out never appeared.
//
// `ok(type)` answers whether the room as it stands can play that mode.
// Returns the type to play, or null when nothing left in the plan fits — the
// caller then has a genuinely exhausted list and has to repeat something.
function pickRound(plan, index, ok) {
  if (!Array.isArray(plan) || index < 0 || index >= plan.length) return null;
  if (ok(plan[index])) return plan[index];
  const prev = index > 0 ? plan[index - 1] : null;
  // Two passes, so a trade only lands the same mode twice in a row when there
  // was nothing else left to trade with.
  for (const avoidPrev of [true, false]) {
    for (let j = index + 1; j < plan.length; j++) {
      if (!ok(plan[j]) || (avoidPrev && plan[j] === prev)) continue;
      [plan[index], plan[j]] = [plan[j], plan[index]];
      return plan[index];
    }
  }
  return null;
}

// When a repeat is unavoidable — a room small enough that it has played
// everything it can play — this is which one to repeat: whichever has been
// waiting longest. A room of two has eight playable modes and twelve rounds,
// so four rounds have to double up; they should be four different modes.
function leastPlayed(played, candidates) {
  const pool = (candidates || []).filter(Boolean);
  if (!pool.length) return null;
  const log = played || [];
  const n = {};
  for (const t of log) n[t] = (n[t] || 0) + 1;
  const low = Math.min(...pool.map(t => n[t] || 0));
  let least = pool.filter(t => (n[t] || 0) === low);
  const prev = log[log.length - 1];
  if (least.length > 1 && prev) {
    const notPrev = least.filter(t => t !== prev);
    if (notPrev.length) least = notPrev;
  }
  return least[Math.floor(Math.random() * least.length)];
}

module.exports = { drawPlan, pickRound, leastPlayed };
