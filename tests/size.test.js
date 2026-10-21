// Every source file stays under 500 lines, so each one can be read and
// changed as a whole. content.js is data, not code, and is exempt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LIMIT = 500;
const EXEMPT = new Set(['content.js']);
const files = [
  ...fs.readdirSync(ROOT).filter(f => f.endsWith('.js')),
  ...fs.readdirSync(path.join(ROOT, 'server')).filter(f => f.endsWith('.js')).map(f => `server/${f}`),
].filter(f => !EXEMPT.has(f));

test('every server source file is under the line limit', () => {
  const over = files.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').length]).filter(([, n]) => n > LIMIT);
  assert.deepEqual(over, [], `over ${LIMIT} lines: ${over.map(([f, n]) => `${f} (${n})`).join(', ')}`);
});
