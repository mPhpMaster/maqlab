// The README and the help screen kept describing the game as it was months
// ago: eight round types and 1,055 questions, while fourteen modes and 1,743
// entries were live. Nothing compared them, so they drifted as fast as modes
// shipped. These tests do the comparing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const content = require('../content');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = require('../scripts/server-source')();
const app = read('public/app.js');
const readme = read('README.md');
const privacy = read('public/privacy.html');

const TYPES = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
const banks = Object.entries(content).filter(([, v]) => Array.isArray(v));
const total = banks.reduce((n, [, v]) => n + v.length, 0);
const english = app.slice(app.indexOf('\n    en: {'));
const nameOf = k => (english.match(new RegExp(`type_${k}: (?:'([^']*)'|"([^"]*)")`)) || []).slice(1).find(Boolean);

test('the README counts the modes the server plays', () => {
  assert.ok(readme.includes(`## Round types (${TYPES.length})`), `README does not say "Round types (${TYPES.length})"`);
  assert.ok(readme.includes(`## أنواع الجولات (${TYPES.length})`), 'the Arabic README has a different mode count');
});

test('every mode has a row in the README, under the name the game shows', () => {
  for (const k of TYPES) {
    const name = nameOf(k);
    assert.ok(name, `no English name for ${k}`);
    // "The Bluff" and "The Spy" are written without the article in the table.
    const bare = name.replace(/^The /, '');
    assert.ok(readme.includes(`**${name}**`) || readme.includes(`**${bare}**`), `README has no row for ${name}`);
  }
});

test('the README content numbers are the banks as they are', () => {
  assert.ok(readme.includes(`${total.toLocaleString('en-US')} entries in ${banks.length} banks`),
    `README total is not "${total.toLocaleString('en-US')} entries in ${banks.length} banks"`);
  for (const [k, v] of banks) assert.ok(readme.includes(`${k} ${v.length}`), `README does not say "${k} ${v.length}"`);
});

test('the help screen lists modes from TYPES, not by hand', () => {
  const how = app.match(/async function howTo\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(how, /Object\.keys\(TYPES\)\.map/);
  assert.match(how, /\/api\/modes/, 'player minimums are no longer read from the server');
  // A per-mode line in the steps is the old hand list coming back.
  for (const steps of app.match(/howSteps: \[[^\]]*\]/g)) {
    for (const k of Object.keys(JSON.parse(`{${app.match(/const TYPES = \{([^}]*)\}/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"')}}`))) {
      assert.ok(!steps.includes(nameOf(k)), `howSteps describes ${nameOf(k)} by hand again`);
    }
  }
  assert.match(server, /app\.get\('\/api\/modes', \(_, res\) => res\.json\(\{ modes: TYPES\.map\(id => \(\{ id, min: MIN_PLAYERS\[id\] \|\| 1 \}\)\) \}\)\);/);
});

test('the privacy policy says rooms are saved while a game runs', () => {
  assert.ok(!/lives only in memory/.test(privacy), 'the privacy policy says rooms live only in memory again');
  assert.ok(!privacy.includes('تعيش في الذاكرة فقط'), 'the Arabic privacy policy says rooms live only in memory again');
  assert.match(privacy, /survives a server restart/);
  assert.ok(privacy.includes('تنجو اللعبة من إعادة تشغيل الخادم'));
});
