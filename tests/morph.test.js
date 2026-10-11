// The screen patcher's one real decision: which child of the old screen is
// which child of the new one.
//
// It was matched by position, and that was wrong in a way no test caught,
// because the fault is invisible unless you count nodes. Eighteen views insert
// a "waiting for others" line once you have answered, above the row of
// players. Matched by position, every child below the insertion point is
// matched against its neighbour, so the player row gets patched into the
// waiting line and rebuilt from scratch below it. Measured in the browser on a
// single tap, before the fix: 159 of the 181 elements on screen were new.
//
// alignChildren is pure, so the decision can be held to account here. It is
// read out of app.js rather than imported because the client has no build step
// and no module boundary to import across.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

function load(name) {
  const at = app.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} is gone from public/app.js`);
  // to the closing brace at the function's own indentation
  const end = app.indexOf('\n  }\n', at);
  assert.ok(end > at, `could not find the end of ${name}`);
  const src = app.slice(at, end + 4);
  return new Function(`${src}; return ${name};`)();
}

const alignChildren = load('alignChildren');

// A template literal puts a whitespace text node between every two elements,
// so inserting one line inserts two nodes. "t3" is a text node.
const row = (...tags) => {
  const out = ['t3'];
  for (const tg of tags) { out.push(tg, 't3'); }
  return out;
};
const counts = ops => ops.reduce((n, o) => (n[o.op] = (n[o.op] || 0) + 1, n), {});

// Applying the ops has to produce exactly the new list, whatever the ops are.
// This is the invariant that makes the lookahead safe to be wrong about which
// node to reuse: it can pick badly, it cannot build the wrong screen.
function apply(a, b) {
  const out = [];
  for (const op of alignChildren(a, b)) {
    if (op.op === 'insert') out.push(b[op.n]);
    else if (op.op === 'patch') out.push(b[op.n]);           // patched in place
    else assert.equal(typeof op.o, 'number');                 // removed
  }
  return out;
}

test('an unchanged list reuses every child', () => {
  const keys = row('DIV#.q-card', 'DIV#.timebar', 'DIV#.two-up', 'DIV#.who-row');
  const c = counts(alignChildren(keys, keys));
  assert.equal(c.patch, keys.length);
  assert.equal(c.insert, undefined);
  assert.equal(c.remove, undefined);
});

test('the waiting line appearing above the player row costs two new nodes, not the row', () => {
  const before = row('DIV#.q-card', 'DIV#.timebar', 'DIV#.two-up', 'DIV#.who-row');
  const after = row('DIV#.q-card', 'DIV#.timebar', 'DIV#.two-up', 'DIV#.center', 'DIV#.who-row');
  const ops = alignChildren(before, after);
  const c = counts(ops);
  assert.equal(c.insert, 2, 'the new line and the whitespace in front of it');
  assert.equal(c.patch, before.length, 'every child that was already there is kept');
  assert.equal(c.remove, undefined);
  // and the row of players is reused, not rebuilt
  const rowOp = ops.find(o => o.op === 'patch' && after[o.n] === 'DIV#.who-row');
  assert.ok(rowOp, 'the player row was not matched to anything');
  assert.equal(before[rowOp.o], 'DIV#.who-row');
  assert.deepEqual(apply(before, after), after);
});

test('a line disappearing costs no rebuild either', () => {
  const before = row('DIV#.q-card', 'DIV#.stuck', 'FORM#.card', 'DIV#.who-row');
  const after = row('DIV#.q-card', 'FORM#.card', 'DIV#.who-row');
  const c = counts(alignChildren(before, after));
  assert.equal(c.remove, 2);
  assert.equal(c.patch, after.length);
  assert.equal(c.insert, undefined);
  assert.deepEqual(apply(before, after), after);
});

test('a child that only changes state keeps its place', () => {
  // class="opt big" -> class="opt big picked": the first class is what the
  // thing is, the rest is what state it is in.
  const before = row('BUTTON#.opt', 'BUTTON#.opt', 'DIV#.who-row');
  const after = row('BUTTON#.opt', 'BUTTON#.opt', 'DIV#.center', 'DIV#.who-row');
  const ops = alignChildren(before, after);
  assert.equal(counts(ops).patch, before.length);
  assert.equal(counts(ops).insert, 2);
});

test('a different thing in the same slot is patched where it stands', () => {
  // the typed rounds swap the form for the answer you sent; the form has to go
  const before = row('FORM#.card');
  const after = row('DIV#.my-answer');
  const ops = alignChildren(before, after);
  assert.equal(counts(ops).patch, before.length);
  assert.equal(counts(ops).insert, undefined);
  assert.equal(counts(ops).remove, undefined);
  assert.deepEqual(apply(before, after), after);
});

test('children past the end are appended, and leftovers removed', () => {
  assert.deepEqual(apply(['A'], ['A', 'B', 'C']), ['A', 'B', 'C']);
  assert.deepEqual(apply(['A', 'B', 'C'], ['A']), ['A']);
  assert.deepEqual(apply([], ['A', 'B']), ['A', 'B']);
  assert.deepEqual(apply(['A', 'B'], []), []);
});

test('whatever it decides, the result is the new list', () => {
  // The lookahead is a guess about which node to reuse. A bad guess must cost
  // a rebuilt node, never a wrong screen.
  let seed = 7;
  const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const pool = ['t3', 'DIV#.a', 'DIV#.b', 'DIV#.c', 'BUTTON#.opt', 'SPAN#.nm', 'DIV#x.a'];
  for (let n = 0; n < 2000; n++) {
    const a = Array.from({ length: rnd(9) }, () => pool[rnd(pool.length)]);
    const b = Array.from({ length: rnd(9) }, () => pool[rnd(pool.length)]);
    assert.deepEqual(apply(a, b), b, `a=${a} b=${b}`);
  }
});

test('the patcher actually uses it', () => {
  // A future edit that goes back to matching by position would pass every
  // test above and still bring the fault back.
  const morph = app.match(/function morph\(from, to\)[\s\S]*?\n  }\n/);
  assert.ok(morph, 'morph is gone from public/app.js');
  assert.match(morph[0], /alignChildren\(olds\.map\(keyOf\), news\.map\(keyOf\)\)/,
    'morph is no longer matching its children by key');
  assert.ok(!/for \(let i = 0; i < news\.length; i\+\+\)/.test(morph[0]),
    'morph is matching children by position again');
});
