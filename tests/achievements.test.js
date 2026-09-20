const test = require('node:test');
const assert = require('node:assert');
const { LIST, IDS, earned } = require('../achievements');

const profile = over => ({
  games: 0, wins: 0, fooled: 0, bullseyes: 0, best_streak: 0, fastest: 0, famous: 0,
  high_bets: 0, spy_caught: 0, spy_evaded: 0, best_win_streak: 0, total_score: 0, snipes: 0,
  achievements: [], ...over,
});
const game = over => ({ won: false, players: 4, ...over });

test('ids are unique and every entry is usable', () => {
  assert.equal(new Set(IDS).size, IDS.length);
  for (const a of LIST) {
    assert.ok(a.id && a.e, `${a.id} is missing an emoji`);
    assert.equal(typeof a.test, 'function');
  }
});

test('a first finished game unlocks only what it should', () => {
  const got = earned(profile({ games: 1 }), game());
  assert.deepEqual(got, ['first_game']);
});

test('already-held achievements are not handed out twice', () => {
  const p = profile({ games: 1, achievements: ['first_game'] });
  assert.deepEqual(earned(p, game()), []);
});

test('thresholds fire on the boundary, not before', () => {
  assert.ok(!earned(profile({ fooled: 4 }), game()).includes('liar5'));
  assert.ok(earned(profile({ fooled: 5 }), game()).includes('liar5'));
});

test('total_score compares numerically even when the driver returns a string', () => {
  // pg returns bigint columns as strings; a plain >= would compare lexically
  assert.ok(earned(profile({ total_score: '10000' }), game()).includes('score10k'));
  assert.ok(!earned(profile({ total_score: '9999' }), game()).includes('score10k'));
});

test('a game-context achievement reads the game, not the profile', () => {
  assert.ok(!earned(profile(), game({ won: true, players: 5 })).includes('crowded'));
  assert.ok(earned(profile(), game({ won: true, players: 6 })).includes('crowded'));
  assert.ok(!earned(profile(), game({ won: false, players: 8 })).includes('crowded'));
});

test('a long-running profile can unlock several at once', () => {
  const got = earned(profile({ games: 50, wins: 25, total_score: 100000 }), game());
  for (const id of ['first_game', 'first_win', 'games10', 'games50', 'wins5', 'wins25', 'score10k', 'score100k']) {
    assert.ok(got.includes(id), `expected ${id}`);
  }
});
