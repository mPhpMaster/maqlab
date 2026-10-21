// Saving rooms while they run and reading them back after a restart.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { db, discordInstanceRooms, persist, progress, rooms } from './base.js';
import { beginRound, finishRound, nextRound, setTimer } from './flow.js';
import { revealBluff, revealHigher, revealLikely, revealMinor, revealMiss, revealNumber, revealSpy, startMissPick, startSpyVote, startVote } from './rounds-a.js';
import { QUICK, advanceQuick, advanceTwo, resolveQuickItem, revealMany, revealName, revealOrder, revealTwo, startManyGuess, startTwoGuess } from './rounds-b.js';
import { showScores } from './end.js';

// ---------------- surviving a restart ----------------
// What a phase is waiting for. A timer is a live callback and cannot be
// written down, so it is derived from the phase on the way back — the same
// call the phase set for itself when it began.
export const RESUME = {
  spin: beginRound,
  write: startVote,
  vote: revealBluff,
  guess: revealNumber,
  likelyVote: revealLikely,
  spyClue: startSpyVote,
  spyVote: revealSpy,
  order: revealOrder,
  bluffReveal: showScores,
  numReveal: showScores,
  likelyReveal: showScores,
  spyReveal: showScores,
  orderResult: r => { finishRound(r); showScores(r); },
  scores: nextRound,
  nameWrite: revealName,
  nameReveal: showScores,
  minorPick: revealMinor,
  minorReveal: showScores,
  higherPick: revealHigher,
  higherReveal: showScores,
  missWatch: startMissPick,
  missPick: revealMiss,
  missReveal: showScores,
  twoWrite: startTwoGuess,
  twoGuess: revealTwo,
  twoResult: advanceTwo,
  manyAsk: startManyGuess,
  manyGuess: revealMany,
  manyReveal: showScores,
};
for (const q of Object.values(QUICK)) {
  RESUME[q.phase] = resolveQuickItem;
  RESUME[q.result] = advanceQuick;
}

// Long enough for a page to reload and a socket to come back, so nobody loses
// a round to the restart itself.
export const RESUME_GRACE_MS = 20 * 1000;

// Writes are throttled per room: broadcast fires on every answer, and a round
// does not need to be written down that often to survive.
export const SAVE_EVERY_MS = 3000;
export const lastSave = new Map();
export function saveRoom(room, force = false) {
  if (!db.on() || !persist.worthSaving(room)) return null;
  const now = Date.now();
  if (!force && now - (lastSave.get(room.code) || 0) < SAVE_EVERY_MS) return null;
  lastSave.set(room.code, now);
  return db.saveRoom(room.code, persist.dump(room)).catch(e => console.error('could not save room', room.code, e.message));
}
export function forgetRoom(code) {
  lastSave.delete(code);
  if (db.on()) db.dropRoom(code).catch(() => {});
}

export async function restoreRooms() {
  if (!db.on()) return;
  let saved = [];
  try {
    saved = await db.liveRooms(persist.MAX_AGE_MS);
  } catch (e) {
    return console.error('could not read rooms back:', e.message);
  }
  let back = 0;
  for (const data of saved) {
    if (persist.tooOld(data) || rooms.has(data.code)) continue;
    try {
      const room = persist.load(data);
      rooms.set(room.code, room);
      if (room.discordInstance) discordInstanceRooms.set(room.discordInstance, room.code);
      const resume = RESUME[room.phase];
      if (resume) {
        // Whatever was left on the clock, plus enough time to get back in.
        const left = Math.max(data.remainingMs || 0, RESUME_GRACE_MS);
        setTimer(room, left / 1000, () => resume(room));
      }
      back += 1;
    } catch (e) {
      console.error('could not restore room', data && data.code, e.message);
    }
  }
  if (back) console.log(`restored ${back} room(s) in progress`);
}
