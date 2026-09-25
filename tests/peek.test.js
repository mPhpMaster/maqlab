// Reported from a live game: the peek button does nothing in some rounds.
//
// The client decided where the button was live and the server decided where it
// worked, and the two lists were written out by hand in different files. Odd
// One Out was added to one and not the other, so the button lit up, took the
// tap and answered with an error.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const client = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('the server offers peek in every round the button lights up for', () => {
  // what the client enables, straight out of powerBar
  const line = client.match(/const peekable = .*/)[0];
  const clientPhases = [...line.matchAll(/s\.phase === '(\w+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(clientPhases, ['emoji', 'odd', 'vote'], 'powerBar changed — update the server to match');

  // the server takes the bluff vote explicitly and the rest from PEEKABLE
  assert.match(server, /if \(room\.phase === 'vote'\)/, 'the bluff vote lost its peek');
  assert.match(server, /PEEKABLE\.includes\(c\.type\) && room\.phase === QUICK\[c\.type\]\.phase/,
    'the quick rounds lost their peek');
  assert.match(server, /const PEEKABLE = TYPES\.filter\(t => QUICK\[t\] && t !== 'blitz'\)/,
    'PEEKABLE is no longer derived, so a new round type can be missed again');
});

test('peek is refused where there is nothing to remove', () => {
  // blitz has two options; taking a wrong one away would be the answer itself
  assert.match(server, /t !== 'blitz'/, 'blitz would hand over the answer');
  assert.match(server, /else return \{ error: 'nopeek' \}/, 'rounds without options must still refuse');
});

test('the peek key has one spelling, not one per call site', () => {
  assert.match(server, /const peekKey = \(c, idx\) =>/, 'the shared key builder is gone');
  const handWritten = server.match(/peeked\('(vote|e|o)'/g) || [];
  assert.equal(handWritten.length, 0, 'a hand-written peek key is back: ' + handWritten.join(', '));
  // stored and read through the same function
  assert.match(server, /key: peekKey\(c\)/, 'the stored key stopped using it');
  assert.equal((server.match(/peeked\(peekKey\(c\)\)/g) || []).length, 3, 'every read should go through it');
});

test('the key builder gives each round its own slot', () => {
  const peekKey = (c, idx) => (c.type === 'bluff' ? 'vote' : c.type[0] + (idx == null ? c.idx : idx));
  assert.equal(peekKey({ type: 'bluff' }), 'vote');
  assert.equal(peekKey({ type: 'emoji', idx: 0 }), 'e0');
  assert.equal(peekKey({ type: 'odd', idx: 2 }), 'o2');
  // a peek spent on item 1 must not hide options on item 2
  assert.notEqual(peekKey({ type: 'odd', idx: 1 }), peekKey({ type: 'odd', idx: 2 }));
});
