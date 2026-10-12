// What the public room list on the home screen will show a stranger.
//
// A room is public by default, and being public put it on that list with the
// host's name, their avatar and the room code — for as long as it existed. So
// someone could tap into round seven of a game among friends, arriving with no
// score, into a round already half answered. The list stops at kickoff now.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = server.match(/app\.get\('\/api\/lobbies'[\s\S]*?\n}\);/)[0];

test('only rooms that have not started are listed', () => {
  assert.match(route, /if \(r\.phase !== 'lobby'\) continue;/,
    'a game in progress is advertised to strangers again');
});

test('a room with nobody in it, or no room at all, is not listed', () => {
  // Bots are padding: a room advertised as having three players should have
  // three people in it, and a room whose last human left should not be
  // advertised at all.
  assert.match(route, /humans\(r\)\.filter\(p => p\.connected\)/, 'bots are being counted as players again');
  assert.match(route, /!online\.length/, 'an empty room would be listed');
  assert.match(route, /r\.players\.size >= MAX_PLAYERS/, 'a full room would be listed');
  assert.match(route, /!r\.settings\.public/, 'the public setting is no longer honoured');
});

test('a room joined from Discord is never advertised', () => {
  // The voice channel is the guest list. Nobody outside it should be able to
  // walk in from the website.
  assert.match(server, /room\.settings\.public = false;/,
    'a Discord Activity room no longer takes itself off the public list');
});

test('the list says nothing a stranger should not already see', () => {
  // The host's name and avatar are on it by design — it is how you recognise
  // a room. Nothing else about the people inside belongs there.
  const pushed = route.match(/list\.push\(\{([\s\S]*?)\}\);/)[1];
  const fields = [...pushed.matchAll(/(\w+):/g)].map(m => m[1]).sort();
  assert.deepEqual(fields, ['avatar', 'code', 'host', 'lang', 'players', 'phase', 'round', 'rounds'].sort(),
    `the public list is carrying different fields now: ${fields.join(', ')}`);
});
