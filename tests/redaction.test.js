// The spy round's whole point is asymmetric knowledge, so the per-player
// snapshot is a security boundary, not a display detail. These tests pin the
// shape of what each side is allowed to receive.
//
// snapshot() lives inside server.js, which starts a listener on require, so the
// redaction rule is restated here against the same inputs. If the two ever
// disagree, the integration check in scratchpad/bot/leakcheck.js catches it
// against the real server.
const test = require('node:test');
const assert = require('node:assert');

// mirrors the spy branch of snapshot() in server.js
function spyView({ amSpy, phase, word, category, spyId }) {
  const out = { amSpy, category };
  if (!amSpy && phase !== 'spyReveal') out.word = word;
  if (phase === 'spyReveal') { out.word = word; out.spyId = spyId; }
  return out;
}

test('the spy is never told the word while the round is live', () => {
  for (const phase of ['spyClue', 'spyVote']) {
    const v = spyView({ amSpy: true, phase, word: 'الذئب', category: 'حيوان', spyId: 'p3' });
    assert.equal(v.word, undefined, `word leaked to the spy during ${phase}`);
    assert.equal(v.category, 'حيوان', 'the spy still needs the category');
  }
});

test('civilians get the word, and never the spy id, before the reveal', () => {
  for (const phase of ['spyClue', 'spyVote']) {
    const v = spyView({ amSpy: false, phase, word: 'الذئب', category: 'حيوان', spyId: 'p3' });
    assert.equal(v.word, 'الذئب');
    assert.equal(v.spyId, undefined, `spy identity leaked during ${phase}`);
  }
});

test('the reveal opens both up to everyone', () => {
  for (const amSpy of [true, false]) {
    const v = spyView({ amSpy, phase: 'spyReveal', word: 'الذئب', category: 'حيوان', spyId: 'p3' });
    assert.equal(v.word, 'الذئب');
    assert.equal(v.spyId, 'p3');
  }
});
