// What a script can do to the server without playing. Creating a room did not
// need an account, nothing capped how many rooms there were, and a handler
// that destructures its payload threw on null instead of turning it away.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = require('../scripts/server-source')();
const handler = name => server.match(new RegExp(`socket\\.on\\('${name}'[\\s\\S]*?\\n  \\}\\);`))[0];

test('creating a room needs a session, like joining one', () => {
  const create = handler('create');
  assert.match(create, /if \(!session\) return reply\(cb, \{ error: 'signin' \}\);/);
  assert.ok(create.indexOf("error: 'signin'") < create.indexOf('createRoom()'), 'the room is made before the session is checked');
});

test('every way of making a room respects the cap', () => {
  const makers = [...server.matchAll(/createRoom\(\)/g)].length - 1; // minus the definition's own name
  assert.match(handler('create'), /roomsFull\(\)/);
  const discord = server.match(/app\.post\('\/api\/discord\/room'[\s\S]*?\n\}\);/)[0];
  assert.match(discord, /if \(roomsFull\(\)\)/);
  assert.equal(makers, 2, 'a new place creates rooms; give it the cap too, then update this count');
});

test('every handler that destructures its payload is protected from null', () => {
  const set = server.match(/const OBJECT_PAYLOADS = new Set\(\[(.*?)\]\);/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
  const destructuring = [...server.matchAll(/socket\.on\('(\w+)', (?:async )?\((?:\{[^}]*\}|\w+) = \{\}/g)].map(m => m[1]);
  assert.ok(destructuring.length >= 4, 'the pattern no longer finds the handlers');
  for (const name of destructuring) assert.ok(set.includes(name), `'${name}' destructures its payload but is not in OBJECT_PAYLOADS`);
});

test('the flood guard runs before any handler', () => {
  assert.match(server, /socket\.use\(\(packet, next\) => \{/);
  assert.ok(server.indexOf('socket.use(') < server.indexOf("socket.on('create'"), 'handlers are registered before the guard');
});
