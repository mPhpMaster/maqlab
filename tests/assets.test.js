// Reported from a live game: player avatars turned huge and stacked on the
// screen shown after answering.
//
// That screen was new markup — an answers list with its own class names — and
// the stylesheet that knows those names was the one asset served without a
// version in its URL. Discord's proxy serves what it likes whatever the cache
// headers say, which is why the scripts were stamped in the first place; the
// stylesheet was simply missed. New markup plus an old stylesheet is markup
// with class names nothing has ever heard of, so nothing gets sized.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = require('../scripts/server-source')();
const index = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('every asset the page loads carries a version stamp', () => {
  // what index.html actually asks for, rather than a list kept by hand here
  const wanted = [...index.matchAll(/(?:src|href)="\/((?:app|avatar|discord|style)\.[a-z]+)"/g)].map(m => m[1]);
  assert.ok(wanted.length >= 3, `expected the page to load several assets, found ${wanted.length}`);
  for (const asset of wanted) {
    assert.ok(server.includes(`/${asset}?v=`),
      `${asset} is served without ?v= — a stale copy can outlive a deploy`);
  }
});

test('the stamp changes when any of those assets changes', () => {
  const listed = server.match(/export const STAMPED = \[([^\]]*)\]/)[1];
  for (const asset of ['app.js', 'avatar.js', 'style.css', 'discord.js']) {
    assert.ok(listed.includes(`'${asset}'`),
      `${asset} is not in the hash, so editing it would not change the version`);
  }
  // the client modules and stylesheets are listed from their folders, so a new one is covered
  assert.ok(listed.includes("...listed('js')") && listed.includes("...listed('css')"), 'the js/ and css/ modules are not in the hash');
  assert.match(server, /\.update\(STAMPED\.map\(/, 'the stamp is no longer a hash of the listed files');
});

test('every import the client sends carries the stamp', () => {
  assert.match(server, /text\.replace\(STAMP_IMPORT, `\$1\$2\?v=\$\{ASSET_V\}\$3`\)/);
  // The rule, run on the real import lines of the client.
  const rule = new RegExp(server.match(/const STAMP_IMPORT = \/(.*)\/g;/)[1], 'g');
  const src = require('../scripts/client-source')();
  const imports = src.match(/^\s*import .*from '\.\/[\w-]+\.js';$|^import '\.\/js\/main\.js';$/gm) || [];
  assert.ok(imports.length > 20, 'the client imports were not found');
  for (const line of imports) assert.ok(line.replace(rule, '$1$2?v=X$3').includes('.js?v=X'), `not stamped: ${line}`);
});

test('the stylesheet in particular is stamped', () => {
  // the one that was missed, named outright so a refactor cannot quietly drop it
  assert.match(server, /href="\/style\.css\?v=\$\{ASSET_V\}/, 'the stylesheet lost its version stamp');
});
