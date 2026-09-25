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

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
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
  const hashed = server.match(/\.update\(\[([^\]]*)\]/)[1];
  for (const asset of ['app.js', 'avatar.js', 'style.css']) {
    assert.ok(hashed.includes(`'${asset}'`),
      `${asset} is not in the hash, so editing it would not change the version`);
  }
});

test('the stylesheet in particular is stamped', () => {
  // the one that was missed, named outright so a refactor cannot quietly drop it
  assert.match(server, /href="\/style\.css\?v=\$\{ASSET_V\}/, 'the stylesheet lost its version stamp');
});
