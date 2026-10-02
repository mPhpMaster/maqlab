// Four defects found by playing the game on a phone-sized screen in Arabic.
// Each one is pinned here because each one is invisible in the language the
// code was written in, and three of them were invisible in a screenshot too —
// they had to be measured.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const app = read('public/app.js');
const css = read('public/style.css');
const server = read('server.js');

// Measured on the live page: in an Arabic interface, an English question put
// its question mark at x=2 and its first letter at x=11 — the "?" rendered
// before the sentence. A room is bilingual by nature, so this is not an edge
// case, it is half the content half the time.
test('text can take its direction from itself, not from the page', () => {
  const rule = css.match(/[^}]*unicode-bidi:\s*plaintext[^}]*}/);
  assert.ok(rule, 'the rule that lets mixed-direction text lay itself out is gone');
  // the two elements a question is actually rendered into
  for (const sel of ['.q', '.q-card h1']) {
    assert.ok(rule[0].includes(sel), `questions rendered in "${sel}" are no longer covered`);
  }
  // and the places players' own words appear
  for (const sel of ['.nm', '.opt', '.my-answer']) {
    assert.ok(rule[0].includes(sel), `player-written text in "${sel}" is no longer covered`);
  }
});

// The streak badge sat inside the name's own clipped box. With a points chip
// in the same row the name was squeezed to 25px and drawn as "...va", while
// the badge survived at full size.
test('the scoreboard clips the badge before it clips the name', () => {
  const row = app.match(/<span class="rk">[\s\S]*?<\/div>/);
  assert.ok(row, 'the scoreboard row markup moved');
  assert.ok(!/<span class="nm"[^>]*>\$\{esc\(p\.name\)\}\$\{p\.streak/.test(row[0]),
    'the streak badge is inside the name again, so the name will be clipped to fit it');
  assert.match(css, /\.brow \.nm \{[^}]*min-width/,
    'the scoreboard name has no minimum width, so flex can squeeze it to nothing');
});

// Printed under the players and again above the start button.
test('the solo hint is shown once', () => {
  const n = (app.match(/t\('soloHint'\)/g) || []).length;
  assert.equal(n, 1, `the lobby prints the solo hint ${n} times`);
});

// A host reading Arabic got English questions until they found the setting.
test('a new room opens in the language its host is reading', () => {
  assert.match(app, /emit\('create', \{ lang: state\.lang \}\)/,
    'the client no longer tells the server which language it is in');
  assert.match(server, /if \(\['ar', 'en'\]\.includes\(want\)\) room\.settings\.lang = want/,
    'the server ignores the language the room was created in');
});
