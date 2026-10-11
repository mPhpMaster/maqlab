// The client has no build step, so nothing stands between a stray character
// in public/app.js and a blank page for every player. There is no stack trace
// to read either: the browser logs one line to a console nobody is looking at
// and the game simply never appears.
//
// This exists because it happened. An apostrophe inside a single-quoted
// English string — "each other's" — shipped a 211KB file that could not be
// parsed, and the whole of the rest of the suite passed.
//
// The file list is read out of the page rather than typed here, so a script
// added to index.html is covered without anyone remembering to add it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function served() {
  const out = new Set();
  // every script the page itself pulls in, minus the ones socket.io serves
  for (const [, src] of html.matchAll(/<script[^>]*src="\/([^"]+\.js)"/g)) {
    if (!src.startsWith('socket.io/')) out.add(src);
  }
  // and whatever app.js reaches for at runtime
  for (const [, src] of app.matchAll(/import\(\s*['"]\.?\/?([\w.-]+\.js)['"]/g)) out.add(src);
  for (const [, src] of app.matchAll(/from\s+['"]\.?\/?([\w.-]+\.js)['"]/g)) out.add(src);
  return [...out];
}

test('every script the page loads actually parses', () => {
  const files = served();
  assert.ok(files.includes('app.js'), 'app.js is not reachable from index.html any more');
  assert.ok(files.length >= 2, `expected the page to load more than ${files.length} script`);
  for (const f of files) {
    const full = path.join(root, 'public', f);
    assert.ok(fs.existsSync(full), `${f} is loaded by the page but not on disk`);
    try {
      execFileSync(process.execPath, ['--check', full], { stdio: 'pipe' });
    } catch (e) {
      assert.fail(`public/${f} does not parse:\n${String(e.stderr || e.message).split('\n').slice(0, 6).join('\n')}`);
    }
  }
});

test('the stylesheet has balanced braces', () => {
  // Not a parser, just the one failure that silently drops every rule after
  // it: a block left open swallows the rest of the file.
  const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const open = (css.match(/\{/g) || []).length;
  const close = (css.match(/\}/g) || []).length;
  assert.equal(open, close, `style.css has ${open} "{" and ${close} "}"`);
});
