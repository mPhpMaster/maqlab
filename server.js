// MAQLAB's server lives in server/, as ES modules, one per part of the game;
// server/main.js says what starts in what order. This file stays the entry
// point so `npm start`, Render and the tests run the same command as before.
import('./server/main.js').catch(e => {
  console.error('could not start:', e && e.stack ? e.stack : e);
  process.exit(1);
});
