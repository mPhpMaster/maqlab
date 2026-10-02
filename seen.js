// What each signed-in player has already been shown.
//
// Content is drawn without repeats inside a room, and that was enough while
// most people played once. 37% of signed-in players have now played five games
// or more, and `room.used` starts empty every time — so the people who play
// most are the people most likely to meet the same question again. Measured:
// across 301 recorded Bluff rounds, 81 questions had already come round more
// than once.
//
// Entries are remembered by a hash of their own text, never by their position
// in the bank. An index is only stable until someone inserts a question above
// it, at which point every player on the service would silently be marked as
// having seen something they have not.
const crypto = require('crypto');

// Short on purpose: this is a key in a table with one row per player per item,
// not a checksum. 10 hex characters over a bank of a few thousand entries.
const keyOf = (type, entry) => {
  const text = entry && typeof entry === 'object'
    ? (entry.q && entry.q.en) || entry.en || entry.s && entry.s.en || (entry.w && entry.w.en) || JSON.stringify(entry)
    : String(entry);
  return type + ':' + crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 10);
};

// A room's picks are gathered as it plays and written once at the end: a round
// is not worth a database round-trip, and a game that never finishes is not
// worth remembering either.
function note(room, type, entries) {
  const bag = room.seenThisGame || (room.seenThisGame = new Set());
  for (const e of entries) bag.add(keyOf(type, e));
}

// Who the memory is for. Guests have nothing to attach it to, and bots have
// nothing to remember.
const owners = players => [...new Set(players.filter(p => !p.bot && p.userId).map(p => p.userId))];

// Prefer what nobody present has seen. Falling back to the full pool rather
// than running dry is the whole point: a regular should meet new questions
// first, not run out of game.
function fresh(indexes, bank, type, seen) {
  if (!seen || !seen.size) return indexes;
  const unseen = indexes.filter(i => !seen.has(keyOf(type, bank[i])));
  return unseen.length ? unseen : indexes;
}

module.exports = { keyOf, note, owners, fresh };
