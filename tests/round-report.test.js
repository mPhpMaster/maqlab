// The report is the thing that found the only measured problem this game has
// (22% of players never submit a lie in Bluff). A round type it does not know
// about reads as "nobody ever played it" — which is the exact shape of the
// finding it exists to surface, so the failure would look like a result.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const server = read('server.js');
const report = read('scripts/round-report.js');
const types = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));

test('the report knows how to read every round type', () => {
  const took = report.match(/const TOOK_PART = \{[\s\S]*?\n\};/)[0];
  const phase = report.match(/const PHASE_FOR = \{[\s\S]*?\n\};/)[0];
  for (const type of types) {
    assert.ok(new RegExp(`\\b${type}:`).test(took),
      `"${type}" has no participation rule, so the report would show it as never played`);
    assert.ok(new RegExp(`\\b${type}:`).test(phase),
      `"${type}" has no phase, so its answer times cannot be put against a clock`);
  }
});

// A report that quietly drops a type is worse than one that refuses to run.
test('the report refuses to run rather than under-report', () => {
  assert.match(report, /round type\(s\) with no participation rule/,
    'the report no longer checks itself against the server list');
  assert.match(report, /process\.exit\(1\)/);
});

test('the pace table is read from the server, not copied', () => {
  assert.match(report, /const T = \\\{\[\\s\\S\]\*\?\\n\\\};|const T = \{\[\\s\\S\]/,
    'the report should parse the server pace table rather than hold its own copy');
  for (const pace of ['chill', 'normal', 'fast']) {
    assert.ok(report.includes(`'${pace}'`), `the report does not know about the "${pace}" pace`);
  }
});

// Answer timings are useless without knowing what clock they were racing.
test('a finished match records the pace it was played at', () => {
  assert.match(server, /data: \{ v: 1, pace: room\.settings\.pace/,
    'matches no longer record their pace, so a slow answer cannot be told from a tight clock');
});

test('with no database it exits with a clear message rather than a stack trace', () => {
  let code = 0, err = '';
  try {
    execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'round-report.js')], {
      env: { ...process.env, NEON_DATABASE_URL: '', DATABASE_URL: '' },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) { code = e.status; err = (e.stderr || '').toString(); }
  assert.equal(code, 1);
  assert.match(err, /no NEON_DATABASE_URL or DATABASE_URL/);
  assert.ok(!/at Object\./.test(err), 'it threw a stack trace instead of explaining itself');
});
