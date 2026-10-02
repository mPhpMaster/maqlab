// Remembering what a player has been shown is only useful if the memory still
// means the same thing after the bank is edited. The obvious implementation —
// remember the index — is wrong the first time anyone inserts a question, and
// wrong silently: every player on the service is suddenly marked as having
// seen something else.
const test = require('node:test');
const assert = require('node:assert');
const seen = require('../seen');
const content = require('../content');

test('a remembered entry is still the same entry after the bank is edited', () => {
  const bank = content.bluff.slice();
  const target = bank[40];
  const key = seen.keyOf('bluff', target);

  // somebody adds three questions at the top of the bank
  const edited = [{ q: { ar: 'س', en: 'new one' }, a: { ar: 'ج', en: 'answer' } }, ...bank];
  const moved = edited[41];
  // guards this test against proving nothing: the entry really did move
  assert.notEqual(bank.indexOf(target), edited.indexOf(moved),
    'the entry did not shift, so an index-based key would have survived too');
  assert.equal(seen.keyOf('bluff', moved), key,
    'the entry moved and its key moved with it — every player would be marked as having seen the wrong question');
});

test('two different entries do not share a key, and the same one always does', () => {
  const keys = new Set(content.bluff.map(e => seen.keyOf('bluff', e)));
  assert.equal(keys.size, content.bluff.length, 'two bluff questions collided on one key');
  assert.equal(seen.keyOf('bluff', content.bluff[7]), seen.keyOf('bluff', content.bluff[7]));
});

test('the same text in two banks is still two different things', () => {
  const e = { q: { ar: 'س', en: 'same text' } };
  assert.notEqual(seen.keyOf('bluff', e), seen.keyOf('name', e));
});

test('unseen entries are preferred, and the pool never runs dry', () => {
  const bank = content.bluff;
  const idx = bank.map((_, i) => i);
  const half = new Set(idx.slice(0, 100).map(i => seen.keyOf('bluff', bank[i])));
  const fresh = seen.fresh(idx, bank, 'bluff', half);
  assert.ok(fresh.length && fresh.every(i => i >= 100), 'a seen question was still offered first');

  // and when a player has met everything, they get the whole bank back rather
  // than an empty round
  const all = new Set(idx.map(i => seen.keyOf('bluff', bank[i])));
  assert.equal(seen.fresh(idx, bank, 'bluff', all).length, idx.length,
    'a player who has seen the whole bank would have been handed nothing');
});

test('with no memory at all, nothing changes', () => {
  const idx = [1, 2, 3];
  assert.deepEqual(seen.fresh(idx, content.bluff, 'bluff', null), idx);
  assert.deepEqual(seen.fresh(idx, content.bluff, 'bluff', new Set()), idx);
});

// The memory is attached to an account. A guest has nothing to attach it to,
// and writing a row keyed by a per-room player id would be a row that is never
// read again.
test('only signed-in people are remembered', () => {
  const players = [
    { userId: 'u1', bot: false }, { userId: null, bot: false },
    { userId: 'u2', bot: false }, { userId: 'u1', bot: false }, { userId: 'b', bot: true },
  ];
  assert.deepEqual(seen.owners(players).sort(), ['u1', 'u2']);
});

test('a room gathers what it was dealt, without duplicates', () => {
  const room = {};
  seen.note(room, 'bluff', [content.bluff[0], content.bluff[1]]);
  seen.note(room, 'bluff', [content.bluff[1]]);
  seen.note(room, 'number', [content.number[0]]);
  assert.equal(room.seenThisGame.size, 3);
});

// Each bank has its own shape, and a key built from the wrong field would be
// the same for every entry in it — which looks like it works until every
// player is marked as having seen the whole bank at once.
test('every bank produces distinct keys', () => {
  for (const [type, bank] of Object.entries(content)) {
    if (!Array.isArray(bank) || bank.length < 5) continue;
    const keys = new Set(bank.map(e => seen.keyOf(type, e)));
    assert.ok(keys.size > bank.length * 0.95,
      `bank "${type}" produced ${keys.size} keys for ${bank.length} entries — the key is reading a field that does not vary`);
  }
});
