// Scores, the end of a game, results, and moving a round on when everyone is in.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { achievements, crypto, db, io, progress, replay, seen } from './base.js';
import { connected, freshPowers } from './helpers.js';
import { laughCounts } from './snapshot.js';
import { broadcast, clearTimer, gain, nextRound, noteEnd, pace, setTimer } from './flow.js';
import { revealBluff, revealHigher, revealLikely, revealMinor, revealMiss, revealNumber, revealSpy, startSpyVote, startVote } from './rounds-a.js';
import { QUICK, resolveQuickItem, revealMany, revealName, revealOrder, revealTwo, startManyGuess, startTwoGuess } from './rounds-b.js';
import { forgetRoom } from './rooms-saved.js';

// ----- scores / final -----
// funniest lie: laughs collected during the reveal pay out when the scoreboard opens
export function payLaughs(room) {
  const c = room.current;
  const counts = laughCounts(c);
  const max = Math.max(0, ...Object.values(counts));
  if (!max) return;
  for (const o of c.options) {
    if (counts[o.id] !== max) continue;
    for (const a of o.authors) {
      gain(room, a, 'funniest', 200, false);
      const p = room.players.get(a); if (p) p.score += 200;
    }
  }
}

// The phase each round type ends on, before the scoreboard opens.
//
// This is the one place it is written down, keyed by type so a type without an
// entry is visible rather than implied. It matters more than it looks: a
// reveal phase missing from here does not throw, it just stops — showScores
// returns, no timer is set, and the game sits there. That is exactly what
// happened when "how many of us" was added and this list was not touched,
// which is the second time the same omission has frozen a round. The test in
// tests/rounds.test.js now fails if any type is missing.
export const REVEAL_PHASE = {
  bluff: 'bluffReveal',
  number: 'numReveal',
  likely: 'likelyReveal',
  spy: 'spyReveal',
  order: 'orderResult',
  many: 'manyReveal',
  name: 'nameReveal',
  two: 'twoResult',
  minor: 'minorReveal',
  higher: 'higherReveal',
  missing: 'missReveal',
  ...Object.fromEntries(Object.entries(QUICK).map(([type, q]) => [type, q.result])),
};
export const REVEAL_PHASES = new Set(Object.values(REVEAL_PHASE));
export const isRevealPhase = ph => REVEAL_PHASES.has(ph);

export function showScores(room) {
  if (!isRevealPhase(room.phase)) return;
  if (room.phase === 'bluffReveal') payLaughs(room);
  // Keep the round before the state moves on. This is the only point where
  // every reveal has run and room.gains still holds this round alone.
  if (room.log.length < replay.MAX_ROUNDS) {
    const entry = replay.roundEntry(room, room.settings.lang);
    if (entry) room.log.push(entry);
  }
  room.phase = 'scores';
  setTimer(room, pace(room, 'scores'), () => nextRound(room));
  broadcast(room);
}

export function computeAwards(room) {
  const ps = [...room.players.values()].filter(p => p.stats);
  const defs = [['liar', 'fooled'], ['detective', 'correct'], ['sniper', 'snipes'], ['lightning', 'fastest'], ['gambler', 'highBets'], ['fire', 'bestStreak'], ['star', 'famous']];
  const out = [];
  for (const [key, stat] of defs) {
    const best = ps.slice().sort((a, b) => b.stats[stat] - a.stats[stat])[0];
    if (best && best.stats[stat] >= (stat === 'bestStreak' ? 2 : 1)) out.push({ key, pid: best.id, value: best.stats[stat] });
  }
  return out;
}

// Lifetime totals are written once, here. Every player is signed in, so every
// player gets a row.
export async function recordResults(room) {
  if (!db.on()) return;
  const ranked = [...room.players.values()].filter(p => !p.watching && (p.score > 0 || p.connected)).sort((a, b) => b.score - a.score);
  const top = ranked.length ? ranked[0].score : 0;
  // Every row of this game shares one id, so /match/<id> can gather them back
  // into a single scoreboard that anyone holding the link can open.
  const matchId = crypto.randomUUID();
  // Saved before the per-player rows, and separately from them, because the
  // replay has to hold everyone who played — bots included — and game_results
  // only has rows for accounts.
  try {
    await db.saveMatch({
      id: matchId, roomCode: room.code, gameNo: room.gameNo,
      lang: room.settings.lang, rounds: room.settings.rounds,
      // The pace is part of the result, not a setting that happened to be on:
      // without it a slow answer cannot be told from a tight clock, which is
      // the one question the round timings were added to answer.
      data: {
        v: 1, pace: room.settings.pace, players: replay.roster(ranked), log: room.log,
        // For the drop-off report: who left with nothing, whether strangers
        // could walk in, and how many modes were in the mix.
        gone: replay.gone([...room.players.values()], ranked),
        public: !!room.settings.public, modes: Object.values(room.settings.types).filter(Boolean).length,
        rounds: room.settings.rounds,
      },
    });
    // The final screen can offer the result as a link once it exists. Saved
    // a moment after the screen first appears, so it is sent again.
    room.lastMatchId = matchId;
    if (room.phase === 'final') broadcast(room);
  } catch (e) {
    console.error('could not save match replay', e.message);
  }
  // Written once, now that the game is over: a question seen in a game that
  // was abandoned halfway was not really spent.
  db.markSeen(seen.owners(ranked), [...(room.seenThisGame || [])]);
  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    if (!p.userId) continue;
    const won = p.score > 0 && p.score === top;
    const awards = room.awards.filter(a => a.pid === p.id).length;
    const game = {
      userId: p.userId, roomCode: room.code, gameNo: room.gameNo, matchId, score: p.score,
      place: i + 1, players: ranked.length, rounds: room.settings.rounds, won,
      xp: 50 + Math.floor(p.score / 10) + awards * 100 + (won ? 200 : 0),
      stats: p.stats, achievements: [],
    };
    try {
      if (!await db.recordGame(game)) continue; // already recorded
      const profile = await db.getProfile(p.userId);
      const fresh = profile ? achievements.earned(profile, game) : [];
      if (fresh.length) {
        await db.addAchievements(p.userId, fresh);
        if (p.socketId) io.to(p.socketId).emit('achievements', fresh);
      }
    } catch (e) {
      console.error('could not record game for', p.userId, e.message);
    }
  }
}

export function finishGame(room) {
  clearTimer(room);
  room.deadline = null;
  room.awards = computeAwards(room);
  // rivals: who fooled you the most, and who you fooled the most
  room.rivals = {};
  for (const p of room.players.values()) {
    const mine = Object.entries(room.pairs[p.id] || {}).sort((a, b) => b[1] - a[1])[0];
    let victim = null;
    for (const [vid, row] of Object.entries(room.pairs)) if (vid !== p.id && row[p.id] && (!victim || row[p.id] > victim[1])) victim = [vid, row[p.id]];
    if (mine || victim) room.rivals[p.id] = { nemesis: mine ? { id: mine[0], n: mine[1] } : null, victim: victim ? { id: victim[0], n: victim[1] } : null };
  }
  room.phase = 'final';
  broadcast(room);
  recordResults(room).catch(e => console.error('recordResults', e.message));
  // Nothing to come back to once the scores are final.
  forgetRoom(room.code);
}

export function backToLobby(room) {
  clearTimer(room);
  Object.assign(room, { phase: 'lobby', round: 0, current: null, deadline: null, gains: {}, prevRank: {}, awards: [], bestLie: null });
  for (const p of room.players.values()) { p.score = 0; p.streak = 0; p.powers = freshPowers(); p.ready = false; p.watching = false; }
  broadcast(room);
}

// What each answering phase does once nobody is left to wait for. The keys are
// ACTIVE's, and "has this player answered" lives in progress.js; both are held
// to ACTIVE by tests/progress.test.js.
export const ON_ALL_IN = {
  write: startVote, vote: revealBluff, guess: revealNumber, likelyVote: revealLikely,
  blitz: resolveQuickItem, emoji: resolveQuickItem, odd: resolveQuickItem,
  order: revealOrder, spyClue: startSpyVote, spyVote: revealSpy,
  manyAsk: startManyGuess, manyGuess: revealMany, nameWrite: revealName,
  twoWrite: startTwoGuess, twoGuess: revealTwo,
  minorPick: revealMinor, higherPick: revealHigher, missPick: revealMiss,
};

// Moves the round on when everyone still here has answered, and says whether
// it did, so a submit broadcasts only when nothing else will.
export function advanceIfAllIn(room) {
  if (!progress.allAnswered(room.phase, room.current, connected(room))) return false;
  noteEnd(room, 'all');
  ON_ALL_IN[room.phase](room);
  return true;
}

// Someone left or was kicked: they may have been the last one we were waiting for.
export function checkProgress(room) {
  advanceIfAllIn(room);
}
