// Playable by keyboard and readable by a screen reader. Checked by hand in a
// browser (Tab, Escape, focus coming back); these hold the wiring in place.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../scripts/client-source')();
const css = require('../scripts/client-css')();
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('keyboard focus is visible, since buttons drop the outline for taps', () => {
  assert.match(css, /:focus-visible[^{]*\{[^}]*outline: 3px solid/);
});

test('a tap target that is not a button works from the keyboard', () => {
  assert.match(app, /new MutationObserver\(reachable\)\.observe\(\$app/);
  assert.match(app, /el\.tabIndex = 0; el\.setAttribute\('role', 'button'\);/);
  assert.match(app, /\(e\.key === 'Enter' \|\| e\.key === ' '\) && e\.target\.matches && e\.target\.matches\(NOT_BUTTON\)/);
});

test('a modal is a dialog that keeps focus, closes on Escape, and gives focus back', () => {
  const m = app.match(/export function modal\(html, mount\) \{[\s\S]*?\n  \}\n  export const closeModal = \(\) => \{[\s\S]*?\n  \};/)[0];
  assert.match(m, /role="dialog" aria-modal="true"/);
  assert.match(m, /e\.key === 'Escape'/);
  assert.match(m, /e\.key !== 'Tab'/);
  assert.match(m, /modalReturn\.focus\(/);
});

test('toasts are announced and questions say their language', () => {
  assert.match(html, /<div id="toasts" role="status" aria-live="polite"><\/div>/);
  assert.match(app, /<h1 lang="\$\{qlang\}">/);
});
