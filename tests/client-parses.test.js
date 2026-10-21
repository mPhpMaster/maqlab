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
function served() {
  const out = new Set();
  // every script the page itself pulls in, minus the ones socket.io serves
  for (const [, src] of html.matchAll(/<script[^>]*src="\/([^"]+\.js)"/g)) {
    if (!src.startsWith('socket.io/')) out.add(src);
  }
  // and every module those reach, followed import by import (the client is a
  // set of modules in js/ now, each importing the next)
  const queue = [...out];
  while (queue.length) {
    const file = queue.shift();
    const full = path.join(root, 'public', file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const specs = [...text.matchAll(/\bimport\(\s*['"](\.{1,2}\/[\w/.-]+\.js)['"]/g), ...text.matchAll(/(?:\bfrom|^\s*import)\s*['"](\.{1,2}\/[\w/.-]+\.js)['"]/gm)];
    for (const [, spec] of specs) {
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (!out.has(rel)) { out.add(rel); queue.push(rel); }
    }
  }
  return [...out];
}

test('every script the page loads actually parses', () => {
  const files = served();
  assert.ok(files.includes('app.js'), 'app.js is not reachable from index.html any more');
  assert.ok(files.length >= 2, `expected the page to load more than ${files.length} script`);
  assert.ok(files.filter(f => f.startsWith('js/')).length >= 10, `only ${files.filter(f => f.startsWith('js/')).length} client modules were reached from app.js`);
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

test('every stylesheet the page links has balanced braces', () => {
  // Not a parser, just the one failure that silently drops every rule after
  // it: a block left open swallows the rest of the file. Each file on its own,
  // since an open block cannot spill from one into the next and still show.
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="\/([\w/-]+\.css)">/g)].map(m => m[1]);
  assert.ok(sheets.includes('style.css') && sheets.length >= 3, `the page links ${sheets.join(', ')}`);
  for (const f of sheets) {
    const css = fs.readFileSync(path.join(root, 'public', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const open = (css.match(/\{/g) || []).length;
    const close = (css.match(/\}/g) || []).length;
    assert.equal(open, close, `${f} has ${open} "{" and ${close} "}"`);
  }
});
