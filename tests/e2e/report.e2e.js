// The round report reads what real games record. Played on a real Postgres
// (E2E_DATABASE_URL): a game where one player never answers and then leaves,
// so the match carries arrivals, departures and how each phase ended, and
// the report has something true to say about all three.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { startServer, playGame, sleep } = require('./harness');

const DB = process.env.E2E_DATABASE_URL || '';
const skip = !DB && 'set E2E_DATABASE_URL to run the report case';

test('a finished game shows up in the report: who left, and how rounds ended', { skip }, async () => {
  const srv = await startServer(4990 + (process.pid % 9), { db: DB });
  const since = new Date(Date.now() - 1000).toISOString();
  try {
    const g = await playGame(srv.url, {
      n: 4, types: ['higher', 'minor'], rounds: 3, tag: `rep${process.pid}`, silent: [3],
      when: s => s.round >= 2,
      during: async players => { players[3].sock.disconnect(); },
    });
    assert.ok(g.final);
    await sleep(1500);
  } finally {
    await srv.stop('SIGKILL');
  }
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'round-report.js'), '--since', since], {
    env: { ...process.env, DATABASE_URL: DB, NEON_DATABASE_URL: '' }, encoding: 'utf8',
  });
  assert.match(out, /how answering ended/, out);
  assert.match(out, /who left before the end/);
  assert.match(out, /left early\s+\d+%/);
  const all = out.match(/\n  all\s+(\d+) people\s+left early\s+(\d+)%/);
  assert.ok(all && Number(all[1]) >= 4 && Number(all[2]) > 0, `the player who left is not counted:\n${out}`);
});
