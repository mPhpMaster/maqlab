// A room written down and read back has to be the same room. These pin the
// three things that do not survive JSON on their own — the player Map, the
// Sets of used questions, and the running clock — plus the two judgement
// calls: who counts as connected afterwards, and which rooms are worth
// keeping at all.
const test = require('node:test');
const assert = require('node:assert');
const persist = require('../persist');

const room = (over = {}) => ({
  code: 'ABCD', hostId: 'p1', phase: 'vote', round: 3, gameNo: 1,
  settings: { lang: 'en', rounds: 8, types: { bluff: true }, pace: 'normal' },
  current: { type: 'bluff', mod: 'normal', options: [{ id: 'o1', text: 'x', authors: ['p2'] }], votes: {} },
  plan: ['bluff', 'spy'], gains: { p1: { total: 300, items: [] } }, prevRank: { p1: 0 },
  awards: [], bestLie: null, pairs: {}, rivals: {}, log: [{ n: 1, type: 'bluff' }],
  balloon: { size: 3, target: 30, pops: {} },
  used: { bluff: new Set([1, 5, 9]), spy: new Set([2]) },
  players: new Map([
    ['p1', { id: 'p1', name: 'Her', score: 900, connected: true, socketId: 'sock-1', stats: { fooled: 2 } }],
    ['p2', { id: 'p2', name: 'Zap', score: 400, connected: true, socketId: null, bot: true }],
  ]),
  deadline: Date.now() + 12000,
  timer: {}, touched: Date.now(), botKey: '1:3:vote:',
  ...over,
});

const roundTrip = r => persist.load(JSON.parse(JSON.stringify(persist.dump(r))));

test('scores, questions asked and the round in progress all come back', () => {
  const back = roundTrip(room());
  assert.equal(back.code, 'ABCD');
  assert.equal(back.phase, 'vote');
  assert.equal(back.round, 3);
  assert.equal(back.players.get('p1').score, 900);
  assert.equal(back.players.get('p1').stats.fooled, 2);
  assert.deepEqual(back.current.options[0].authors, ['p2']);
  assert.deepEqual(back.gains, { p1: { total: 300, items: [] } });
  assert.deepEqual(back.log, [{ n: 1, type: 'bluff' }]);
});

test('the player Map survives as a Map, not an array', () => {
  const back = roundTrip(room());
  assert.ok(back.players instanceof Map, 'players came back as ' + back.players.constructor.name);
  assert.equal(back.players.size, 2);
});

test('used questions come back as Sets, or a game starts repeating itself', () => {
  const back = roundTrip(room());
  assert.ok(back.used.bluff instanceof Set, 'used.bluff came back as ' + back.used.bluff.constructor.name);
  assert.ok(back.used.bluff.has(5));
  assert.equal(back.used.bluff.size, 3);
  assert.ok(back.used.spy.has(2));
});

test('people come back disconnected and bots come back playing', () => {
  const back = roundTrip(room());
  // every human socket died with the process; they are back when they rejoin
  assert.equal(back.players.get('p1').connected, false);
  assert.equal(back.players.get('p1').socketId, null);
  // a bot never had a socket — marking it offline would strand the round
  assert.equal(back.players.get('p2').connected, true);
});

test('the clock is kept as time remaining, never as a deadline', () => {
  const dumped = persist.dump(room());
  assert.equal(dumped.deadline, undefined, 'an absolute deadline would already have expired');
  assert.ok(dumped.remainingMs > 10000 && dumped.remainingMs <= 12000, 'got ' + dumped.remainingMs);
  // and a room with no clock running says so rather than inventing one
  assert.equal(persist.dump(room({ deadline: null })).remainingMs, null);
});

test('the live timer and bot schedule are dropped, not revived stale', () => {
  const back = roundTrip(room());
  assert.equal(back.timer, null);
  assert.equal(back.deadline, null, 'the caller re-arms the clock with a grace period');
  assert.equal(back.botKey, null, 'a stale key would stop the bots ever being scheduled again');
});

test('a room is only worth saving while someone could still come back to it', () => {
  assert.equal(persist.worthSaving(room()), true);
  assert.equal(persist.worthSaving(room({ phase: 'final' })), false, 'a finished game has nothing to resume');
  const botsOnly = room({ players: new Map([['b', { id: 'b', bot: true, connected: true }]]) });
  assert.equal(persist.worthSaving(botsOnly), false, 'bots alone are not a game');
});

test('a stale room is left where it is', () => {
  const now = Date.now();
  assert.equal(persist.tooOld({ savedAt: now - 1000 }, now), false);
  assert.equal(persist.tooOld({ savedAt: now - persist.MAX_AGE_MS - 1 }, now), true);
  assert.equal(persist.tooOld(null, now), true);
  assert.equal(persist.tooOld({}, now), true, 'no timestamp means we cannot tell, so do not restore');
});

test('every phase a round can wait in has a way to be resumed', () => {
  // read the table out of server.js rather than requiring it: server.js opens
  // a listener on require, and the point is that no phase is missing
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const table = src.match(/const RESUME = \{[\s\S]*?\n\};/)[0];
  const listed = [...table.matchAll(/^\s{2}([a-zA-Z]+):/gm)].map(m => m[1]);
  // the phases that carry a timer, from the game itself
  const timed = ['spin', 'write', 'vote', 'guess', 'likelyVote', 'spyClue', 'spyVote', 'order',
    'bluffReveal', 'numReveal', 'likelyReveal', 'spyReveal', 'orderResult', 'scores'];
  for (const ph of timed) assert.ok(listed.includes(ph), `phase "${ph}" has no way to resume`);
  // and the quick rounds are added from QUICK, so the table cannot drift from it
  assert.match(src, /for \(const q of Object\.values\(QUICK\)\) \{/);
});
