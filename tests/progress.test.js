// "Is everyone in?" is asked in one table now (progress.js). It used to be
// asked again in checkProgress, which knew 9 of the 18 answering phases: when
// the last player a table was waiting for left during any of the other nine,
// everyone else sat out the clock with every answer already in.
//
// These tests keep the table whole. A round type added later fails here until
// its phase has an answer rule, a next step and a fixture.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const progress = require('../progress');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const ACTIVE = server.match(/const ACTIVE = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
const onAllIn = server.match(/const ON_ALL_IN = \{([\s\S]*?)\n\};/)[1];
const ON_ALL_IN = [...onAllIn.matchAll(/(\w+): \w+/g)].map(m => m[1]);

// Players a and b have answered and c has not, in each phase's own shape.
// Falsy answers (0, false) are in on purpose: "answered 0" is an answer.
const quick = () => ({ idx: 1, answers: [{}, { a: { v: false }, b: { v: true } }] });
const FIXTURES = {
  write: () => ({ lies: { a: 'x', b: 'y' } }),
  vote: () => ({ votes: { a: { id: 'o1' }, b: { id: 'o2' } } }),
  guess: () => ({ guesses: { a: 0, b: 7 } }),
  likelyVote: () => ({ lvotes: { a: 'b', b: 'a' } }),
  blitz: quick,
  emoji: quick,
  odd: quick,
  order: () => ({ orders: { a: ['1', '2'], b: ['2', '1'] } }),
  spyClue: () => ({ clues: { a: 'x', b: 'y' } }),
  spyVote: () => ({ votes: { a: 'b', b: 'a' } }),
  manyAsk: () => ({ said: { a: false, b: true } }),
  manyGuess: () => ({ guesses: { a: 0, b: 2 } }),
  nameWrite: () => ({ said: { a: 'x', b: 'y' } }),
  twoWrite: () => ({ sets: { a: { lines: [], lie: 0 }, b: { lines: [], lie: 1 } } }),
  // a wrote the set on screen, so a is never waited for; b guessed line 0.
  twoGuess: () => ({ order: ['a', 'c'], idx: 0, picks: [{ b: 0 }, {}] }),
  minorPick: () => ({ picks: { a: 'a', b: 'b' } }),
  higherPick: () => ({ picks: { a: 'left', b: 'right' } }),
  missPick: () => ({ picks: { a: 'i1', b: 'i2' } }),
};

const sorted = xs => [...xs].sort();
const who = ids => ids.map(id => ({ id }));

test('every answering phase has a rule for "has this player answered"', () => {
  assert.equal(ACTIVE.length, 18, 'ACTIVE changed size: check the table and the fixtures below');
  assert.deepEqual(sorted(Object.keys(progress.ANSWERED)), sorted(ACTIVE));
});

test('every answering phase has a next step once everyone is in', () => {
  assert.deepEqual(sorted(ON_ALL_IN), sorted(ACTIVE));
});

test('every answering phase has a fixture here', () => {
  assert.deepEqual(sorted(Object.keys(FIXTURES)), sorted(ACTIVE));
});

for (const phase of ACTIVE) {
  test(`${phase}: the round waits for c, and moves on the moment c leaves`, () => {
    const c = FIXTURES[phase]();
    assert.equal(progress.allAnswered(phase, c, who(['a', 'b', 'c'])), false, 'moved on while c still had to answer');
    assert.equal(progress.allAnswered(phase, c, who(['a', 'b'])), true, 'c left as the last holdout and the round kept waiting');
  });
}

test('an empty room and a phase with nothing to answer never move', () => {
  assert.equal(progress.allAnswered('write', { lies: {} }, []), false);
  assert.equal(progress.allAnswered('lobby', {}, who(['a'])), false);
  assert.equal(progress.allAnswered('write', null, who(['a'])), false);
});

test('no submit keeps its own copy of the check', () => {
  // The old shape, once per submit function. A copy here can drift from the
  // table again, which is how checkProgress fell nine phases behind.
  assert.ok(!/connected\(room\)\.every\(/.test(server), 'a submit is checking "everyone in?" on its own again');
  assert.match(server, /function checkProgress\(room\) \{\n  advanceIfAllIn\(room\);\n\}/);
});

test('the timer ring shows in every answering phase, from the same table', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const ring = app.match(/function timerRing\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(ring, /if \(!s\.deadline \|\| !s\.answering\)/);
  assert.ok(!/'spyClue'|'write'/.test(ring), 'the timer ring keeps its own list of phases again');
  assert.match(server, /answering: !!progress\.ANSWERED\[room\.phase\]/);
});
