// The host's way past a screen: "Skip" while people are still answering,
// "Next" on a reveal.
//
// This is here because it was added to each screen by hand. The button reached
// five views out of thirty, and the server honoured four phase names out of
// the twenty-odd it can be in — so on ten reveals the button was absent, and
// on the ten it was present but unlisted it would have done nothing. The modes
// added last had neither. A table that had all answered sat watching a clock
// it could not stop.
//
// Both ends are derived now, and these tests are about keeping them derived:
// the server runs whatever the current phase was going to do when its time ran
// out, and the client injects the control from one place. A round type added
// later needs no edit in either, which is the only version of this that stays
// true.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

const TYPES = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));
const nextHandler = server.match(/socket\.on\('next'[\s\S]*?\n  \}\);/)[0];

test('the clock being run early is the phase\'s own clock', () => {
  assert.match(server, /room\.onTime = fn;/, 'setTimer no longer remembers what the phase does when time runs out');
  assert.match(nextHandler, /const fn = room\.onTime;/, 'next is no longer running the phase\'s own clock');
  assert.match(nextHandler, /clearTimer\(room\);\n    fn\(\);/, 'next runs the callback without cancelling the timer, so it would fire twice');
});

test('next does not keep its own list of which phases it works on', () => {
  // The list it replaced: ['bluffReveal','numReveal','likelyReveal','spyReveal'].
  // Four of fourteen reveals, so a mode added after it was written got a
  // button that did nothing, and nobody would find out from a test.
  const named = nextHandler.match(/'(\w+Reveal|\w+Result)'/g) || [];
  assert.deepEqual(named, [], `next is naming phases again: ${named.join(', ')}`);
  // lobby and final are the two screens with no clock at all, so they are
  // named on purpose.
  const names = (nextHandler.match(/room\.phase === '(\w+)'/g) || []).map(m => m.split("'")[1]);
  assert.deepEqual(names.sort(), ['final', 'lobby'], `next is checking phases it should not care about: ${names}`);
});

test('no reveal is left without a clock for the control to run', () => {
  // next runs whatever the phase was going to do when its time ran out, so a
  // reveal that sets no timer is a screen with no way out at all — not for
  // the host and not for the clock. That has shipped twice, with Odd One Out
  // and How Many of Us, and it does not throw: the game just stops.
  const marks = [...server.matchAll(/room\.phase = '(\w+(?:Reveal|Result))';(?:[^\n]*\n){1,3}/g)];
  assert.ok(marks.length >= 10, `found only ${marks.length} reveal phases, expected one per mode`);
  for (const m of marks) {
    // or handed straight to showScores, which sets the scoreboard's clock
    assert.ok(/setTimer\(room, /.test(m[0]) || /showScores\(room\)/.test(m[0]),
      `"${m[1]}" is entered without setting a clock, so nothing moves the game off it`);
  }
});

test('every round type has a reveal phase registered', () => {
  // REVEAL_PHASE is what showScores checks before it will run. A type missing
  // from it has a reveal the host cannot leave and the clock cannot either.
  const map = server.match(/const REVEAL_PHASE = \{([\s\S]*?)\n\};/)[1];
  const quick = (server.match(/const QUICK = \{([\s\S]*?)\n\};/) || [, ''])[1];
  for (const type of TYPES) {
    const listed = new RegExp(`(^|\\s)${type}:`, 'm').test(map) || new RegExp(`(^|\\s)${type}:`, 'm').test(quick);
    assert.ok(listed, `"${type}" has no reveal phase, so its reveal cannot be left`);
  }
});

test('the word on the button is decided where the phases are known', () => {
  assert.match(server, /clock: isRevealPhase\(room\.phase\) \|\| room\.phase === 'scores' \? 'next' : 'skip'/,
    'the server stopped telling the client which word to use, so the client would need its own copy of the phase list');
  assert.ok(!/const (ACTIVE|REVEALS|REVEAL_PHASES) =/.test(app), 'the client has started keeping its own list of phases');
});

test('the client puts the control on every screen from one place', () => {
  assert.match(app, /return hostControl\(\(views\[state\.room\.phase\] \|\| \(\(\) => ''\)\)\(\)\);/,
    'the views are no longer routed through hostControl, so a new mode would ship without a way past it');
  const fn = app.match(/function hostControl\(html\)[\s\S]*?\n  }\n/);
  assert.ok(fn, 'hostControl is gone');
  // The only phases it is allowed to know by name are the ones with no clock.
  const named = (fn[0].match(/'(\w+)'/g) || []).map(m => m.replace(/'/g, '')).filter(n => !['dock', 'next', 'skip'].includes(n));
  assert.deepEqual(named.sort(), ['enter', 'final', 'lobby'], `hostControl is naming phases: ${named}`);
});

test('a screen that already has a dock is left alone', () => {
  // The five reveals that had the button before this change still render it
  // themselves. Injecting a second one would put two buttons on the screen.
  const fn = app.match(/function hostControl\(html\)[\s\S]*?\n  }\n/)[0];
  assert.match(fn, /html\.includes\('class="dock"'\)/, 'hostControl would add a second dock to a screen that has one');
  const calls = (app.match(/\$\{hostNext\(\)\}/g) || []).length;
  assert.ok(calls > 0 && calls <= 6, `${calls} views dock the control themselves; they are meant to be the handful that always did`);
});

test('mid-round, only the host is given a second clock', () => {
  const fn = app.match(/function hostControl\(html\)[\s\S]*?\n  }\n/)[0];
  assert.match(fn, /!isHost\(\) && s\.clock !== 'next'/,
    'everyone now gets a countdown under the round timer they can already see');
});

test('the thresholds the lobby shows come from the server', () => {
  assert.match(server, /mins: MIN_PLAYERS,/, 'the player thresholds are no longer sent, so the lobby cannot show them');
  assert.match(app, /\(state\.room\.mins \|\| \{\}\)\[k\]/, 'the lobby stopped reading the thresholds');
  assert.match(app, /needsN/, 'the "needs N players" label is gone');
  // Two language tables, so each key is spelled exactly twice. One means the
  // other language shows the key itself on screen, which is how three gain
  // labels and sixteen error messages shipped.
  for (const key of ['skip', 'needsN']) {
    const n = (app.match(new RegExp(key + ": '", 'g')) || []).length;
    assert.equal(n, 2, `"${key}" is spelled ${n} time(s); it needs one per language`);
  }
});

test('a mode the host switched off is never played', () => {
  // A host who leaves only the big modes on and plays with two people used to
  // get Bluff, which they had switched off. The last resort is one of their
  // own choices now.
  const fn = server.match(/function roundType\(room\)[\s\S]*?\n}\n/)[0];
  assert.match(fn, /const chosen = TYPES\.filter\(t => room\.settings\.types\[t\]\);/,
    'roundType no longer falls back on what the host actually chose');
  const bluff = fn.indexOf("|| 'bluff'");
  const chosen = fn.indexOf('plan.leastPlayed(room.plan.slice(0, i), chosen)');
  assert.ok(chosen > 0 && chosen < bluff, "the host's own choices must be tried before falling back on bluff");
});

test('a round with nothing to reveal still reaches the scoreboard', () => {
  // showScores only runs from a registered reveal phase. Called from anywhere
  // else it returns, sets no clock, and leaves the game stopped on a screen
  // with no way off it — no error, no log line, which is what makes this
  // worth a test rather than a fix.
  //
  // Two Truths is the one round that can produce nothing to show: its reveal
  // plays one written set at a time, so with no sets there is no screen. It
  // froze in twoWrite, on the round's own 95-second clock as much as on the
  // host's skip — thirteen presses in a row did nothing.
  const fn = server.match(/function startTwoGuess\(room\)[\s\S]*?\n}\n/);
  assert.ok(fn, 'startTwoGuess moved');
  const empty = fn[0].match(/if \(!c\.order\.length\) \{([^}]*)\}/);
  assert.ok(empty, 'the no-sets case is gone from startTwoGuess');
  assert.match(empty[1], /room\.phase = 'twoResult'/,
    'the phase is not moved to a reveal before showScores, so the game stops in twoWrite');
  const reveals = new Set([...server.match(/const REVEAL_PHASE = \{([\s\S]*?)\n\};/)[1]
    .matchAll(/'(\w+)'/g)].map(m => m[1]));
  assert.ok(reveals.has('twoResult'), 'twoResult is no longer a registered reveal phase, so showScores would refuse it');
});
