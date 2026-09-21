#!/usr/bin/env node
// Content guard for content.js. Run it before shipping questions:
//
//   node scripts/validate-content.js            check everything
//   node scripts/validate-content.js --new      check only what this change adds
//   node scripts/validate-content.js --strict   fail the build on bias warnings
//
// --new exists because a bad batch of 20 averaged against a bank of 300 dilutes
// to nothing and passes, while still making the bank worse.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const ONLY_NEW = args.includes('--new');
const STRICT = args.includes('--strict');

const errors = [];
const warnings = [];
const err = (bank, i, msg) => errors.push(`${bank}[${i}] ${msg}`);
const warn = msg => warnings.push(msg);

// Aggressive fold, for *comparing* entries. Deliberately more destructive than
// the game's answer matching: here a near-identical string should collide.
const norm = s => String(s == null ? '' : s)
  .toLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ؤئ]/g, 'ء')
  .replace(/[^\p{L}\p{N}]+/gu, '');

const bilingual = (v, bank, i, field) => {
  if (!v || typeof v !== 'object') return err(bank, i, `${field} must be {ar, en}`);
  for (const lang of ['ar', 'en']) {
    if (typeof v[lang] !== 'string' || !v[lang].trim()) err(bank, i, `${field}.${lang} is missing`);
  }
};

// ---------- per-bank schema ----------
const SHAPES = {
  bluff: (x, i) => {
    bilingual(x.q, 'bluff', i, 'q');
    bilingual(x.a, 'bluff', i, 'a');
    if (x.alt && !Array.isArray(x.alt)) err('bluff', i, 'alt must be an array');
    if (x.a && norm(x.a.ar) === norm(x.q.ar)) err('bluff', i, 'answer repeats the question');
  },
  number: (x, i) => {
    bilingual(x.q, 'number', i, 'q');
    if (typeof x.a !== 'number' || !Number.isFinite(x.a)) err('number', i, 'a must be a finite number');
    if (x.unit) bilingual(x.unit, 'number', i, 'unit');
  },
  blitz: (x, i) => {
    bilingual(x.s, 'blitz', i, 's');
    if (typeof x.t !== 'boolean') err('blitz', i, 't must be true or false');
  },
  likely: (x, i) => bilingual(x, 'likely', i, 'prompt'),
  emoji: (x, i) => {
    if (!x.e || typeof x.e !== 'string') err('emoji', i, 'e (the emoji) is missing');
    bilingual(x.a, 'emoji', i, 'a');
    if (!Array.isArray(x.d) || x.d.length !== 3) return err('emoji', i, 'needs exactly 3 distractors');
    x.d.forEach((d, j) => bilingual(d, 'emoji', i, `d[${j}]`));
    const seen = new Set([norm(x.a && x.a.ar)]);
    for (const d of x.d) {
      const k = norm(d.ar);
      if (seen.has(k)) err('emoji', i, `option "${d.ar}" appears twice`);
      seen.add(k);
    }
  },
  odd: (x, i) => {
    bilingual(x.odd, 'odd', i, 'odd');
    bilingual(x.why, 'odd', i, 'why');
    if (!Array.isArray(x.rest) || x.rest.length !== 3) return err('odd', i, 'needs exactly 3 others');
    x.rest.forEach((r, j) => bilingual(r, 'odd', i, `rest[${j}]`));
    const seen = new Set([norm(x.odd && x.odd.ar)]);
    for (const r of x.rest) {
      const k = norm(r.ar);
      if (seen.has(k)) err('odd', i, `option "${r.ar}" appears twice`);
      seen.add(k);
    }
    // The reason must not name the odd one out, or the reveal spoils itself
    // the moment anyone reads ahead.
    for (const lang of ['ar', 'en']) {
      if (norm(x.why[lang]).includes(norm(x.odd[lang]))) err('odd', i, `why (${lang}) gives away the answer`);
    }
  },
  order: (x, i) => {
    bilingual(x.q, 'order', i, 'q');
    if (!Array.isArray(x.items) || x.items.length !== 4) return err('order', i, 'needs exactly 4 items');
    x.items.forEach((it, j) => {
      bilingual(it, 'order', i, `items[${j}]`);
      if (typeof it.v !== 'number' || !Number.isFinite(it.v)) err('order', i, `items[${j}].v must be a finite number`);
    });
    // Two items with the same value have no correct order between them, so
    // the round would mark a right answer wrong.
    if (new Set(x.items.map(it => it.v)).size !== x.items.length) err('order', i, 'two items share a value, so there is no single correct order');
  },
  spy: (x, i) => { bilingual(x.cat, 'spy', i, 'cat'); bilingual(x.w, 'spy', i, 'w'); },
};

// What identifies an entry, for duplicate detection.
const KEYS = {
  bluff: x => [norm(x.q && x.q.ar), norm(x.q && x.q.en)],
  number: x => [norm(x.q && x.q.ar), norm(x.q && x.q.en)],
  blitz: x => [norm(x.s && x.s.ar), norm(x.s && x.s.en)],
  likely: x => [norm(x.ar), norm(x.en)],
  emoji: x => [x.e, norm(x.a && x.a.ar)],
  odd: x => [norm(x.odd && x.odd.ar), norm(x.odd && x.odd.en)],
  order: x => [norm(x.q && x.q.ar), norm(x.q && x.q.en)],
  spy: x => [norm(x.w && x.w.ar), norm(x.w && x.w.en)],
};

function loadHead() {
  const tmp = path.join(os.tmpdir(), `maqlab-head-content-${process.pid}.js`);
  try {
    // execFile, not a shell string: no input is interpolated and no shell runs
    fs.writeFileSync(tmp, execFileSync('git', ['show', 'HEAD:content.js'], { cwd: ROOT, encoding: 'utf8' }));
    const prev = require(tmp);
    fs.unlinkSync(tmp);
    return prev;
  } catch {
    return null; // no git history yet, or content.js is new
  }
}

function run() {
  const content = require(path.join(ROOT, 'content.js'));
  const head = ONLY_NEW ? loadHead() : null;
  if (ONLY_NEW && !head) console.log('no previous content.js in git — checking everything instead');

  const banks = Object.keys(content);
  // Only the banks that hold a full question/statement are compared against
  // each other. spy words, likely prompts and emoji answers are short nouns —
  // the same word turning up in two different mini-games is fine.
  const CROSS = new Set(['bluff', 'number', 'blitz']);
  const crossBank = new Map(); // normalized text -> "bank[i]"
  let checked = 0;

  for (const bank of banks) {
    const list = content[bank];
    if (!Array.isArray(list)) { err(bank, 0, 'bank is not an array'); continue; }

    const before = head && head[bank] ? new Set(head[bank].map(x => KEYS[bank](x).join('|'))) : null;
    const seen = new Map();
    const fresh = [];

    list.forEach((x, i) => {
      const keys = KEYS[bank] ? KEYS[bank](x) : [];
      const id = keys.join('|');
      const isNew = !before || !before.has(id);

      // duplicates are always checked against the whole bank, even in --new
      for (const k of keys) {
        if (!k) continue;
        if (seen.has(k)) err(bank, i, `duplicate of ${bank}[${seen.get(k)}] — "${k.slice(0, 40)}"`);
        else seen.set(k, i);
        if (!CROSS.has(bank)) continue;
        const other = crossBank.get(k);
        if (other && !other.startsWith(bank)) err(bank, i, `also appears as ${other}`);
        else if (!other) crossBank.set(k, `${bank}[${i}]`);
      }

      if (ONLY_NEW && !isNew) return;
      checked++;
      fresh.push(x);
      if (SHAPES[bank]) SHAPES[bank](x, i);
    });

    bias(bank, fresh);
  }

  const scope = ONLY_NEW ? 'new entries' : 'all entries';
  console.log(`checked ${checked} ${scope} across ${banks.length} banks`);
  return report();
}

// ---------- bias checks ----------
function bias(bank, list) {
  if (!list.length) return;

  // A 4-option question is exploitable when the right answer is visibly the
  // longest — players learn to pick the long one without reading.
  if (bank === 'emoji' || bank === 'odd') {
    let exploitable = 0;
    for (const x of list) {
      const right = bank === 'odd' ? x.odd : x.a;
      const others = bank === 'odd' ? x.rest : x.d;
      if (!right || !Array.isArray(others)) continue;
      for (const lang of ['ar', 'en']) {
        const lens = [right[lang], ...others.map(d => d[lang])].map(s => String(s || '').length);
        const [correct] = lens;
        const max = Math.max(...lens), min = Math.min(...lens);
        const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
        const uniquelyLongest = correct === max && lens.filter(l => l === max).length === 1;
        if (uniquelyLongest && mean > 0 && (max - min) / mean > 0.6) { exploitable++; break; }
      }
    }
    const pct = Math.round((exploitable / list.length) * 100);
    if (pct > 15) warn(`${bank}: ${pct}% of entries give the answer away by length (${exploitable}/${list.length}) — shorten the correct option or lengthen the others`);
    else if (exploitable) console.log(`  ${bank}: ${exploitable} length-biased entries (${pct}%, under the 15% limit)`);
  }

  // If most statements are true, "always true" beats actually knowing.
  if (bank === 'blitz') {
    const trues = list.filter(x => x.t === true).length;
    const pct = Math.round((trues / list.length) * 100);
    if (pct < 35 || pct > 65) warn(`blitz: ${pct}% of statements are true (${trues}/${list.length}) — aim for roughly half`);
    else console.log(`  blitz: ${pct}% true, balanced`);
  }

  // A category with one word is a giveaway: the spy guesses it outright.
  if (bank === 'spy') {
    const byCat = new Map();
    for (const x of list) {
      const k = norm(x.cat && x.cat.en);
      byCat.set(k, (byCat.get(k) || 0) + 1);
    }
    const thin = [...byCat].filter(([, n]) => n < 3).map(([k]) => k);
    if (thin.length) warn(`spy: categories with fewer than 3 words are guessable — ${thin.join(', ')}`);
  }
}

function report() {
  for (const e of errors) console.error(`  ERROR  ${e}`);
  for (const w of warnings) console.error(`  WARN   ${w}`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s) — content is broken`);
    return 1;
  }
  if (warnings.length) {
    console.error(`\n${warnings.length} warning(s)${STRICT ? ' — failing because of --strict' : ''}`);
    return STRICT ? 1 : 0;
  }
  console.log('content looks good');
  return 0;
}

process.exit(run());
