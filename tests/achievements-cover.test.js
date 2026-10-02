// Four of the eleven round types shipped with nothing of their own to earn:
// the achievement list was written when the game had seven types and never
// grew with it. Nothing failed, nothing errored — those rounds were simply
// worth less to play, quietly, for months.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ach = require('../achievements');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = read('server.js');
const app = read('public/app.js');
const types = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));

// The counter each type's own achievements are built on. A type with no entry
// here is a type nobody thought about when they added it.
const COUNTER_FOR = {
  bluff: 'fooled', number: 'bullseyes', likely: 'famous', spy: 'spy_caught',
  odd: 'odd_sweeps', order: 'perfect_orders', many: 'many_exact',
  name: 'name_crowd', two: 'two_fool_all',
  // Blitz and Emoji Decode are both won by answering first, and that is what
  // "fastest" counts — they share it honestly rather than each getting a
  // near-identical badge.
  blitz: 'fastest', emoji: 'fastest',
};

test('every round type has something of its own to earn', () => {
  const src = read('achievements.js');
  for (const type of types) {
    const counter = COUNTER_FOR[type];
    assert.ok(counter, `round type "${type}" has no achievement counter — it ships with nothing to earn`);
    assert.ok(src.includes(`p.${counter}`),
      `nothing in the achievement list reads "${counter}", so "${type}" has nothing of its own`);
  }
});

// The counters are per-game on the server and lifetime in the database, and
// the two spellings are different. A mismatch loses the count silently.
test('each new counter is carried from the game all the way to the profile', () => {
  const schema = read('db/schema.sql');
  const db = read('db.js');
  for (const [game, column] of [
    ['perfectOrders', 'perfect_orders'], ['nameCrowd', 'name_crowd'],
    ['manyExact', 'many_exact'], ['twoFoolAll', 'two_fool_all'], ['oddSweeps', 'odd_sweeps'],
  ]) {
    assert.ok(server.includes(`stats.${game}`), `the game never counts ${game}`);
    assert.ok(schema.includes(column), `the profile has nowhere to keep ${column}`);
    assert.ok(db.includes(`${column} = ${column} +`), `${column} is never added up at the end of a game`);
    assert.ok(db.includes(`s.${game}`), `the end-of-game write never reads ${game}`);
  }
});

test('every achievement has a name and a description, in both languages', () => {
  for (const id of ach.IDS) {
    for (const key of [`ach_${id}:`, `achd_${id}:`]) {
      const n = (app.match(new RegExp(key, 'g')) || []).length;
      assert.equal(n, 2, `"${key}" appears ${n} times, expected one per language — ` +
        `the player would be shown "${key.slice(0, -1)}"`);
    }
  }
});

// Two achievements called the same thing is a list the player cannot read.
// It happened the moment the list grew: "Pro Liar" and "Career Liar" are
// distinct in English and were the same word in Arabic.
test('no two achievements share a name, in either language', () => {
  for (const lang of ['ar', 'en']) {
    const names = ach.IDS.map(id => {
      const all = [...app.matchAll(new RegExp(`ach_${id}: '([^']*)'`, 'g'))].map(m => m[1]);
      return all[lang === 'ar' ? 0 : 1];
    });
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    assert.deepEqual(dupes, [], `two achievements are both called "${dupes[0]}" in ${lang}`);
  }
});

test('every achievement has its own emoji', () => {
  const emoji = ach.LIST.map(a => a.e);
  assert.equal(new Set(emoji).size, emoji.length,
    `two achievements share an emoji: ${emoji.filter((e, i) => emoji.indexOf(e) !== i)}`);
  assert.ok(emoji.every(Boolean), 'an achievement has no emoji');
});

// The client kept its own copy of ten of them and gave everything else a
// generic medal in the unlock popup.
test('the client does not keep a second list of achievements', () => {
  assert.ok(!/const ACH = \[\[/.test(app),
    'the hard-coded achievement list is back; unlocks outside it will show a generic medal');
  assert.match(app, /state\.achList \|\| \[\]\)\.find\(a => a\.id === id\)/,
    'the unlock popup is no longer reading the list the server actually publishes');
});
