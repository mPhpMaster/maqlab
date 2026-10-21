// Small helpers: ids, codes, cleaning names and avatars, fresh player state.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { crypto, rooms } from './base.js';

// ---------------- helpers ----------------
export const rid = (n = 16) => crypto.randomBytes(24).toString('base64url').slice(0, n);
export const rnd = n => Math.floor(Math.random() * n);
export const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Room codes are the only thing protecting a private room, so they come from
// the CSPRNG rather than Math.random, whose stream is predictable from a few
// observed outputs. Five characters from an unambiguous alphabet gives ~8M
// codes instead of 332k, which is no longer worth enumerating.
export const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LEN = 5;
export function newCode() {
  let c;
  do {
    // rejection sampling keeps every character equally likely
    const bytes = crypto.randomBytes(CODE_LEN * 2);
    c = '';
    for (let i = 0; c.length < CODE_LEN && i < bytes.length; i++) {
      if (bytes[i] < 256 - (256 % CODE_CHARS.length)) c += CODE_CHARS[bytes[i] % CODE_CHARS.length];
    }
  } while (c.length < CODE_LEN || rooms.has(c));
  return c;
}

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/(^|\s)(ال|the |a |an )/g, '$1')
    .replace(/[^\p{L}\p{N}.]+/gu, '')
    .trim();
}
export function isTruth(text, q) {
  const n = normalize(text);
  return [q.a.ar, q.a.en, ...(q.alt || [])].some(v => normalize(v) === n);
}
export function cleanAvatar(a) {
  const n = (v, max) => { v = Math.floor(Number(v)); return Number.isFinite(v) && v >= 0 ? v % max : 0; };
  a = a && typeof a === 'object' ? a : {};
  return { s: n(a.s, 6), c: n(a.c, 14), e: n(a.e, 10), m: n(a.m, 10), h: n(a.h, 12) };
}
// Names are cut to fit the UI, but by code point, not UTF-16 unit: slicing a
// Discord display name mid-emoji splits a surrogate pair and leaves mojibake.
export const cleanName = s => [...String(s == null ? '' : s).replace(/\s+/g, ' ').trim()].slice(0, 14).join('').trim() || 'Player';
// Who the game is being played by: in the room, and not just watching.
// Everything that waits for answers, counts heads or picks a player reads
// this, so a watcher can never hold a round up or be voted for.
export const connected = room => [...room.players.values()].filter(p => p.connected && !p.watching);
export const freshStats = () => ({
  fooled: 0, correct: 0, snipes: 0, bullseyes: 0, fastest: 0, highBets: 0, bestStreak: 0,
  famous: 0, spyCaught: 0, spyEvaded: 0,
  // One per round type that had nothing to earn. Each counts the moment
  // that type is actually about, not just taking part in it.
  perfectOrders: 0, nameCrowd: 0, manyExact: 0, twoFoolAll: 0, oddSweeps: 0, minorityWins: 0,
  higherWins: 0, missFound: 0,
});
export const freshPowers = () => ({ peek: 1, double: 1 });
