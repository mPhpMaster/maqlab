// The share image. Everything here was a real defect in the first render, not
// a precaution: the medals came out as empty boxes, a player's emoji did the
// same, and the Arabic footer read "5 rounds, 12 players" when the match had
// been 12 rounds between 5 people.
const test = require('node:test');
const assert = require('node:assert');
const card = require('../card');

const sample = (over = {}) => ({
  players: [
    { name: 'بدر', score: 8920 },
    { name: 'Comet 🤖', score: 6610 },
    { name: 'أم خالد', score: 5180 },
    { name: 'Watcher', score: 500 },
  ],
  rounds: 12,
  lang: 'ar',
  ...over,
});

// One font ships with the card, and it has no emoji in it. resvg does not skip
// a glyph it cannot find — it draws a box.
test('nothing that reaches the image needs a glyph the font does not have', () => {
  const svg = card.cardSvg(sample());
  const text = svg.match(/>([^<]*)</g).join('');
  assert.ok(!/\p{Extended_Pictographic}/u.test(text),
    `an emoji reached the card and would render as an empty box: ${text.match(/\p{Extended_Pictographic}/u)}`);
  assert.match(svg, /Comet</, 'stripping the emoji took the name with it');
});

// The bug this catches is silent: the card renders, it just says something
// untrue. resvg ignores direction="rtl", so the only thing that reorders the
// runs is an explicit embedding.
test('the Arabic line is wrapped so its numbers stay with their words', () => {
  const ar = card.cardSvg(sample({ lang: 'ar' }));
  assert.ok(ar.includes('‫') && ar.includes('‬'),
    'the Arabic footer lost its right-to-left embedding, so the numbers will swap words');
  const en = card.cardSvg(sample({ lang: 'en' }));
  assert.ok(!en.includes('‫'), 'the English line does not need an embedding');
  assert.match(en, /12 rounds · 4 players/);
});

test('a name cannot break out of the document it is drawn into', () => {
  const svg = card.cardSvg(sample({ players: [{ name: '</text><script>x</script>', score: 10 }] }));
  assert.ok(!svg.includes('<script>'), 'a player name injected markup into the card');
  assert.match(svg, /&lt;\/text&gt;/);
});

test('a very long name is cut rather than run off the card', () => {
  const svg = card.cardSvg(sample({ players: [{ name: 'م'.repeat(80), score: 10 }] }));
  const drawn = svg.match(/fill="#ffd65c">(م+…?)</);
  assert.ok(drawn && drawn[1].length <= 22, `name was drawn at ${drawn && drawn[1].length} characters`);
});

test('a name that was nothing but emoji still leaves a row to read', () => {
  const svg = card.cardSvg(sample({ players: [{ name: '🤖🔥', score: 10 }] }));
  assert.match(svg, /—</, 'an all-emoji name left an empty row');
});

test('the podium is three rows, and the rest are counted', () => {
  const svg = card.cardSvg(sample());
  assert.equal((svg.match(/<circle cx="166"/g) || []).length, 3);
  assert.match(svg, />\+1</, 'the fourth player was neither shown nor counted');
});

test('scores are grouped the same way the rest of the game writes them', () => {
  assert.match(card.cardSvg(sample()), />8,920</);
});

// The cache is keyed by match id and a match never changes, so entries are
// good forever — which is exactly why it needs a ceiling on a 512MB instance.
test('the cache is bounded', { skip: !card.available() && 'rasteriser not installed' }, () => {
  for (let i = 0; i < 60; i++) card.cardFor('m' + i, sample({ lang: 'en' }));
  assert.ok(card.cacheSize() <= 40, `cache grew to ${card.cacheSize()} entries`);
});

test('a real card actually rasterises, in both languages', { skip: !card.available() && 'rasteriser not installed' }, () => {
  for (const lang of ['ar', 'en']) {
    const png = card.renderCard(sample({ lang }));
    assert.ok(Buffer.isBuffer(png) && png.length > 2000, `${lang} card came back empty`);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
});
