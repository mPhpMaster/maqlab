// The replay is written once, at the end of a round, and read back weeks
// later by a match page that cannot ask the room anything. If a field is
// missing or a text stayed bilingual, nobody finds out until the page is
// already broken — so the shapes are pinned here against the real builder.
const test = require('node:test');
const assert = require('node:assert');
const replay = require('../replay');

const room = (current, gains = {}) => ({ round: 3, current, gains });

test('content text is flattened into the language the game was played in', () => {
  const e = replay.roundEntry(room({
    type: 'bluff', mod: 'normal',
    q: { q: { ar: 'سؤال', en: 'A question' }, a: { ar: 'جواب', en: 'An answer' } },
    options: [{ id: 'o1', text: 'An answer', truth: true, authors: [] }],
    votes: {},
  }), 'en');
  assert.equal(e.q, 'A question');
  assert.equal(e.truth, 'An answer');
  // and the other way round, so neither language is the accidental default
  const ar = replay.roundEntry(room({
    type: 'bluff', mod: 'normal',
    q: { q: { ar: 'سؤال', en: 'A question' }, a: { ar: 'جواب', en: 'An answer' } },
    options: [], votes: {},
  }), 'ar');
  assert.equal(ar.q, 'سؤال');
});

test('a bluff round keeps who wrote each lie and who fell for it', () => {
  const e = replay.roundEntry(room({
    type: 'bluff', mod: 'double',
    q: { q: { en: 'Q' }, a: { en: 'Real' } },
    options: [
      { id: 'a', text: 'Real', truth: true, authors: [] },
      { id: 'b', text: 'Fake', truth: false, authors: ['p2'] },
      { id: 'c', text: 'Filler', truth: false, authors: [], house: true },
    ],
    votes: { p1: { id: 'b', bet: 3 } },
  }, { p2: { total: 300 } }), 'en');
  assert.deepEqual(e.options[1], { id: 'b', text: 'Fake', truth: false, house: false, authors: ['p2'] });
  assert.equal(e.options[2].house, true);
  assert.deepEqual(e.votes, { p1: { id: 'b', bet: 3 } });
  assert.deepEqual(e.pts, { p2: 300 });
  assert.equal(e.n, 3);
  assert.equal(e.mod, 'double');
});

test('a spy round keeps the word, the spy and every clue', () => {
  const e = replay.roundEntry(room({
    type: 'spy', mod: 'normal',
    word: { ar: 'المطار', en: 'The airport' }, cat: { ar: 'مكان', en: 'Place' },
    spyId: 'p3', clues: { p1: 'crowded', p3: 'busy' }, votes: { p1: 'p3' },
    guess: 'The airport', caught: true, guessRight: true,
  }), 'en');
  assert.equal(e.word, 'The airport');
  assert.equal(e.cat, 'Place');
  assert.equal(e.spyId, 'p3');
  assert.deepEqual(e.clues, { p1: 'crowded', p3: 'busy' });
  assert.equal(e.caught, true);
  assert.equal(e.guessRight, true);
});

test('quick rounds keep each item, who was right and who was fastest', () => {
  const e = replay.roundEntry(room({
    type: 'emoji', mod: 'normal',
    items: [{ e: '🍎🥧', opts: [{ id: 'x', text: { en: 'Apple pie' } }, { id: 'y', text: { en: 'Fruit salad' } }], correctId: 'x' }],
    answers: [{ p1: { id: 'x', correct: true, t: 900 }, p2: { id: 'y', correct: false, t: 1500 } }],
    fastest: ['p1'],
  }), 'en');
  assert.equal(e.items.length, 1);
  assert.equal(e.items[0].e, '🍎🥧');
  assert.deepEqual(e.items[0].opts, [{ id: 'x', text: 'Apple pie' }, { id: 'y', text: 'Fruit salad' }]);
  assert.equal(e.items[0].answers.p1.ok, true);
  assert.equal(e.items[0].answers.p2.ok, false);
  assert.equal(e.items[0].fastest, 'p1');
});

test('a blitz item keeps the statement and whether it was true', () => {
  const e = replay.roundEntry(room({
    type: 'blitz', mod: 'normal',
    items: [{ s: { en: 'Honey never spoils.' }, t: true }],
    answers: [{ p1: { v: true, correct: true, t: 700 } }],
    fastest: ['p1'],
  }), 'en');
  assert.equal(e.items[0].text, 'Honey never spoils.');
  assert.equal(e.items[0].truth, true);
  assert.equal(e.items[0].answers.p1.v, true);
});

test('an ordering round keeps the real values, not just the order', () => {
  const e = replay.roundEntry(room({
    type: 'order', mod: 'normal',
    q: { en: 'Largest first' },
    items: [{ id: 'a', en: 'Russia', v: 17 }, { id: 'b', en: 'Egypt', v: 1 }],
    truth: ['a', 'b'],
    orders: { p1: ['b', 'a'] },
  }), 'en');
  assert.equal(e.q, 'Largest first');
  assert.deepEqual(e.items, [{ id: 'a', text: 'Russia', v: 17 }, { id: 'b', text: 'Egypt', v: 1 }]);
  assert.deepEqual(e.truth, ['a', 'b']);
  assert.deepEqual(e.orders, { p1: ['b', 'a'] });
});

test('the roster carries guests and bots, who game_results never sees', () => {
  const r = replay.roster([
    { id: 'p1', userId: 'u1', name: 'Her', avatar: { s: 1 }, score: 900 },
    { id: 'p2', userId: null, name: 'Zap', avatar: { s: 2 }, bot: true, score: 400 },
  ]);
  assert.deepEqual(r.map(p => p.place), [1, 2]);
  assert.equal(r[1].bot, true);
  assert.equal(r[1].userId, null);
  assert.equal(r[0].pid, 'p1');
});

test('a round with no state at all is skipped rather than half-written', () => {
  assert.equal(replay.roundEntry({ round: 1, current: null, gains: {} }, 'en'), null);
});

test('rounds worth nothing are not padded with zeroes', () => {
  const e = replay.roundEntry(room({ type: 'likely', mod: 'normal', prompt: { en: 'Who?' }, lvotes: { p1: 'p2' }, winners: ['p2'] },
    { p1: { total: 0 }, p2: { total: 150 } }), 'en');
  assert.deepEqual(e.pts, { p2: 150 });
  assert.deepEqual(e.winners, ['p2']);
});

// Three bots in one spy round used to write the same words, which reads as
// three bots rather than three cautious people.
const botsMod = require('../bots');
test('a bot does not repeat a clue already on the board', () => {
  const taken = [];
  for (let i = 0; i < 5; i++) {
    const c = botsMod.spyClue({ category: 'Food', taken });
    assert.ok(!taken.includes(c.en), `repeated "${c.en}" with ${JSON.stringify(taken)}`);
    taken.push(c.en);
  }
});

test('when every clue is taken it still answers rather than stalling', () => {
  const all = ['I like it', 'Smells good', 'We share it', 'Not every day', 'Filling'];
  const c = botsMod.spyClue({ category: 'Food', taken: all });
  assert.ok(c && c.en && c.ar, 'a bot with no free clue must still say something');
});
