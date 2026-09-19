// Identity. Players can still play as anonymous guests — a session only
// matters for the things that must outlive the round: profile, leaderboard,
// follows, moderation.
//
// Sessions are HMAC-signed tokens rather than server-side state, so a restart
// doesn't log everyone out. They travel as an HttpOnly cookie on the web, and
// as a Bearer token inside the Discord Activity, where the iframe is a
// third-party context and cookies are unreliable.
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const COOKIE = 'maqlab_session';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

if (!process.env.SESSION_SECRET) {
  console.warn('no SESSION_SECRET — sessions will be dropped on restart');
}

const b64 = s => Buffer.from(s).toString('base64url');
const sign = data => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

function mint(user) {
  const body = b64(JSON.stringify({ id: user.id, name: user.name, exp: Date.now() + TTL_MS }));
  return `${body}.${sign(body)}`;
}

function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  // timingSafeEqual throws on a length mismatch, which is itself a fast reject
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

// Accepts either transport, so the same code path serves web and Activity.
function sessionFrom(headers) {
  const bearer = /^Bearer (.+)$/.exec(headers.authorization || '');
  return verify(bearer ? bearer[1] : readCookie(headers.cookie, COOKIE));
}

const setCookie = (res, token) =>
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: TTL_MS });
const clearCookie = res => res.clearCookie(COOKIE);

const isAdmin = id => !!id && ADMIN_IDS.includes(id);

module.exports = { mint, verify, sessionFrom, readCookie, setCookie, clearCookie, isAdmin, COOKIE, ADMIN_IDS };
