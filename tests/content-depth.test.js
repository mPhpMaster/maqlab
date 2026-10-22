// Enough questions that a regular player does not meet one twice in their
// first 20 games. Worked out from the code, not from a guess: how many items
// each round type draws, which banks it draws from, and how often a mode
// comes round when the table is as small as it can be for that mode (a small
// table plays fewer modes, so each one comes round more often).
//
// A signed-in player's question memory (seen.js) then keeps any one of them
// from meeting a question twice while the bank has others left.
const test = require('node:test');
const assert = require('node:assert');
const content = require('../content');

const server = require('../scripts/server-source')();
const TYPES = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
const MIN = Object.fromEntries([...server.match(/const MIN_PLAYERS = \{([^}]*)\}/)[1].matchAll(/(\w+): (\d+)/g)].map(m => [m[1], Number(m[2])]));
const QUICK = Number(server.match(/const ITEMS_PER_QUICK_ROUND = (\d+)/)[1]);

const GAMES = 20;
const ROUNDS = 12; // the default length of a game
// What each round type draws: bank and how many items per round. Two Truths
// is written by the players and draws nothing; What Went Missing is built
// from the odd bank.
const DRAWS = {
  bluff: [['bluff', 1]], number: [['number', 1]], blitz: [['blitz', QUICK]], likely: [['likely', 1]],
  emoji: [['emoji', QUICK]], odd: [['odd', QUICK]], order: [['order', 1]], spy: [['spy', 1]],
  many: [['many', 1]], name: [['name', 1]], two: [], minor: [['minor', 1]], higher: [['higher', 1]],
  missing: [['odd', 1]],
};

test('every round type says what it draws', () => {
  assert.deepEqual(Object.keys(DRAWS).sort(), [...TYPES].sort(), 'a round type was added: say which bank it draws from');
  for (const m of TYPES) {
    if (!DRAWS[m].length) continue; // written by the players
    assert.match(server, new RegExp(`pickFrom\\(room, '${DRAWS[m][0][0]}'`), `${m} no longer draws from ${DRAWS[m][0][0]}`);
  }
});

test(`no bank runs out within a regular player's first ${GAMES} games`, () => {
  const need = {};
  for (const m of TYPES) {
    const table = Math.max(2, MIN[m] || 1);
    const playable = TYPES.filter(x => (MIN[x] || 1) <= table).length;
    const times = Math.ceil((GAMES * ROUNDS) / playable);
    for (const [bank, per] of DRAWS[m]) need[bank] = (need[bank] || 0) + times * per;
  }
  const short = Object.entries(need).filter(([bank, n]) => content[bank].length < n)
    .map(([bank, n]) => `${bank}: ${content[bank].length} entries, needs ${n}`);
  assert.deepEqual(short, [], 'these banks would repeat for a regular player');
});
