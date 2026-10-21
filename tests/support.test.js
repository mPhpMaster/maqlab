// The support link. Two things hold it up, and both are easy to break later
// without noticing.
//
// One is technical: inside a Discord Activity the page is sandboxed on a
// discordsays.com proxy origin, where an ordinary target="_blank" goes
// nowhere and says nothing. Most players are in Discord, so a link that only
// works on the open web is a link that mostly does not work.
//
// The other is the rule the whole feature rests on: Discord requires anything
// a player *buys* to go through its own checkout. A donation that unlocks
// nothing is not a purchase. The moment it grants a badge, a cosmetic or any
// advantage it becomes a paid feature sold outside Discord — and that is the
// version that gets an Activity delisted.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = require('../scripts/client-source')();
const discord = read('public/discord.js');
const server = require('../scripts/server-source')();

test('the donate link opens the way Discord requires', () => {
  assert.match(discord, /openExternalLink\(\{ url \}\)/,
    'the bootstrap no longer hands back a way to open an outbound link');
  assert.match(discord, /return \{ name, roomCode, session, user, isAdmin, openLink \}/,
    'openLink is no longer returned, so the client cannot reach it');
  assert.match(app, /state\.openLink = info\.openLink/,
    'the client no longer keeps the opener it was given');
  // and it falls back for ordinary web visitors, who have no SDK at all
  assert.match(app, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
});

test('the donate button goes through that opener, not a bare link', () => {
  assert.match(app, /donate\(\) \{ buzz\(10\); openLink\(DONATE_URL\); \}/,
    'the donate action no longer uses openLink; inside Discord it would do nothing');
  const bare = [...app.matchAll(/<a href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(bare, [],
    `an outbound <a href> was added (${bare}) — inside the Activity it fails silently; route it through openLink`);
});

// This is the one that matters. If it ever fails, the feature is no longer a
// donation.
test('donating buys nothing', () => {
  const action = app.match(/donate\(\) \{[^}]*\}/)[0];
  for (const forbidden of ['score', 'powers', 'achievement', 'badge', 'xp', 'emit(']) {
    assert.ok(!action.includes(forbidden),
      `the donate action touches "${forbidden}" — a donation that grants something is a purchase, ` +
      'and Discord requires purchases to go through its own checkout');
  }
  // nothing about paying reaches the server at all
  for (const word of ['donate', 'donation', 'paypal', 'supporter']) {
    assert.ok(!new RegExp(word, 'i').test(server),
      `the server knows about "${word}" — no money or donor state should touch the game at all`);
  }
});

test('the ask says plainly that it buys nothing, in both languages', () => {
  for (const key of ['supportTitle', 'supportBody', 'supportNothing', 'supportBtn', 'supportSmall']) {
    const n = (app.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(n, 2, `"${key}" appears ${n} times, expected one per language`);
  }
  assert.match(app, /ما تحصل مقابلها شي داخل اللعبة/, 'the Arabic text no longer says it buys nothing');
  assert.match(app, /It buys you nothing in the game/, 'the English text no longer says it buys nothing');
});

// Two places only: the About screen, and one quiet line after a game has
// finished. Never during a round, never as a popup.
test('the ask stays out of the way', () => {
  // rendered buttons only — a CSS selector in an event handler is not one
  const shown = (app.match(/(?<!\[)data-act="donate"/g) || []).length;
  assert.equal(shown, 2, `the donate button is rendered ${shown} times; it belongs in About and on the final screen only`);
  for (const view of ['writeView', 'voteView', 'twoWriteView', 'scoresView']) {
    const body = app.match(new RegExp(`function ${view}\\(\\)[\\s\\S]*?\\n  \\}`));
    if (body) assert.ok(!body[0].includes('donate'), `the ask turned up inside ${view}`);
  }
});
