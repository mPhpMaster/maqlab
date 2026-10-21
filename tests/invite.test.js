// An invite link has to survive the trip through Discord's sign-in. It used
// not to: the callback always ended at "/?login=...", so a friend who opened
// /room/ABCDE, signed in and came back found the home screen and no room. And
// nothing on the client read ?login= at all, so a failed sign-in was silent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = require('../scripts/server-source')();
const app = require('../scripts/client-source')();

// The server's own rule, run here rather than copied.
const safeNext = new Function(`${server.match(/const safeNext = [^\n]+/)[0]}\nreturn safeNext;`)();
const route = name => server.match(new RegExp(`app\\.get\\('${name}'[\\s\\S]*?\\n\\}\\);`))[0];

test('sign-in comes back only to a room link or home', () => {
  assert.equal(safeNext('/room/ABCDE'), '/room/ABCDE');
  assert.equal(safeNext('/room/abcd'), '/room/abcd');
  for (const bad of ['', null, undefined, '/', '//evil.example', 'https://evil.example/room/ABCDE',
    '/room/ABCDE/../../x', '/room/ABCDEF', '/room/AB', '/room/ABCDE?x=1', '/\\evil.example', '/profile']) {
    assert.equal(safeNext(bad), '/', `accepted ${JSON.stringify(bad)} as somewhere to send people`);
  }
});

test('the start route remembers where the player was', () => {
  const start = route('/api/auth/discord/start');
  assert.match(start, /res\.cookie\(OAUTH_NEXT, safeNext\(req\.query\.next\), oauthCookie\)/);
  assert.match(start, /res\.cookie\(OAUTH_STATE, state, oauthCookie\)/);
});

test('the OAuth cookies are Secure in production', () => {
  assert.match(server, /const oauthCookie = \{[^}]*secure: process\.env\.NODE_ENV === 'production'/);
});

test('every way out of the callback goes back to that page', () => {
  const cb = route('/api/auth/discord/callback');
  assert.ok(!/redirect\('\/\?login=/.test(cb), 'the callback is sending people to the home screen again');
  for (const outcome of ['ok', 'failed', 'banned']) assert.ok(cb.includes(`'${outcome}'`), `no way back for login=${outcome}`);
  assert.match(cb, /const next = safeNext\(/, 'the remembered page is used without being checked again');
});

test('the client sends its page along, says how it went, and joins the room', () => {
  assert.match(app, /'\/api\/auth\/discord\/start\?next=' \+ encodeURIComponent\(location\.pathname\)/);
  const after = app.match(/function afterSignIn\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(after, /get\('login'\)/);
  assert.match(after, /history\.replaceState\(null, '', location\.pathname\)/, 'a reload would say it again');
  assert.match(after, /join\(state\.route\.code\)/, 'back on the invite link but not taken into the room');
  assert.match(app, /await loadMe\(\); render\(\); afterSignIn\(\);/, 'afterSignIn runs before we know who signed in');
});

test('an invite link shows who is waiting before sign-in', () => {
  const api = server.match(/app\.get\('\/api\/room\/:code'[\s\S]*?\n\}\);/)[0];
  for (const field of ['host', 'players', 'phase', 'round', 'rounds']) assert.match(api, new RegExp(`\\b${field}\\b`));
  assert.match(api, /humans\(r\)/, 'bots would be counted as people waiting');
  assert.match(app, /\$\{previewCard\(\)\}/, 'the room-entry screen no longer shows the preview');
});

test('the new lines are said in both languages', () => {
  for (const key of ['loginOk', 'loginFailed', 'crewWaiting', 'hostedBy', 'roomGone']) {
    const n = (app.match(new RegExp(`\\b${key}: `, 'g')) || []).length;
    assert.equal(n, 2, `${key} appears ${n} times; it needs one English and one Arabic line`);
  }
});
