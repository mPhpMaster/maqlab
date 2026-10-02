// The image a shared match link shows in a Discord channel or a chat app.
//
// The text card already carries the podium, and most of the time that is what
// people read. This is for the places that show a picture and little else, and
// for the scroll-past case: a result you can read without deciding to read it.
//
// Rendered as SVG and rasterised, because the alternative — a canvas library —
// brings a much larger native dependency for the same four lines of text. The
// font is shipped rather than loaded from the system: Render's container has
// no Arabic font at all, and a card whose Arabic renders as empty boxes is
// worse than no card.
const fs = require('fs');
const path = require('path');

const W = 1200;
const H = 630;
const FONT = path.join(__dirname, 'assets', 'Cairo-Bold.ttf');

let Resvg = null;
try { ({ Resvg } = require('@resvg/resvg-js')); } catch { /* card route stays off */ }
const available = () => !!Resvg && fs.existsSync(FONT);

const num = n => Number(n || 0).toLocaleString('en-US');
// The card is drawn with one font, and a character that font lacks does not
// degrade — resvg draws an empty box. Stripping emoji was the first attempt
// and it was not enough: the first card served from production had a real
// player whose name came out as "! -> " and six boxes, because Cairo covers
// Latin and Arabic and nothing else.
//
// So the font is asked what it can draw, rather than guessed at. Its cmap is
// read once at startup and anything outside it is dropped.
let COVERED = null;

function readCoverage(file) {
  const b = fs.readFileSync(file);
  const set = new Set();
  const numTables = b.readUInt16BE(4);
  let cmapAt = 0;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (b.toString('latin1', rec, rec + 4) === 'cmap') cmapAt = b.readUInt32BE(rec + 8);
  }
  if (!cmapAt) return set;
  // Prefer a full Unicode subtable; fall back to the BMP one.
  let best = 0, bestFormat = -1;
  const n = b.readUInt16BE(cmapAt + 2);
  for (let i = 0; i < n; i++) {
    const rec = cmapAt + 4 + i * 8;
    const off = cmapAt + b.readUInt32BE(rec + 4);
    const format = b.readUInt16BE(off);
    if ((format === 12 || format === 4) && format > bestFormat) { best = off; bestFormat = format; }
  }
  if (!best) return set;

  if (bestFormat === 12) {
    const groups = b.readUInt32BE(best + 12);
    for (let i = 0; i < groups; i++) {
      const g = best + 16 + i * 12;
      const start = b.readUInt32BE(g), end = b.readUInt32BE(g + 4), glyph = b.readUInt32BE(g + 8);
      if (!glyph && start === 0) continue;
      for (let cp = start; cp <= end && cp - start < 0x10000; cp++) set.add(cp);
    }
    return set;
  }

  const segX2 = b.readUInt16BE(best + 6), seg = segX2 / 2;
  const endAt = best + 14, startAt = endAt + segX2 + 2;
  const deltaAt = startAt + segX2, rangeAt = deltaAt + segX2;
  for (let i = 0; i < seg; i++) {
    const end = b.readUInt16BE(endAt + i * 2), start = b.readUInt16BE(startAt + i * 2);
    const delta = b.readInt16BE(deltaAt + i * 2), rangeOff = b.readUInt16BE(rangeAt + i * 2);
    if (start === 0xFFFF) continue;
    for (let cp = start; cp <= end; cp++) {
      let glyph;
      if (!rangeOff) glyph = (cp + delta) & 0xFFFF;
      else {
        const at = rangeAt + i * 2 + rangeOff + (cp - start) * 2;
        if (at + 1 >= b.length) continue;
        glyph = b.readUInt16BE(at);
        if (glyph) glyph = (glyph + delta) & 0xFFFF;
      }
      if (glyph) set.add(cp);
    }
  }
  return set;
}

function covered() {
  if (COVERED) return COVERED;
  try { COVERED = readCoverage(FONT); } catch { COVERED = new Set(); }
  return COVERED;
}

// Keeps only what the font can actually draw. An empty coverage set means the
// font could not be read at all, and then nothing is stripped — a card with
// boxes beats no card, and available() has already decided whether to draw one.
function drawable(s) {
  const cov = covered();
  const text = String(s == null ? '' : s);
  if (!cov.size) return text.replace(/\s+/g, ' ').trim();
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 32 || cov.has(cp)) out += ch;
  }
  return out.replace(/\s+/g, ' ').trim();
}
// Arabic mixed with digits comes out in the wrong order: left to right, the
// numbers bind to the word on the wrong side, so "12 rounds, 5 players" reads
// as "5 rounds, 12 players". resvg ignores direction="rtl"; an explicit
// right-to-left embedding is what actually moves the runs.
const rtlRun = s => `\u202B${s}\u202C`;
// Names are written by players, and this text goes into an XML document.
const esc = s => String(s == null ? '' : s)
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
// Arabic and Latin count differently on screen, but a hard cap is what keeps a
// long name from running off the card, so it is measured in characters.
const trim = (s, n) => { const t = String(s || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

const ROW_COLOR = ['#ffd65c', '#cfd4e8', '#e9a178'];

// A name half of which the font cannot draw comes out as wreckage: the first
// production card had a winner rendered as "! ->" once the rest was stripped.
// Below half kept, the name is replaced outright rather than shown in pieces —
// the rank disc beside it already says who this row is.
function displayName(raw, lang) {
  const kept = drawable(raw);
  const all = [...String(raw == null ? '' : raw)].filter(c => c.trim()).length;
  const left = [...kept].filter(c => c.trim()).length;
  if (left && left * 2 >= all) return kept;
  return lang === 'ar' ? 'لاعب' : 'Player';
}

function cardSvg({ players = [], rounds = 0, lang = 'en' } = {}) {
  const top = players.slice(0, 3);
  const others = Math.max(0, players.length - top.length);
  const rtl = lang === 'ar';
  const foot = rtl
    ? rtlRun(`${num(rounds)} جولة · ${num(players.length)} لاعبين`)
    : `${num(rounds)} rounds · ${num(players.length)} players`;

  const rows = top.map((p, i) => {
    const y = 268 + i * 96;
    return `
    <g>
      <rect x="110" y="${y - 46}" width="980" height="78" rx="22" fill="#241f47" opacity="${i === 0 ? 0.95 : 0.6}"/>
      <circle cx="166" cy="${y - 7}" r="26" fill="${ROW_COLOR[i]}" opacity="${i === 0 ? 1 : 0.85}"/>
      <text x="166" y="${y + 5}" font-size="30" fill="#1b1733" text-anchor="middle">${i + 1}</text>
      <text x="214" y="${y + 8}" font-size="${i === 0 ? 44 : 38}" fill="${ROW_COLOR[i]}">${esc(trim(displayName(p.name, lang), 22))}</text>
      <text x="1056" y="${y + 8}" font-size="${i === 0 ? 44 : 38}" fill="#ffffff" text-anchor="end">${num(p.score)}</text>
    </g>`;
  }).join('');

  // No external stylesheet, no system fonts: everything the rasteriser needs
  // is in this string and the one font file.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a2150"/>
      <stop offset="55%" stop-color="#1b1733"/>
      <stop offset="100%" stop-color="#241a3a"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="1065" cy="86" r="190" fill="#ff6b6b" opacity="0.10"/>
  <circle cx="150" cy="590" r="170" fill="#5aaeff" opacity="0.10"/>
  <g font-family="Cairo" font-weight="700">
    <text x="110" y="128" font-size="58" fill="#ffd65c" letter-spacing="2">MAQLAB</text>
    <text x="398" y="128" font-size="46" fill="#b9a7ff">مقلب</text>
    <text x="110" y="186" font-size="30" fill="#9b93c4">${esc(foot)}</text>
    ${rows}
    ${others ? `<text x="110" y="${268 + top.length * 96 + 6}" font-size="28" fill="#9b93c4">+${num(others)}</text>` : ''}
  </g>
</svg>`;
}

function renderCard(data) {
  if (!available()) return null;
  const r = new Resvg(cardSvg(data), {
    font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: 'Cairo' },
    fitTo: { mode: 'width', value: W },
  });
  return r.render().asPng();
}

// A finished match never changes, so a rendered card is good forever. The cap
// is the point: without one this is a map keyed by anything a crawler asks
// for, on an instance with 512MB to its name.
const MAX_CACHED = 40;
const cache = new Map();

function cardFor(id, data) {
  if (cache.has(id)) {
    const hit = cache.get(id);
    cache.delete(id);        // move to the end: plain LRU over insertion order
    cache.set(id, hit);
    return hit;
  }
  const png = renderCard(data);
  if (!png) return null;
  cache.set(id, png);
  if (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  return png;
}

module.exports = { W, H, available, cardSvg, renderCard, cardFor, drawable, displayName, cacheSize: () => cache.size };
