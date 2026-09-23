// Counted nouns were written as one string with {n} glued in, so every count
// of 1 read "Fooled 1 times". Arabic is worse than a missing -s: it has five
// forms, and for one and two the numeral is dropped entirely.
//
// t() lives inside app.js, which is a browser module, so the rule is pinned
// here against the same table app.js ships and the same selector it uses.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

// the selector, lifted verbatim from app.js
const PLURAL = {
  en: n => (n === 1 ? 'one' : 'other'),
  ar: n => {
    const r = n % 100;
    if (n === 1) return 'one';
    if (n === 2) return 'two';
    if (r >= 3 && r <= 10) return 'few';
    if (r >= 11 && r <= 99) return 'many';
    return 'other';
  },
};

test('app.js still contains the selector these tests mirror', () => {
  assert.match(src, /if \(n === 2\) return 'two';/, 'the Arabic rule moved or changed');
  assert.match(src, /en: n => \(n === 1 \? 'one' : 'other'\)/, 'the English rule moved or changed');
});

test('English picks singular for exactly one', () => {
  assert.equal(PLURAL.en(1), 'one');
  for (const n of [0, 2, 3, 11, 100]) assert.equal(PLURAL.en(n), 'other', `n=${n}`);
});

test('Arabic picks one, dual, few, many and hundreds apart', () => {
  assert.equal(PLURAL.ar(1), 'one');
  assert.equal(PLURAL.ar(2), 'two');
  for (const n of [3, 7, 10]) assert.equal(PLURAL.ar(n), 'few', `n=${n}`);
  for (const n of [11, 42, 99]) assert.equal(PLURAL.ar(n), 'many', `n=${n}`);
  for (const n of [100, 200]) assert.equal(PLURAL.ar(n), 'other', `n=${n}`);
  // 3-10 in any hundred still takes the few form
  assert.equal(PLURAL.ar(105), 'few');
});

test('every plural string carries the forms its language needs', () => {
  // pull each `key: { one: ... }` object out of the shipped table
  // The forms themselves contain `{n}`, so the object's end is the ` }` with
  // a space before it — `{n}` never has one.
  const objs = [...src.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*): \{ one: .*? \}/g)].map(m => m[0]);
  assert.ok(objs.length >= 20, `expected both languages to be converted, found ${objs.length}`);
  for (const o of objs) {
    const forms = [...o.matchAll(/\b(one|two|few|many|other): /g)].map(m => m[1]);
    assert.ok(forms.includes('one'), `${o.slice(0, 30)} has no singular`);
    assert.ok(forms.includes('other'), `${o.slice(0, 30)} has no fallback form`);
    // an Arabic entry is any that also declares the dual
    if (forms.includes('two')) {
      for (const need of ['few', 'many']) {
        assert.ok(forms.includes(need), `${o.slice(0, 30)} is missing the ${need} form`);
      }
    }
  }
});

test('the winner announcement is not shadowed by the profile label again', () => {
  assert.match(src, /winnerIs: '\{n\} wins! 🏆'/, 'the English announcement key is gone');
  assert.match(src, /t\('winnerIs', \{ n: esc\(ranked\[0\]\.name\) \}\)/, 'the final screen does not use it');
  // the label it used to collide with must still exist on its own, and it is
  // now a plural object too, so the profile reads "1 Win" not "1 Wins"
  assert.match(src, /wins: \{ one: 'Win', other: 'Wins' \}/, 'the profile label went missing');
});

// Counts reach t() already formatted — Arabic-Indic digits and separators.
// Number('٣') is NaN, and a NaN count picks the wrong form everywhere, so the
// number has to be read back out of the formatted string.
const countOf = v => {
  const s = String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d]/g, '');
  return s ? Number(s) : 0;
};

test('app.js still reads counts back out of formatted numbers', () => {
  assert.match(src, /const countOf = v =>/, 'the count reader moved or was removed');
  assert.match(src, /\(PLURAL\[state\.lang\] \|\| PLURAL\.en\)\(countOf\(v\.n\)\)/, 't() stopped using it');
});

test('formatted Arabic and English numbers both count correctly', () => {
  assert.equal(countOf('٣'), 3);
  assert.equal(countOf('١٢'), 12);
  assert.equal(countOf('١٬٢٠٠'), 1200);
  assert.equal(countOf('1,200'), 1200);
  assert.equal(countOf(2), 2);
  assert.equal(countOf(undefined), 0);
});

test('an Arabic count of three picks the few form, not the fallback', () => {
  // the exact path that was wrong: fmt(3) -> '٣' -> NaN -> 'other' -> "٣ صوتاً"
  assert.equal(PLURAL.ar(countOf('٣')), 'few');
  assert.equal(PLURAL.ar(countOf('١١')), 'many');
  assert.equal(PLURAL.ar(countOf('٢')), 'two');
});

test('stat labels agree with the number shown above them', () => {
  for (const key of ['games', 'wins', 'followers']) {
    const objs = [...src.matchAll(new RegExp(key + ": \{ one: .*? \}", 'g'))].map(m => m[0]);
    assert.equal(objs.length, 2, `${key} should be a plural object in both languages`);
  }
  // and every call site says which count it is labelling
  assert.match(src, /t\('games', \{ n: games \}\)/, 'the games tile lost its count');
  assert.match(src, /t\('wins', \{ n: p\.wins \}\)/, 'the wins tile lost its count');
  assert.match(src, /t\('followers', \{ n: d\.follows\.followers \}\)/, 'the follower count lost its count');
});
