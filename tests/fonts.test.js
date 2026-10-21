// The fonts are served from this domain. Google Fonts was blocked inside the
// Discord Activity (it can reach only its own domain), so the game never had
// its font there, and every visit elsewhere told Google who was playing.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const pub = f => path.join(__dirname, '..', 'public', f);
const read = f => fs.readFileSync(pub(f), 'utf8');

test('no page loads anything from a font host', () => {
  for (const f of ['index.html', 'terms.html', 'privacy.html', 'style.css', 'legal.css']) {
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(read(f)), `${f} still loads from Google Fonts`);
  }
});

test('every @font-face points at a file that is here', () => {
  for (const f of ['style.css', 'legal.css']) {
    const urls = [...read(f).matchAll(/@font-face \{[^}]*url\(\/fonts\/([^)]+)\)/g)].map(m => m[1]);
    assert.ok(urls.length, `${f} has no @font-face rules`);
    for (const u of urls) assert.ok(fs.existsSync(pub(path.join('fonts', u))), `${f} points at missing /fonts/${u}`);
  }
});

test('the page preloads the one subset every visit needs', () => {
  const pre = read('index.html').match(/<link rel="preload" href="\/fonts\/([^"]+)"/);
  assert.ok(pre && fs.existsSync(pub(path.join('fonts', pre[1]))), 'the preloaded font is missing');
});
