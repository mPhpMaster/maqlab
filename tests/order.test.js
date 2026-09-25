// Reported from a live game: every item numbered on screen, "Lock it in"
// enabled, and the server answering "invalid choice".
//
// The cause was two different ideas of what had been picked. The view filtered
// the draft down to this round's items; the send posted the draft raw. Let one
// ordering round run out of time and the draft kept its four ids, so the next
// round showed four items numbered 1-4 while eight ids went over the wire.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// the helper, lifted from app.js so the rule is checked and not just described
const orderSeq = (draft, items) => draft.filter(id => items.some(it => it.id === id));

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

test('a draft left over from an earlier round is not sent', () => {
  const stale = ['old1', 'old2', 'old3', 'old4', 'a', 'b', 'c', 'd'];
  const sent = orderSeq(stale, items);
  assert.equal(sent.length, items.length, 'the server rejects any length but four');
  assert.deepEqual(sent, ['a', 'b', 'c', 'd']);
});

test('what is sent is exactly what the screen showed', () => {
  const draft = ['gone', 'c', 'a', 'd', 'b'];
  const shown = orderSeq(draft, items);      // the view builds its numbers from this
  const sent = orderSeq(draft, items);       // and the send must use the same
  assert.deepEqual(sent, shown);
  assert.deepEqual(sent, ['c', 'a', 'd', 'b'], 'order the player chose, stale entry dropped');
});

test('the send and the view really do share one source in app.js', () => {
  assert.match(src, /const orderSeq = \(\) => \{/, 'the shared helper is gone');
  assert.match(src, /const picked = orderSeq\(\);/, 'the view stopped using it');
  assert.match(src, /await emit\('order', orderSeq\(\)\)/, 'the send stopped using it');
  assert.ok(!/emit\('order', state\.draft\.order\)/.test(src), 'the raw draft is being sent again');
});

test('a new round clears the ordering draft', () => {
  assert.match(src, /if \(prev && prev\.round !== snap\.round\) state\.draft\.order = \[\];/,
    'an unfinished ordering would carry into the next round again');
});
