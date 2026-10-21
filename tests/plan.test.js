// A type must not come round again until every other enabled type has been
// played. The old planner drew each round independently, which is correct on
// average and wrong in the only place anyone sees it — a single game could
// deal three Bluffs and no Spy at all, which reads as the game being broken.
//
// These run thousands of plans rather than one, because the old behaviour was
// not a bug that always happened: it was a bug that sometimes happened, and a
// single sample would have passed under it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { drawPlan, pickRound, leastPlayed } = require('../plan');

const server = require('../scripts/server-source')();
const TYPES = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));
// The crowd each mode needs, read out of the server so a new threshold is
// covered here without anyone remembering to add it. That is exactly the fault
// this file is about: MIN_PLAYERS grew to six entries while the code honouring
// it named two of them.
const MIN = {};
for (const m of server.match(/const MIN_PLAYERS = \{(.*?)\};/)[1].matchAll(/(\w+): (\d+)/g)) MIN[m[1]] = Number(m[2]);
const needs = t => MIN[t] || 1;

// Walks a plan and fails on the first type that comes back before the cycle
// it belongs to has been completed.
function firstEarlyRepeat(plan, enabled) {
  let cycle = new Set();
  for (let i = 0; i < plan.length; i++) {
    const t = plan[i];
    if (!cycle.has(t)) { cycle.add(t); continue; }
    if (cycle.size < enabled.length) {
      return `"${t}" came back at round ${i + 1} after only ${cycle.size} of ${enabled.length} types`;
    }
    cycle = new Set([t]);
  }
  return null;
}

test('no type repeats until every other one has played', () => {
  for (let trial = 0; trial < 3000; trial++) {
    const howMany = 2 + (trial % (TYPES.length - 1));
    const enabled = TYPES.slice(0, howMany);
    const rounds = 1 + (trial % 30);
    const plan = drawPlan(enabled, rounds);
    const bad = firstEarlyRepeat(plan, enabled);
    assert.equal(bad, null, `${bad}\n  enabled: ${enabled.join(',')}\n  plan: ${plan.join(' ')}`);
  }
});

test('a game shorter than the list plays each type at most once', () => {
  for (let trial = 0; trial < 500; trial++) {
    const plan = drawPlan(TYPES, 1 + (trial % TYPES.length));
    assert.equal(new Set(plan).size, plan.length, `a type was dealt twice: ${plan.join(' ')}`);
  }
});

test('a game at least as long as the list plays all of them', () => {
  for (let trial = 0; trial < 500; trial++) {
    const plan = drawPlan(TYPES, TYPES.length + (trial % 10));
    for (const t of TYPES) assert.ok(plan.includes(t), `"${t}" never came up in ${plan.join(' ')}`);
  }
});

test('the same type never lands twice in a row', () => {
  for (let trial = 0; trial < 3000; trial++) {
    const enabled = TYPES.slice(0, 2 + (trial % (TYPES.length - 1)));
    const plan = drawPlan(enabled, 25);
    for (let i = 1; i < plan.length; i++) {
      assert.notEqual(plan[i], plan[i - 1], `"${plan[i]}" twice in a row: ${plan.join(' ')}`);
    }
  }
});

// Equal shares are the consequence of the rule, not a separate goal — but if
// the bag ever stopped being refilled properly this is what would drift.
test('over a long game every type gets a near-equal share', () => {
  const counts = {};
  const rounds = TYPES.length * 20;
  for (const t of drawPlan(TYPES, rounds)) counts[t] = (counts[t] || 0) + 1;
  for (const t of TYPES) {
    assert.ok(Math.abs(counts[t] - 20) <= 1, `"${t}" got ${counts[t]} of ${rounds}, expected about 20`);
  }
});

test('the order actually varies between games', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(drawPlan(TYPES, TYPES.length).join(','));
  assert.ok(seen.size > 150, `only ${seen.size} different orders in 200 games — the shuffle is not shuffling`);
});

test('a room with one type left still gets a full game', () => {
  const plan = drawPlan(['bluff'], 8);
  assert.equal(plan.length, 8);
  assert.deepEqual(new Set(plan), new Set(['bluff']));
});

test('nothing to deal is an empty plan, not a crash', () => {
  assert.deepEqual(drawPlan([], 10), []);
  assert.deepEqual(drawPlan(TYPES, 0), []);
});

test('the server asks the planner rather than keeping its own copy', () => {
  assert.match(server, /return plan\.drawPlan\(fits\.length \? fits : enabled, room\.settings\.rounds\)/,
    'planTypes stopped using the shared planner');
  assert.ok(!/weighted\[rnd\(weighted\.length\)\]/.test(server),
    'the old independent weighted draw is back, and it can repeat a type before the rest have played');
});

// ---- the crowd the plan was dealt for is not the crowd that plays it ----

test('the plan only holds modes the room is big enough for', () => {
  // Naming the modes to leave out is how this broke: the two that were named
  // got filtered, the four added later did not, so they were dealt and then
  // swapped away at random when the round came up.
  const fn = server.match(/function planTypes\(room\)[\s\S]*?\n}\n/);
  assert.ok(fn, 'planTypes moved');
  assert.match(fn[0], /crowd >= \(MIN_PLAYERS\[t\] \|\| 1\)/,
    'planTypes is not reading the thresholds it is meant to honour');
  assert.ok(!/t !== '\w+'/.test(fn[0]), 'planTypes is naming modes by hand again');
});

test('a round the room can still play is the round that was planned', () => {
  const plan = ['bluff', 'emoji', 'odd'];
  assert.equal(pickRound(plan, 1, () => true), 'emoji');
  assert.deepEqual(plan, ['bluff', 'emoji', 'odd'], 'the plan was rewritten for no reason');
});

test('a round the room is too small for is traded, not replaced', () => {
  // A trade keeps the bag's counts exactly: the same modes are played, in a
  // different order. A replacement invents an extra appearance of something
  // and loses the mode it stood in for.
  const plan = ['bluff', 'spy', 'odd', 'emoji'];
  const ok = t => t !== 'spy';
  const got = pickRound(plan, 1, ok);
  assert.ok(ok(got), 'traded in "' + got + '", which the room cannot play either');
  assert.deepEqual([...plan].sort(), ['bluff', 'emoji', 'odd', 'spy'], 'the plan is no longer the same set of rounds');
  assert.equal(plan[1], got);
  assert.ok(plan.includes('spy'), 'the mode that needed a crowd was dropped instead of moved later');
});

test('nothing left in the plan to trade with says so', () => {
  assert.equal(pickRound(['bluff', 'spy'], 1, t => t !== 'spy'), null);
  assert.equal(pickRound([], 0, () => true), null);
});

test('an unavoidable repeat is the mode that has waited longest', () => {
  assert.equal(leastPlayed(['bluff', 'odd', 'bluff', 'emoji'], ['bluff', 'odd', 'emoji']), 'odd');
  assert.equal(leastPlayed(['bluff'], ['bluff', 'odd']), 'odd');
  assert.equal(leastPlayed([], []), null);
});

test('an unavoidable repeat is not the round that just played', () => {
  for (let i = 0; i < 200; i++) {
    assert.notEqual(leastPlayed(['odd'], ['bluff', 'odd']), 'odd', 'the same mode twice in a row with another one free');
  }
});

// The whole of it, end to end: deal a plan for a room of n and walk the game
// asking for each round the way the server does. This is the claim being made
// to the player - not the same mode twice unless there is nothing else left -
// and none of the pieces above tests it on its own.
function playOut(crowd, rounds) {
  const fits = TYPES.filter(t => crowd >= needs(t));
  const plan = drawPlan(fits.length ? fits : TYPES, rounds);
  const ok = t => crowd >= needs(t);
  const played = [];
  for (let i = 0; i < rounds; i++) {
    const got = pickRound(plan, i, ok) || leastPlayed(plan.slice(0, i), TYPES.filter(ok)) || 'bluff';
    plan[i] = got;
    played.push(got);
  }
  return played;
}

test('a small room plays everything it can before anything comes round twice', () => {
  for (const crowd of [1, 2, 3, 4, 5, 8]) {
    const playable = TYPES.filter(t => crowd >= needs(t)).length;
    for (let trial = 0; trial < 400; trial++) {
      const played = playOut(crowd, 12);
      assert.equal(played.length, 12);
      for (const t of played) {
        assert.ok(crowd >= needs(t), crowd + ' players were given "' + t + '", which needs ' + needs(t));
      }
      const at = played.findIndex((t, i) => played.indexOf(t) < i);
      if (at >= 0) {
        const before = new Set(played.slice(0, at)).size;
        assert.equal(before, Math.min(playable, 12),
          crowd + ' players: "' + played[at] + '" came back at round ' + (at + 1) +
          ' with only ' + before + ' of ' + playable + ' played\n  ' + played.join(' '));
      }
      // and a forced repeat is spread, not piled on one mode
      const counts = {};
      for (const t of played) counts[t] = (counts[t] || 0) + 1;
      const most = Math.max(...Object.values(counts));
      assert.ok(most <= Math.ceil(12 / Math.min(playable, 12)),
        crowd + ' players: one mode played ' + most + ' times\n  ' + played.join(' '));
    }
  }
});

test('a room that shrinks mid-game still does not repeat itself', () => {
  // Five people start and three leave after round four. The modes that needed
  // the crowd move to the back of the plan instead of being swapped out for
  // whatever was handy.
  for (let trial = 0; trial < 400; trial++) {
    const plan = drawPlan(TYPES, 12);
    const played = [];
    for (let i = 0; i < 12; i++) {
      const crowd = i < 4 ? 5 : 2;
      const ok = t => crowd >= needs(t);
      const got = pickRound(plan, i, ok) || leastPlayed(plan.slice(0, i), TYPES.filter(ok)) || 'bluff';
      plan[i] = got;
      played.push(got);
      assert.ok(ok(got), 'round ' + (i + 1) + ' dealt "' + got + '" to ' + crowd + ' players');
    }
    const counts = {};
    for (const t of played) counts[t] = (counts[t] || 0) + 1;
    for (const t of Object.keys(counts)) {
      assert.ok(counts[t] <= 2, '"' + t + '" played ' + counts[t] + ' times in ' + played.join(' '));
    }
  }
});

test('the server trades rather than reaching for a random mode', () => {
  const fn = server.match(/function roundType\(room\)[\s\S]*?\n}\n/);
  assert.ok(fn, 'roundType is gone - the plan is no longer checked against the crowd');
  assert.match(fn[0], /plan\.pickRound\(room\.plan, i, ok\)/, 'the round is no longer traded inside the plan');
  assert.match(fn[0], /plan\.leastPlayed\(/, 'a forced repeat is no longer the most overdue mode');
  assert.ok(!/alt\[rnd\(alt\.length\)\]/.test(server),
    'the random substitute is back, and it repeats a mode while others never come up');
});
