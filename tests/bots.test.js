// The spy round is the one place a bot can give itself away for free, by
// writing something no human would write about that word. These pin the two
// ways that happened: a pool too small to go round a full table, and a clue
// longer than the server is willing to store.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const bots = require('../bots');

const CATS = ['Place', 'Job', 'Food', 'Animal', 'Object', 'Activity', 'Sport'];
const src = fs.readFileSync(path.join(__dirname, '..', 'bots.js'), 'utf8');
const block = src.match(/const CLUES = \{[\s\S]*\n\];/)[0];

// every ['<arabic>', '<english>'] pair in the clue block, either quote style
const pairs = [...block.matchAll(/\[('([^']*)'|"([^"]*)"), ('([^']*)'|"([^"]*)")\]/g)]
  .map(m => [m[2] !== undefined ? m[2] : m[3], m[5] !== undefined ? m[5] : m[6]]);

// submitSpyClue does String(text).trim().slice(0, 24)
const CLUE_LIMIT = 24;
// a room holds 5 bots, and a human writes a clue too
const FULL_TABLE = 6;

test('no clue is longer than the server will keep', () => {
  for (const [ar, en] of pairs) {
    assert.ok(ar.length <= CLUE_LIMIT, `Arabic clue would be cut: "${ar}" (${ar.length})`);
    assert.ok(en.length <= CLUE_LIMIT, `English clue would be cut: "${en}" (${en.length})`);
  }
});

test('every category has more clues than a full table needs', () => {
  for (const cat of CATS) {
    const seg = block.split(cat + ': [')[1].split('\n  ],')[0];
    const n = (seg.match(/\[/g) || []).length;
    assert.ok(n > FULL_TABLE, `${cat} has ${n} clues, a full table draws ${FULL_TABLE}`);
  }
});

test('no category lists the same clue twice', () => {
  for (const cat of CATS) {
    const seg = block.split(cat + ': [')[1].split('\n  ],')[0];
    const ar = [...seg.matchAll(/\['([^']*)'/g)].map(m => m[1]);
    assert.equal(new Set(ar).size, ar.length, `${cat} repeats a clue in its own pool`);
  }
});

test('a full table draws six different clues, every time', () => {
  for (const category of CATS) {
    for (let run = 0; run < 400; run++) {
      const taken = [];
      for (let i = 0; i < FULL_TABLE; i++) {
        const c = bots.spyClue({ category, taken });
        assert.ok(!taken.includes(c.en), `${category} repeated "${c.en}" at seat ${i + 1}`);
        taken.push(c.en);
      }
    }
  }
});

test('an unknown category still produces a clue rather than nothing', () => {
  const c = bots.spyClue({ category: 'Nonsense', taken: [] });
  assert.ok(c && c.ar && c.en, 'a bot with no matching pool must still say something');
});
