// The link out to the other two games.
//
// This is a list kept by hand in three places — the array, the Arabic strings
// and the English ones — which is the shape of fault this project keeps
// finding the hard way: a missing label renders as its own key, so a player
// would read "game_letterup" where the name should be. Three of the gain
// labels and sixteen of the error messages shipped exactly like that.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../scripts/client-source')();
const css = require('../scripts/client-css')();

const block = app.match(/const GAMES = \[([\s\S]*?)\n  \];/);
assert.ok(block, 'the GAMES list is gone from public/app.js');
const ids = [...block[1].matchAll(/id: '([a-z0-9]+)'/g)].map(m => m[1]);
const urls = [...block[1].matchAll(/url: '([^']+)'/g)].map(m => m[1]);

// The two language tables, so a key can be looked for in each one separately.
const langs = {
  ar: app.slice(app.indexOf('supportBtn: '), app.indexOf("supportBtn: 'Donate'")),
  en: app.slice(app.indexOf("supportBtn: 'Donate'")),
};

test('every game has a name and a description in both languages', () => {
  assert.ok(ids.length >= 2, 'expected the other two games to be listed');
  for (const id of ids) {
    for (const [lang, table] of Object.entries(langs)) {
      for (const key of [`game_${id}`, `gamed_${id}`]) {
        assert.ok(table.includes(key + ':'), `${key} is missing from the ${lang} strings`);
      }
    }
  }
});

test('the card itself is spelled in both languages', () => {
  for (const [lang, table] of Object.entries(langs)) {
    for (const key of ['moreGames', 'moreGamesBody', 'openGame']) {
      assert.ok(table.includes(key + ':'), `${key} is missing from the ${lang} strings`);
    }
  }
});

test('every link is an https address', () => {
  assert.equal(urls.length, ids.length, 'a game is listed without a link');
  for (const u of urls) assert.match(u, /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/, `${u} is not an https address`);
});

test('a tap opens one of the listed games and nothing else', () => {
  // The markup carries an index, never a URL: inside the Discord Activity an
  // outbound link has to go through openLink, and an index means the address
  // a tap can reach is only ever one of the two in the list.
  const act = app.match(/game\(el\) \{[^\n]*\n/);
  assert.ok(act, 'the game action is gone');
  assert.match(act[0], /GAMES\[Number\(el\.dataset\.i\)\]/, 'the game action no longer looks the game up by index');
  assert.match(act[0], /openLink\(g\.url\)/, 'the game action no longer goes through openLink');
  assert.ok(!/data-act="game"[^>]*data-u(rl)?=/.test(app), 'a URL is being written into the markup');
});

test('it is shown where a player will meet it', () => {
  // The home screen, the lobby, and the final scoreboard — the three moments
  // someone has nothing to do and is deciding what to play. If the call sites
  // go, the feature is dead code and this test is the only thing that would
  // say so.
  const views = {
    homeView: /gamesCard\(false\)/,
    lobbyView: /gamesCard\(true\)/,
    finalView: /gamesCard\(true\)/,
  };
  for (const [name, want] of Object.entries(views)) {
    const src = app.match(new RegExp(`function ${name}\\(\\)[\\s\\S]*?\\n  }\\n`));
    assert.ok(src, `${name} moved`);
    assert.match(src[0], want, `${name} no longer shows the other games`);
  }
});

test('inside a room the link mark stays clear of the reaction bar', () => {
  // The bar is fixed in the bottom corner, on whichever side the page
  // direction puts last — the same side a label at the end of the row sits
  // on. It covered "Open" in Arabic until the compact rows stopped putting
  // anything out there.
  const fn = app.match(/function gamesCard\(compact\)[\s\S]*?\n  }\n/);
  assert.ok(fn, 'gamesCard moved');
  assert.match(fn[0], /compact \? ' ↗' : ''/, 'the compact rows no longer mark themselves as links');
  assert.match(fn[0], /\$\{compact \? '' : `<span class="go">/, 'the compact rows put a label back at the edge');
});

test('each row can be read in either direction', () => {
  // An English title inside an Arabic page put its punctuation on the wrong
  // side the last three times this came up, so the rule is pinned here.
  const rule = css.match(/\.game-row[^{]*\{[^}]*unicode-bidi:\s*plaintext[^}]*}/);
  assert.ok(rule, 'the game rows no longer take their direction from their own text');
});
