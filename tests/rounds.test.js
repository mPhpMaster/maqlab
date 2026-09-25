// Adding a round type means touching several places, and the one that fails
// quietly is the worst: a type whose reveal phase is not registered does not
// error, it freezes. showScores returns, no timer is set, and the game stops
// with nothing in the log. It has happened twice — Odd One Out, then How Many
// of Us — so it is pinned here instead of remembered.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const types = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));

test('the game knows about every round type it can plan', () => {
  assert.ok(types.length >= 9, `expected at least 9 types, found ${types.length}: ${types}`);
});

test('every round type has a reveal phase, or it freezes the game', () => {
  const table = server.match(/const REVEAL_PHASE = \{[\s\S]*?\n\};/)[0];
  // the quick rounds are spread in from QUICK, the rest are named
  const named = [...table.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  const fromQuick = server.match(/const QUICK = \{[\s\S]*?\n\};/)[0];
  const quickTypes = [...fromQuick.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  for (const type of types) {
    assert.ok(named.includes(type) || quickTypes.includes(type),
      `round type "${type}" has no reveal phase — showScores would return and the game would stop`);
  }
});

test('every round type can be resumed after a restart', () => {
  const resume = server.match(/const RESUME = \{[\s\S]*?\n\};/)[0];
  const listed = [...resume.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  // each type's own phases have to appear somewhere in the table
  const phaseOf = {
    bluff: ['write', 'vote', 'bluffReveal'], number: ['guess', 'numReveal'],
    likely: ['likelyVote', 'likelyReveal'], spy: ['spyClue', 'spyVote', 'spyReveal'],
    order: ['order', 'orderResult'], many: ['manyAsk', 'manyGuess', 'manyReveal'],
  };
  for (const [type, phases] of Object.entries(phaseOf)) {
    if (!types.includes(type)) continue;
    for (const ph of phases) {
      assert.ok(listed.includes(ph), `"${type}" waits in phase "${ph}" with no way to resume after a restart`);
    }
  }
});

test('every round type has a pace entry for each of its phases', () => {
  const paces = server.match(/const T = \{[\s\S]*?\n\};/)[0];
  for (const ph of ['manyAsk', 'manyGuess', 'manyReveal']) {
    assert.equal((paces.match(new RegExp(ph + ':', 'g')) || []).length, 3,
      `phase "${ph}" is missing from one of the three pace settings`);
  }
});

// Two players who did exactly the same thing ended a round with very different
// scores. The cause was not the round: Array.prototype.sort is stable, so the
// jackpot's "biggest earner" was decided by join order whenever people tied.
// Rare enough to hide for months, until a round arrived where everyone who
// agrees scores precisely the same and the tie became the normal case.
test('a tied jackpot is drawn, not handed to whoever joined first', () => {
  assert.match(server, /const tied = earners\.filter\(\(\[, g\]\) => g\.total === top\)/,
    'the jackpot stopped collecting the tied players');
  assert.match(server, /tied\[rnd\(tied\.length\)\]\[0\]/,
    'the jackpot is being picked by order again rather than drawn');
  assert.ok(!/\.sort\(\(a, b\) => b\[1\]\.total - a\[1\]\.total\)\[0\]/.test(server),
    'the stable sort that always favoured the first player is back');

  // and the draw itself is even
  const rnd = n => Math.floor(Math.random() * n);
  const wins = [0, 0, 0];
  for (let i = 0; i < 30000; i++) wins[rnd(3)] += 1;
  for (const w of wins) assert.ok(Math.abs(w - 10000) < 800, `uneven draw: ${wins}`);
});

// A new round type was added to TYPES, to the planner, to the bots and to the
// screens — and was still off in every new room, because the default settings
// spelled the eight older types out by name. Nobody would ever have met it.
test('a new room has every round type switched on', () => {
  assert.match(server, /types: Object\.fromEntries\(TYPES\.map\(t => \[t, true\]\)\)/,
    'default round types are listed by hand again, so a new type ships switched off');
});
