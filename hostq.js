// Questions the host writes for their own room, used in place of a Bluff
// question from the bank.
//
// Code-only rooms, and nothing else. MAQLAB is listed in Discord's directory
// now, so a public room is a room strangers walk into: free text written by
// one of them, shown to all of them, is a moderation surface this game has no
// way to watch. A private room is a group that already knows each other, and
// the host is answerable to them.
//
// The rule lives here rather than inline in the socket handler so a test can
// hold it directly. An "only in private rooms" guard that is never exercised
// is the kind that quietly stops being true.

const MAX_QUESTIONS = 10;
const Q_MAX = 120;
const A_MAX = 60;

const clean = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// A host writes in whatever language the room is playing, so both sides of the
// bilingual shape get the same text: the room only ever reads one of them, and
// a replay should show exactly what the players saw.
const entryFor = (q, a) => ({ q: { ar: q, en: q }, a: { ar: a, en: a }, alt: [], host: true });

function addQuestion(room, { q, a } = {}) {
  if (!room || room.phase !== 'lobby') return { error: 'late' };
  if (room.settings.public) return { error: 'private_only' };
  const list = room.customQ || (room.customQ = []);
  if (list.length >= MAX_QUESTIONS) return { error: 'full' };
  const qt = clean(q, Q_MAX);
  const at = clean(a, A_MAX);
  if (!qt || !at) return { error: 'empty' };
  // The answer is what players are trying to pick out of a line-up of lies, so
  // one that repeats the question is not a round.
  if (qt.toLowerCase() === at.toLowerCase()) return { error: 'same' };
  list.push(entryFor(qt, at));
  return { ok: true, count: list.length };
}

function removeQuestion(room, i) {
  if (!room || room.phase !== 'lobby') return { error: 'late' };
  const list = room.customQ || [];
  const idx = Number(i);
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) return { error: 'bad' };
  list.splice(idx, 1);
  return { ok: true, count: list.length };
}

// Called when the host lists the room publicly. Dropping them is blunt, and it
// is the only version of this that cannot be got around: a question kept
// "just in case" is a question that plays to strangers the moment someone
// flips a toggle and forgets.
function clearIfPublic(room) {
  if (!room || !room.settings.public) return 0;
  const n = (room.customQ || []).length;
  room.customQ = [];
  return n;
}

// Host questions come before the bank, in the order they were written, and
// each plays once. A room that runs out simply goes back to the bank.
function takeQuestion(room) {
  if (!room || room.settings.public) return null;
  const list = room.customQ || [];
  const next = list.find(e => !e.played);
  if (!next) return null;
  next.played = true;
  return next;
}

const pending = room => (room.customQ || []).filter(e => !e.played).length;

module.exports = {
  MAX_QUESTIONS, Q_MAX, A_MAX,
  addQuestion, removeQuestion, clearIfPublic, takeQuestion, pending,
};
