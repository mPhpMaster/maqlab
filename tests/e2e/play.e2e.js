// Every mode, played to the final screen, by signed-in players on sockets.
// Run with `npm run test:e2e`. It starts its own server and needs no
// database; it takes about a minute, which is why it is not part of
// `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, playGame, sleep } = require('./harness');

const server = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
const TYPES = server.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
// Each mode's answering phases, so the test can say a mode was actually
// played rather than skipped by the planner.
const PHASES = {
  bluff: ['write', 'vote'], number: ['guess'], blitz: ['blitz'], likely: ['likelyVote'], emoji: ['emoji'],
  odd: ['odd'], order: ['order'], spy: ['spyClue', 'spyVote'], many: ['manyAsk', 'manyGuess'],
  name: ['nameWrite'], two: ['twoWrite', 'twoGuess'], minor: ['minorPick'], higher: ['higherPick'], missing: ['missPick'],
};

// Everyone answers at once, so an answering phase should be over in well
// under this. One that is not was waiting out its clock for someone gone.
const ANSWER_MS = 4000;
const ANSWERING = new Set(Object.values(PHASES).flat());
function noStall(g) {
  const slow = Object.entries(g.longest).filter(([ph, ms]) => ANSWERING.has(ph) && ms > ANSWER_MS);
  assert.deepEqual(slow.map(([ph, ms]) => `${ph} ${Math.round(ms / 100) / 10}s`), [], 'an answering phase waited out its clock');
}

let srv;
test.before(async () => { srv = await startServer(4100 + (process.pid % 500)); });
test.after(() => srv && srv.stop());

test('the harness knows every mode', () => {
  assert.deepEqual(Object.keys(PHASES).sort(), [...TYPES].sort());
});

for (const type of TYPES) {
  test(`${type}: four players play it to the final screen`, async () => {
    const g = await playGame(srv.url, { n: 4, types: [type], rounds: 3, tag: type });
    assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
    for (const ph of PHASES[type]) assert.ok(g.seen.has(ph), `${type} never reached ${ph}`);
    assert.deepEqual(g.errors, [], 'the server refused an answer a player was allowed to give');
    noStall(g);
  });
}

// The stall that row 2 fixed: everyone has answered except one player, who
// then leaves. The round has to move on at once, not when its clock runs out.
for (const type of TYPES) {
  test(`${type}: the last player we were waiting for leaves, and the round moves on`, async () => {
    const g = await playGame(srv.url, {
      n: 5, types: [type], rounds: 3, tag: `${type}-x`, silent: [4],
      when: s => s.round >= 1 && ANSWERING.has(s.phase),
      during: async players => { await sleep(600); players[4].sock.disconnect(); await sleep(100); },
    });
    assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
    noStall(g);
  });
}

test('twelve players, every mode on, twelve rounds', async () => {
  const g = await playGame(srv.url, { n: 12, rounds: 12, tag: 'full', timeoutMs: 180000 });
  assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
  assert.deepEqual(g.errors, []);
});

test('a player who disconnects mid-game does not stop it', async () => {
  const g = await playGame(srv.url, {
    n: 5, rounds: 8, tag: 'drop', timeoutMs: 150000,
    during: async players => { players[3].sock.disconnect(); await sleep(200); },
  });
  assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
  assert.deepEqual(g.errors, []);
  noStall(g);
});

test('the host leaving mid-game hands the game to someone and it finishes', async () => {
  let before;
  const g = await playGame(srv.url, {
    n: 5, rounds: 8, tag: 'host', timeoutMs: 150000,
    during: async (players, s) => { before = s.hostId; players[0].sock.disconnect(); await sleep(300); },
  });
  assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
  assert.ok(before && g.hostId && g.hostId !== before, 'nobody took over as host');
});

test('the server logged no uncaught errors', () => {
  assert.ok(!/uncaught exception|unhandled rejection/i.test(srv.log()), srv.log().split('\n').filter(l => /uncaught|unhandled/i.test(l)).join('\n'));
});
