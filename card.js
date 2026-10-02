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
// The card is drawn with one font, and that font has no emoji in it. An emoji
// left in a name does not degrade, it renders as an empty box — so anything
// the font cannot draw comes out before it is drawn. Checked by rendering, not
// assumed: the first card had three tofu boxes down the medal column.
const noEmoji = s => String(s == null ? '' : s)
  .replace(/\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
  .replace(/\s+/g, ' ')
  .trim();
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
      <text x="214" y="${y + 8}" font-size="${i === 0 ? 44 : 38}" fill="${ROW_COLOR[i]}">${esc(trim(noEmoji(p.name) || '—', 22))}</text>
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

module.exports = { W, H, available, cardSvg, renderCard, cardFor, cacheSize: () => cache.size };
