// Render stops the old instance with SIGTERM on every deploy and kills it
// about 30 seconds later. The process has to write every room down, close its
// sockets and database, and leave inside that window. The live behaviour is
// played in tests/e2e/restart.e2e.js; this holds the wiring in place.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const shutdown = server.match(/async function shutdown\(signal\) \{[\s\S]*?\n\}/)[0];

test('SIGTERM and SIGINT both run the shutdown', () => {
  assert.match(server, /process\.on\('SIGTERM', \(\) => shutdown\('SIGTERM'\)\);/);
  assert.match(server, /process\.on\('SIGINT', \(\) => shutdown\('SIGINT'\)\);/);
});

test('it saves every room before closing anything, and gives up inside the deploy window', () => {
  const order = ['saveRoom(r, true)', 'Promise.allSettled(saves)', 'io.close(', 'db.close()', 'closed in'].map(s => shutdown.indexOf(s));
  assert.ok(order.every(i => i >= 0), 'a step of the shutdown is missing');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the shutdown steps are out of order');
  const ms = Number(server.match(/const SHUTDOWN_MS = (\d+) \* 1000;/)[1]) * 1000;
  assert.ok(ms < 30000, 'the shutdown can outlast the 30 seconds Render allows');
  assert.match(server, /if \(shuttingDown \|\| limited\('create', 3000\)/, 'rooms can still be opened while shutting down');
});

test('the server listens only once saved rooms are back', () => {
  assert.match(server, /Promise\.race\(\[booted, new Promise\(r => setTimeout\(r, BOOT_WAIT_MS\)\)\]\)\n  \.then\(\(\) => server\.listen\(/);
  assert.equal((server.match(/server\.listen\(/g) || []).length, 1, 'there is a second listen that does not wait');
});
