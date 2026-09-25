// Rooms live in memory, which is the right place for them: a round is a
// handful of seconds and nothing about it needs a disk. The cost is that a
// deploy or a crash used to take every game in progress with it — fine when
// the players were four friends who would just start again, not fine now that
// strangers can find the game and a restart lands mid-round.
//
// So a room is written down as it changes and read back on boot. This file
// does the conversion and nothing else: no database, no timers, no sockets,
// so it can be tested against a real room object without starting a server.

// A room older than this is not worth restoring — everyone has long since
// closed the tab, and reviving it would only confuse whoever kept the link.
const MAX_AGE_MS = 10 * 60 * 1000;

// Three things in a room cannot be written down, and each needs its own
// answer on the way back:
//   players   a Map, and every socketId in it is meaningless after a restart
//   used      Sets of content indices, so a game does not repeat a question
//   timer     a live setTimeout; what survives is how long was left on it
function dump(room) {
  return {
    v: 1,
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    round: room.round,
    gameNo: room.gameNo,
    current: room.current,
    plan: room.plan,
    gains: room.gains,
    prevRank: room.prevRank,
    awards: room.awards,
    bestLie: room.bestLie,
    pairs: room.pairs,
    rivals: room.rivals,
    balloon: room.balloon,
    log: room.log,
    used: Object.fromEntries(Object.entries(room.used || {}).map(([k, set]) => [k, [...set]])),
    players: [...room.players.values()].map(p => ({ ...p, socketId: null })),
    // Time left on the clock, not the deadline itself. An absolute deadline
    // would have expired while the server was down, and the round would end
    // the instant it came back — losing it to the restart.
    remainingMs: room.deadline ? Math.max(0, room.deadline - Date.now()) : null,
    savedAt: Date.now(),
  };
}

function load(data) {
  const room = {
    code: data.code,
    hostId: data.hostId,
    phase: data.phase,
    settings: data.settings,
    round: data.round,
    gameNo: data.gameNo,
    current: data.current,
    plan: data.plan || [],
    gains: data.gains || {},
    prevRank: data.prevRank || {},
    awards: data.awards || [],
    bestLie: data.bestLie || null,
    pairs: data.pairs || {},
    rivals: data.rivals || {},
    balloon: data.balloon || { size: 0, target: 30, pops: {} },
    log: data.log || [],
    used: Object.fromEntries(Object.entries(data.used || {}).map(([k, arr]) => [k, new Set(arr)])),
    players: new Map((data.players || []).map(p => [p.id, {
      ...p,
      socketId: null,
      // Every human socket died with the old process; they are back only once
      // they rejoin. Bots never had a socket, so marking them offline would
      // quietly take them out of the round they are in the middle of playing.
      connected: !!p.bot,
    }])),
    timer: null,
    deadline: null,
    // Cleared so the first broadcast re-schedules the bots, whose pending
    // moves died with the old process too.
    botKey: null,
    touched: Date.now(),
  };
  return room;
}

const tooOld = (data, now = Date.now()) => !data || !data.savedAt || now - data.savedAt > MAX_AGE_MS;

// A room nobody is in is not worth writing down, and neither is one that has
// finished: there is nothing left to resume.
const worthSaving = room =>
  !!room && room.phase !== 'final' && [...room.players.values()].some(p => !p.bot);

module.exports = { MAX_AGE_MS, dump, load, tooOld, worthSaving };
