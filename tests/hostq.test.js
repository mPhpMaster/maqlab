// The host can write questions for their own room. The whole feature rests on
// one rule — code-only rooms, never a listed one — because MAQLAB is in
// Discord's public directory, and free text typed by one stranger and shown to
// a room of strangers is a moderation surface this game cannot watch.
//
// A guard like that is worth nothing unless something exercises it, so these
// tests drive the real functions rather than reading the file for a regex.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const hostq = require('../hostq');

const roomWith = (over = {}) => ({
  phase: 'lobby',
  hostId: 'h',
  settings: { public: false, lang: 'en' },
  customQ: [],
  ...over,
});

test('a listed room refuses host questions outright', () => {
  const room = roomWith({ settings: { public: true, lang: 'en' } });
  const r = hostq.addQuestion(room, { q: 'What is my middle name?', a: 'Khalid' });
  assert.equal(r.error, 'private_only');
  assert.equal(room.customQ.length, 0, 'a public room kept a question it refused');
});

test('questions are only accepted in the lobby', () => {
  const room = roomWith({ phase: 'write' });
  assert.equal(hostq.addQuestion(room, { q: 'Q?', a: 'A' }).error, 'late');
});

// The dangerous version of this bug is not "public rooms can add questions" —
// it is "a private room adds them, then the host lists the room". The queue
// would survive the toggle and play to whoever walked in.
test('listing the room publicly destroys the questions, not just hides them', () => {
  const room = roomWith();
  hostq.addQuestion(room, { q: 'Where did we meet?', a: 'The airport' });
  hostq.addQuestion(room, { q: 'What did I break?', a: 'My ankle' });
  assert.equal(room.customQ.length, 2);

  room.settings.public = true;
  assert.equal(hostq.clearIfPublic(room), 2, 'going public did not report dropping them');
  assert.equal(room.customQ.length, 0, 'host questions survived the room being listed');
  assert.equal(hostq.takeQuestion(room), null);
});

test('a public room never serves a question even if one got into the list', () => {
  // belt and braces: takeQuestion is the last gate before a round uses it
  const room = roomWith();
  hostq.addQuestion(room, { q: 'Q?', a: 'A' });
  room.settings.public = true;
  assert.equal(hostq.takeQuestion(room), null, 'a listed room served a host-written question');
});

test('each question plays once, then the round falls back to the bank', () => {
  const room = roomWith();
  hostq.addQuestion(room, { q: 'First?', a: 'One' });
  hostq.addQuestion(room, { q: 'Second?', a: 'Two' });
  assert.equal(hostq.pending(room), 2);
  assert.equal(hostq.takeQuestion(room).q.en, 'First?');
  assert.equal(hostq.takeQuestion(room).q.en, 'Second?');
  assert.equal(hostq.pending(room), 0);
  assert.equal(hostq.takeQuestion(room), null, 'a used question came back around');
});

test('a question is shaped exactly like a bank entry', () => {
  const room = roomWith();
  hostq.addQuestion(room, { q: '  Which city?  ', a: '  Jeddah ' });
  const e = hostq.takeQuestion(room);
  // the round reads q.q[lang] and q.a[lang]; a missing side would throw mid-game
  for (const lang of ['ar', 'en']) {
    assert.equal(typeof e.q[lang], 'string');
    assert.equal(typeof e.a[lang], 'string');
  }
  assert.equal(e.q.en, 'Which city?', 'whitespace was not collapsed');
  assert.equal(e.a.ar, 'Jeddah');
  assert.ok(Array.isArray(e.alt), 'the round reads alt when matching typed answers');
});

test('empty, overlong and self-answering questions are refused', () => {
  const room = roomWith();
  assert.equal(hostq.addQuestion(room, { q: '   ', a: 'A' }).error, 'empty');
  assert.equal(hostq.addQuestion(room, { q: 'Q?', a: '' }).error, 'empty');
  assert.equal(hostq.addQuestion(room, { q: 'Cairo', a: 'cairo' }).error, 'same');
  assert.equal(room.customQ.length, 0);

  hostq.addQuestion(room, { q: 'x'.repeat(500), a: 'y'.repeat(500) });
  assert.equal(room.customQ[0].q.en.length, hostq.Q_MAX);
  assert.equal(room.customQ[0].a.en.length, hostq.A_MAX);
});

test('the queue has a ceiling', () => {
  const room = roomWith();
  for (let i = 0; i < hostq.MAX_QUESTIONS + 5; i++) hostq.addQuestion(room, { q: `Q${i}?`, a: `A${i}` });
  assert.equal(room.customQ.length, hostq.MAX_QUESTIONS);
  assert.equal(hostq.addQuestion(room, { q: 'one more?', a: 'no' }).error, 'full');
});

// Everyone in the lobby gets a snapshot. If the answers went out with it, the
// other players would be reading the answers to rounds they have not played.
test('only the host is sent the questions themselves', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const block = server.match(/s\.hostQ = \{[\s\S]*?\n  if \(!c\)/)[0];
  assert.match(block, /if \(pid === room\.hostId\) s\.hostQ\.list/,
    'the host questions are no longer gated on the viewer being the host');
  assert.ok(!/s\.hostQ\.list = \(room\.customQ \|\| \[\]\)\.map[\s\S]*?;\s*\n\s*s\.hostQ\.list/.test(block));
});

// The room is written to the database while it is live and read back after a
// restart. Anything that is not plain JSON does not survive that trip.
test('host questions survive being written down and read back', () => {
  const room = roomWith();
  hostq.addQuestion(room, { q: 'Who called?', a: 'My sister' });
  hostq.takeQuestion(room);
  hostq.addQuestion(room, { q: 'Still here?', a: 'Yes' });
  const back = JSON.parse(JSON.stringify(room.customQ));
  const restored = roomWith({ customQ: back });
  assert.equal(hostq.pending(restored), 1, 'a restored room forgot which questions had played');
  assert.equal(hostq.takeQuestion(restored).q.en, 'Still here?');
});
