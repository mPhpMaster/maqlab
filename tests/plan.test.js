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
const { drawPlan } = require('../plan');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const TYPES = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));

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
  assert.match(server, /return plan\.drawPlan\(enabled, room\.settings\.rounds\)/,
    'planTypes stopped using the shared planner');
  assert.ok(!/weighted\[rnd\(weighted\.length\)\]/.test(server),
    'the old independent weighted draw is back, and it can repeat a type before the rest have played');
});
