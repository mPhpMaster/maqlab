// A lie that looks hand-typed is a lie everybody spots for free, which is the
// whole game gone. These pin the rule against the real implementation rather
// than a copy of it.
const test = require('node:test');
const assert = require('node:assert');
const { matchAnswerCase } = require('../text');

test('an English lie is capitalised like the authored answers are', () => {
  assert.equal(matchAnswerCase('wallpaper cleaner', 'en'), 'Wallpaper cleaner');
  assert.equal(matchAnswerCase('a piece of cheese', 'en'), 'A piece of cheese');
  assert.equal(matchAnswerCase('élan vital', 'en'), 'Élan vital');
});

test('a lie that is already capitalised is left exactly as written', () => {
  assert.equal(matchAnswerCase('Wallpaper cleaner', 'en'), 'Wallpaper cleaner');
});

test('names spelled lower case on purpose are not mangled', () => {
  assert.equal(matchAnswerCase('iPhone', 'en'), 'iPhone');
  assert.equal(matchAnswerCase('eBay auctions', 'en'), 'eBay auctions');
});

test('nothing that is not a letter is touched', () => {
  assert.equal(matchAnswerCase('42 things', 'en'), '42 things');
  assert.equal(matchAnswerCase('"quoted"', 'en'), '"quoted"');
});

test('Arabic has no case to match, so it passes through untouched', () => {
  assert.equal(matchAnswerCase('منظف الجدران', 'ar'), 'منظف الجدران');
  assert.equal(matchAnswerCase('wallpaper cleaner', 'ar'), 'wallpaper cleaner');
});
