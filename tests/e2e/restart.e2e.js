// A deploy in the middle of a game. Render stops the old instance with
// SIGTERM; the new one reads the saved rooms back, and the players' phones
// reconnect and rejoin with the seat token they were given. The game has to
// carry on from where it was, with the scores it had, to the final screen.
//
// Needs a real Postgres: set E2E_DATABASE_URL (CI runs one as a service).
// The tables are created by the server itself on boot.
const test = require('node:test');
const assert = require('node:assert');
const { startServer, playGame, rejoin, sleep } = require('./harness');

const DB = process.env.E2E_DATABASE_URL || '';
const PORT = 4700 + (process.pid % 200);
const skip = !DB && 'set E2E_DATABASE_URL to run the restart cases';

for (const signal of ['SIGTERM', 'SIGKILL']) {
  const what = signal === 'SIGTERM' ? 'a deploy (SIGTERM)' : 'a crash (killed outright)';
  test(`a game survives ${what} mid-game`, { skip }, async () => {
    let srv = await startServer(PORT, { db: DB });
    let before, after, exitCode, savedLine;
    try {
      const g = await playGame(srv.url, {
        n: 4, rounds: 8, tag: `restart-${signal}`, timeoutMs: 180000,
        // Mid-round, once scores exist: the hardest point to come back to.
        when: s => s.round >= 3,
        during: async (players, s) => {
          before = { round: s.round, scores: Object.fromEntries(s.players.map(p => [p.id, p.score])) };
          // Give the periodic save a moment, as a crash would only have that.
          if (signal === 'SIGKILL') await sleep(3500);
          exitCode = await srv.stop(signal);
          savedLine = (srv.log().match(/saved \d+ room\(s\) in \d+ ms/) || [])[0];
          srv = await startServer(PORT, { db: DB });
          for (const p of players) await rejoin(p, srv.url);
          await sleep(300);
          const s2 = players[0].s;
          after = { round: s2.round, scores: Object.fromEntries(s2.players.map(p => [p.id, p.score])) };
        },
      });
      assert.ok(/restored \d+ room\(s\) in progress/.test(srv.log()), `the new instance did not read the room back:\n${srv.log()}`);
      assert.equal(after.round, before.round, 'the game came back on a different round');
      for (const [pid, score] of Object.entries(before.scores)) {
        assert.ok(after.scores[pid] >= score, `${pid} came back with fewer points (${after.scores[pid]} < ${score})`);
      }
      assert.ok(g.final, `after the restart the game stopped in ${g.phase} at round ${g.round}`);
      if (signal === 'SIGTERM' && process.platform !== 'win32') {
        // Windows cannot deliver SIGTERM, so the graceful path is only
        // checked where it exists (CI and Render are Linux).
        assert.equal(exitCode, 0, 'shutdown did not exit cleanly');
        assert.ok(savedLine, 'shutdown did not save the rooms');
      }
    } finally {
      await srv.stop('SIGKILL');
    }
  });
}
