// Every mode, played to the final screen, by signed-in players on sockets.
// Run with `npm run test:e2e`. It starts its own server and needs no
// database; it takes about a minute, which is why it is not part of
// `npm test`.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, playGame, joinLate, rejoin, call, sleep } = require('./harness');

const server = require('../../scripts/server-source')();
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

// A newcomer used to sit down with no points mid-game, could not catch up,
// and every round waited for them. Now they watch this game and play the next.
test('someone joining mid-game watches it, and plays the next one', async () => {
  let late, watchingAtJoin, answer;
  const g = await playGame(srv.url, {
    n: 4, rounds: 5, tag: 'late', timeoutMs: 120000, keepOpen: true,
    when: s => s.round >= 2 && !['lobby', 'final'].includes(s.phase),
    types: ['higher'],
    during: async (players, s) => {
      late = await joinLate(srv.url, 'late-new', players[0].code);
      watchingAtJoin = late.s.players.find(p => p.id === late.me).watching;
      answer = await call(late.sock, 'higher', 'left');
    },
  });
  try {
    assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
    assert.equal(watchingAtJoin, true, 'the newcomer was seated as a player mid-game');
    assert.deepEqual(answer, { error: 'watching' }, 'a watcher was allowed to answer');
    noStall(g);
    // Back in the lobby, the watcher is a player like everyone else.
    const host = g.players[0];
    await call(host.sock, 'lobby');
    await sleep(300);
    assert.equal(late.s.players.find(p => p.id === late.me).watching, false, 'still watching after the game ended');
  } finally { late && late.sock.disconnect(); g.players.forEach(p => p.sock.disconnect()); }
});

// The Discord Activity does not always keep the seat token. Someone who comes
// back without it is still the same account, and gets their own seat back:
// their points, and their turn to answer, not a watcher's seat beside it.
test('a player who lost their seat token gets their own seat back mid-game', async () => {
  let before, back, seats;
  const g = await playGame(srv.url, {
    n: 3, rounds: 4, tag: 'notoken', timeoutMs: 120000,
    when: s => s.round >= 2,
    types: ['order'],
    during: async players => {
      const p = players[1];
      before = p.s.players.find(x => x.id === p.me);
      p.token = null;
      back = await rejoin(p, srv.url);
      await sleep(300);
      seats = p.s.players.filter(x => x.userId === p.id);
    },
  });
  assert.ok(g.final, `stopped in ${g.phase} at round ${g.round}`);
  assert.equal(back.token, before.id, 'they were given a new seat');
  assert.equal(seats.length, 1, 'the account sits in the room twice');
  assert.equal(seats[0].watching, false, 'they came back as a watcher');
  assert.ok(seats[0].score >= before.score, 'they lost their points');
  assert.deepEqual(g.errors, [], 'an answer was turned away after coming back');
});

test('a seat token is not a way into someone else\'s seat', async () => {
  const g = await playGame(srv.url, {
    n: 3, rounds: 3, tag: 'steal', types: ['higher'],
    during: async players => {
      const [a, b] = players;
      const r = await call(b.sock, 'join', { code: b.code, token: a.me });
      assert.equal(r.token, b.me, 'a player took over another player\'s seat with their id');
    },
  });
  assert.ok(g.final);
});

test('the server logged no uncaught errors', () => {
  assert.ok(!/uncaught exception|unhandled rejection/i.test(srv.log()), srv.log().split('\n').filter(l => /uncaught|unhandled/i.test(l)).join('\n'));
});
