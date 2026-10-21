// Starting up (after saved rooms are back) and shutting down cleanly.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { PORT, db, http, io, rooms, server } from './base.js';
import { connected } from './helpers.js';
import { restoreRooms, saveRoom } from './rooms-saved.js';


// Listening waits for the rooms to be back. It used to start at once, so a
// phone reconnecting straight after a deploy asked for its room before it had
// been read back, was told it did not exist, and forgot it. A database too
// slow to answer does not get to hold the game up for longer than this.
export const BOOT_WAIT_MS = 15 * 1000;

// Render stops the old instance with SIGTERM on every deploy and kills it
// about 30 seconds later. Rooms were saved at most every few seconds, so the
// last answers before a deploy could be lost, and sockets were cut without
// a word. Now: stop opening rooms, write every room down as it stands, close
// the sockets (clients reconnect to the new instance and rejoin), close the
// database, and leave well inside the window.
// Counted for /health. Only the first line of the message, cut short, so
// nothing a player typed can ride along in it.
export const errorsSeen = { count: 0, last: null, at: null };
export function noteError(e) {
  errorsSeen.count += 1;
  errorsSeen.last = String((e && e.message) || e || '').split('\n')[0].slice(0, 120);
  errorsSeen.at = new Date().toISOString();
}

export const SHUTDOWN_MS = 20 * 1000;
export let shuttingDown = false;
export async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  const t0 = Date.now();
  console.log(`${signal}: saving rooms and closing`);
  setTimeout(() => { console.error('shutdown took too long, exiting'); process.exit(0); }, SHUTDOWN_MS).unref();
  const saves = [...rooms.values()].map(r => saveRoom(r, true)).filter(Boolean);
  await Promise.allSettled(saves);
  console.log(`saved ${saves.length} room(s) in ${Date.now() - t0} ms`);
  await new Promise(r => io.close(() => r()));
  await db.close().catch(() => {});
  console.log(`closed in ${Date.now() - t0} ms`);
  process.exit(0);
}

// The side effects of this part, run once by main.js in this order.
export function start() {
const booted = db.init()
  .then(ok => {
    console.log(ok ? 'database connected' : 'no DATABASE_URL — profiles, leaderboard and moderation are off');
    // Games that were in progress when this process last stopped. Done after
    // the schema is applied and before anyone can rejoin, so a returning
    // player finds their room already waiting rather than gone.
    if (ok) return restoreRooms();
  })
  .catch(e => console.error('database unavailable, running without it:', e.message));
Promise.race([booted, new Promise(r => setTimeout(r, BOOT_WAIT_MS))])
  .then(() => server.listen(PORT, () => console.log(`MAQLAB running on http://localhost:${PORT}`)));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
}
