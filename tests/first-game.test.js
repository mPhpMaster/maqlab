// Getting a new player into a game, and a finished game back out into the
// world. Played for real in the browser; these hold the wiring in place.
const test = require('node:test');
const assert = require('node:assert');

const app = require('../scripts/client-source')();
const server = require('../scripts/server-source')();

test('home offers quick play and a practice game next to create and join', () => {
  assert.match(app, /data-act="quick">⚡ \$\{t\('quickPlay'\)\}/);
  assert.match(app, /data-act="practice">🤖 \$\{t\('practice'\)\}/);
  for (const k of ['quickPlay', 'practice', 'introTitle', 'introLater', 'shareResult', 'shareResultText']) {
    assert.equal((app.match(new RegExp(`\\b${k}: `, 'g')) || []).length, 2, `${k} is not in both languages`);
  }
});

test('quick play joins the fullest waiting room before making a new one', () => {
  const quick = app.match(/async quick\(\) \{[\s\S]*?\n    \},/)[0];
  assert.match(quick, /api\('\/api\/lobbies'\)/);
  assert.ok(quick.indexOf('join(open.code)') < quick.indexOf('actions.create()'), 'it creates a room before trying the open ones');
});

test('practice is three rounds, private, and starts on its own', () => {
  const p = app.match(/async practice\(\) \{[\s\S]*?\n    \},/)[0];
  assert.match(p, /emit\('settings', \{ rounds: 3, public: false \}\)/);
  assert.ok(p.indexOf("emit('settings'") < p.indexOf("emit('start')"));
});

test('the welcome card shows once, and its button works outside #app', () => {
  const fv = app.match(/export function firstVisit\(\) \{[\s\S]*?\n  \}/)[0];
  assert.match(fv, /store\.get\('introSeen', false\)/);
  assert.match(fv, /store\.set\('introSeen', true\)/);
  assert.match(fv, /querySelector\('#intro-go'\)\.onclick/, 'a data-act inside a modal is never routed');
});

test('play again is one tap: back to the lobby and straight into the next game', () => {
  assert.match(app, /async again\(\) \{ await emit\('lobby'\); await emit\('start'\); \}/);
});

test('a finished game can be shared as a link', () => {
  assert.match(server, /room\.lastMatchId = matchId;\n    if \(room\.phase === 'final'\) broadcast\(room\);/);
  assert.match(server, /s\.matchId = room\.lastMatchId \|\| null;/);
  const share = app.match(/async 'share-result'\(\) \{[\s\S]*?\n    \},/)[0];
  assert.match(share, /navigator\.share/);
  assert.match(share, /https:\/\/wa\.me\/\?text=/);
  // the final screen is not redrawn for later updates, so the button is revealed in place
  assert.match(app, /if \(snap\.phase === 'final' && snap\.matchId\) \{ const b = \$app\.querySelector\('\[data-act="share-result"\]'\); if \(b\) b\.hidden = false; \}/);
});

test('a match page is titled with its result', () => {
  assert.ok(server.includes("`<title>${attr(title)}</title>`"), 'the page keeps the generic title on a match link');
});
