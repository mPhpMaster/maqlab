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
const server = require('../scripts/server-source')();
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
  assert.match(server, /data: \{\s*v: 1, pace: room\.settings\.pace/,
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

// The report counted every name on the final scoreboard for every round, so a
// player who joined in round 6 showed as skipping rounds 1 to 5, and one who
// left showed as skipping every round after. Measured on production that was
// about a fifth of all "skips".
test('a player counts only for the rounds they were in the room for', () => {
  const { tally, present } = require('../scripts/round-report.js');
  assert.equal(present({ joined: 0, left: null }, 1), true);
  assert.equal(present({ joined: 3, left: null }, 3), false, 'arriving during round 3 is not being there for it');
  assert.equal(present({ joined: 3, left: null }, 4), true);
  assert.equal(present({ joined: 0, left: 4 }, 3), true);
  assert.equal(present({ joined: 0, left: 4 }, 4), false);
  assert.equal(present({}, 2), true, 'older matches with no record must still count everyone');

  const round = n => ({ n, type: 'higher', picks: { a: 'left', late: 'left' } });
  const data = {
    players: [{ pid: 'a', joined: 0, left: null }, { pid: 'late', joined: 2, left: null }, { pid: 'gone', joined: 0, left: 2 }],
    log: [round(1), round(2), round(3)],
  };
  const s = tally([{ data }]).higher;
  // a: rounds 1-3 (3 slots, 3 answers); late: round 3 (1, 1); gone: round 1 (1, 0).
  assert.equal(s.slots, 5);
  assert.equal(s.took, 4);
});

test('drop-off is counted from matches that record arrivals and departures', () => {
  const { dropOff } = require('../scripts/round-report.js');
  const old = { data: { players: [{ pid: 'x' }], log: [] } };
  const now = { data: { public: true, modes: 14, rounds: 12, players: [{ pid: 'a', joined: 0, left: null }, { pid: 'b', joined: 0, left: 5 }], gone: [{ pid: 'c', joined: 4, left: 6 }], log: [] } };
  const { matches, groups } = dropOff([old, now]);
  assert.equal(matches, 1, 'a match without the record was counted');
  assert.deepEqual(groups.all, { people: 3, left: 2 });
  assert.deepEqual(groups['joined late'], { people: 1, left: 1 });
  assert.deepEqual(groups['room: public'], { people: 3, left: 2 });
});

test('a finished match records who came and went', () => {
  assert.match(server, /joinedRound: r\.phase === 'lobby' \? 0 : r\.round, leftRound: null/);
  assert.match(server, /if \(r\.phase !== 'lobby' && r\.phase !== 'final'\) p\.leftRound = r\.round;/);
  assert.match(server, /gone: replay\.gone\(\[\.\.\.room\.players\.values\(\)\], ranked\)/);
});
