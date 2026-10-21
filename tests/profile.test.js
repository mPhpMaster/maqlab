// /api/profile sent the whole profiles row to anyone who opened a profile,
// including why a player was banned and which admin did it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = read('server.js');
const schema = read('db/schema.sql');

test('every moderation column in the schema is on the list kept from non-admins', () => {
  const table = schema.match(/create table if not exists profiles \(([\s\S]*?)\n\);/)[1];
  const banCols = [...table.matchAll(/^\s+(ban\w*|banned\w*)\s/gm)].map(m => m[1]);
  const listed = server.match(/const BAN_FIELDS = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
  assert.ok(banCols.length >= 3, 'the schema pattern no longer finds the ban columns');
  assert.deepEqual([...listed].sort(), [...banCols].sort());
});

test('the profile route strips them unless an admin is asking', () => {
  const route = server.match(/app\.get\('\/api\/profile\/:userId'[\s\S]*?\n\}\);/)[0];
  assert.match(route, /if \(!viewerIsAdmin\) for \(const k of BAN_FIELDS\) delete profile\[k\];/);
  assert.ok(route.indexOf('delete profile[k]') < route.indexOf('res.json('), 'the row is sent before it is cleaned');
});
