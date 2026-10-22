// Security headers, the page itself, link previews, static files.
// Split out of server.js unchanged; see server/main.js for the order things start in.

import { MIN_PLAYERS, QRCode, ROOT, TYPES, app, card, content, crypto, db, express, fs, path, rooms } from './base.js';
import { connected } from './helpers.js';
import { humans } from './snapshot.js';
import { UUID, origin } from './http-accounts.js';


// Security headers. No X-Frame-Options: the game runs framed inside Discord,
// so framing is limited with frame-ancestors instead, to Discord's own hosts.
// The policy is report-only for now: violations are logged at
// /api/csp-report, and once a week of real traffic shows none it can be
// switched to Content-Security-Policy.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // The views set style="" on elements throughout.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self' https://discord.com https://*.discord.com https://discordapp.com https://*.discordapp.com https://*.discordsays.com",
  'report-uri /api/csp-report',
].join('; ');
// At most a few lines a minute, so a page stuck in a loop cannot fill the log.
export let cspLogged = 0, cspWindow = 0;

// Link previews. Crawlers don't run our JS, so the share card has to be in the
// HTML they receive — and og:image has to be absolute, which we only know at
// request time. The page keeps a placeholder block we swap out per route.
export const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
export const OG_BLOCK = /<!--og-->[\s\S]*?<!--\/og-->/;

// Discord's activity proxy serves stale modules for a long time whatever the
// cache headers say, so the URL itself has to change when the code does. The
// stamp is a hash of the client modules: it moves on a real change and
// stays put across restarts that changed nothing.
// Every file the page loads as code or style, the client modules in js/ and
// css/ included, so a change to any one of them moves the stamp.
const listed = dir => { try { return fs.readdirSync(path.join(ROOT, 'public', dir)).filter(f => /\.(js|css)$/.test(f)).sort().map(f => `${dir}/${f}`); } catch { return []; } };
export const STAMPED = ['app.js', 'discord.js', 'avatar.js', 'style.css', ...listed('js'), ...listed('css')];
export const ASSET_V = crypto.createHash('sha1')
  .update(STAMPED.map(f => {
    try { return fs.readFileSync(path.join(ROOT, 'public', f)); } catch { return ''; }
  }).join('|'))
  .digest('hex').slice(0, 10);

// The client is a set of modules importing one another. A browser resolves
// "./core.js" without the importing page's ?v=, so Discord's proxy could hand
// back a stale module next to a fresh one, or the same module twice under two
// addresses with two copies of its state. Every import the server sends out
// carries the current stamp instead. Read once: the files only change with a
// deploy, which restarts the process.
const STAMP_IMPORT = /((?:\bfrom|\bimport)\s*['"])(\.{1,2}\/[\w/-]+\.js)(['"])/g;
const stampedJs = new Map();
export function stampedModule(rel) {
  if (!stampedJs.has(rel)) {
    const text = fs.readFileSync(path.join(ROOT, 'public', rel), 'utf8');
    stampedJs.set(rel, text.replace(STAMP_IMPORT, `$1$2?v=${ASSET_V}$3`));
  }
  return stampedJs.get(rel);
}
export const attr = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const SITE_TITLE = 'MAQLAB | مقلب';
export const SITE_DESC = 'A party game for your whole crew: lie well, catch the liars, guess faster than your friends. · لعبة حفلات جماعية: اكذب بذكاء، اكشف الكذابين، وخمّن أسرع من ربعك.';

export function page(req, title, desc, image) {
  const base = `${req.protocol}://${req.get('host')}`;
  const og = image ? `${base}${image}` : `${base}/og.jpg`;
  return INDEX_HTML
    // The tab and a pasted link show the match ("🏆 Hana — 2,080"), not just the game.
    .replace(/<title>[^<]*<\/title>/, `<title>${attr(title)}</title>`)
    .replace('src="/app.js"', `src="/app.js?v=${ASSET_V}"`)
    .replace('src="/avatar.js"', `src="/avatar.js?v=${ASSET_V}"`)
    // The stylesheet needs the stamp as much as the scripts do. It was the one
    // asset without it, and Discord's proxy serves what it likes regardless of
    // cache headers — so a player could get new markup with the old stylesheet,
    // which is markup carrying class names the stylesheet has never heard of.
    .replace('href="/style.css"', `href="/style.css?v=${ASSET_V}"`)
    // and the rest of the stylesheets, which follow it in css/
    .replace(/href="\/css\/([\w-]+\.css)"/g, (_, f) => `href="/css/${f}?v=${ASSET_V}"`)
    .replace(OG_BLOCK, [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="MAQLAB">',
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(desc)}">`,
    `<meta property="og:image" content="${og}">`,
    `<meta property="og:image:width" content="${card.W}">`,
    `<meta property="og:image:height" content="${card.H}">`,
    `<meta property="og:url" content="${base}${req.originalUrl}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${og}">`,
  ].join('\n  '));
}
// A shared match link is the only thing this game produces that leaves the
// room, and it was arriving in a Discord channel as a bare URL with a generic
// blurb. The card now carries the actual podium, so everyone in the channel
// reads the result without opening anything.
export const num = n => Number(n).toLocaleString('en-US');

export function matchCard(players, rounds) {
  const top = players.slice(0, 3).map(p => `${p.name} ${num(p.score)}`).join(' · ');
  const rest = players.length > 3 ? ` +${players.length - 3}` : '';
  const en = `${top}${rest} — ${rounds} rounds, ${players.length} players.`;
  const ar = `${rounds} جولة بين ${players.length} لاعبين — افتحها تشوف كل جولة: مين كتب وش، ومين وقع في وش.`;
  return `${en} · ${ar}`;
}

// The side effects of this part, run once by main.js in this order.
export function registerPages() {
// ---------------- http ----------------
app.set('trust proxy', 1); // Render terminates TLS ahead of us; needed for secure cookies + req.protocol
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy-Report-Only', CSP);
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.post('/api/csp-report', express.json({ type: ['application/csp-report', 'application/json', 'application/reports+json'], limit: '16kb' }), (req, res) => {
  const now = Date.now();
  if (now - cspWindow > 60000) { cspWindow = now; cspLogged = 0; }
  const r = (req.body && (req.body['csp-report'] || req.body[0]?.body || req.body)) || {};
  if (cspLogged++ < 5) console.log('csp:', r['violated-directive'] || r.effectiveDirective || '?', r['blocked-uri'] || r.blockedURL || '?', 'on', r['document-uri'] || r.documentURL || '?');
  res.status(204).end();
});
app.use(express.json());

// Every route below hands back HTML built at request time, so it carries the
// same revalidate rule the static files got.
app.use(['/', '/room/:code', '/match/:id', '/profile'], (_, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  next();
});

app.get('/', (req, res) => res.type('html').send(page(req, SITE_TITLE, SITE_DESC)));
app.get('/room/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const room = rooms.get(code);
  const n = room ? connected(room).length : 0;
  res.type('html').send(page(req,
    `🎈 ادخل غرفة ${code} · MAQLAB`,
    n ? `${n} of your friends are in this room right now — tap to join. · ${n} من ربعك ينتظرونك بالغرفة الحين، اضغط وادخل على طول.` : SITE_DESC));
});

// The podium as an image, for the places that show a picture and not much
// else. Rendered on demand and kept: a finished match cannot change.
app.get('/match/:id/card.png', async (req, res) => {
  if (!card.available() || !db.on() || !UUID.test(req.params.id)) return res.status(404).end();
  const rep = await db.getReplay(req.params.id).catch(() => null);
  const players = rep && rep.data && rep.data.players ? rep.data.players : [];
  if (!players.length) return res.status(404).end();
  const png = card.cardFor(req.params.id, {
    players: players.map(p => ({ name: p.name, score: p.score })),
    rounds: rep.rounds,
    lang: rep.lang,
  });
  if (!png) return res.status(404).end();
  res.type('png').setHeader('Cache-Control', 'public, max-age=86400, immutable').send(png);
});

app.get('/match/:id', async (req, res) => {
  let title = SITE_TITLE, desc = SITE_DESC, image = null;
  if (db.on() && UUID.test(req.params.id)) {
    // The replay knows everyone who played; game_results has no rows for bots,
    // so the card reads the roster from the replay.
    const [rows, rep] = await Promise.all([
      db.getMatch(req.params.id).catch(() => []),
      db.getReplay(req.params.id).catch(() => null),
    ]);
    const players = rep && rep.data && rep.data.players && rep.data.players.length
      ? rep.data.players.map(p => ({ name: p.name, score: p.score }))
      : rows.map(r => ({ name: r.name, score: r.score }));
    if (players.length) {
      const win = players[0];
      title = `🏆 ${win.name} — ${num(win.score)} · MAQLAB`;
      desc = matchCard(players, rep ? rep.rounds : (rows[0] && rows[0].rounds) || players.length);
      // Only when the replay is there: the card is drawn from it, and a link
      // promising an image that 404s is worse than the static one.
      if (rep && card.available()) image = `/match/${req.params.id}/card.png`;
    }
  }
  // Shareable by link, but not something for search engines to list: the
  // page carries every name and answer from the game.
  res.setHeader('X-Robots-Tag', 'noindex');
  res.type('html').send(page(req, title, desc, image));
});
app.get('/profile', (req, res) => res.type('html').send(page(req, SITE_TITLE, SITE_DESC)));

// Discord's app verification requires both of these to be reachable links.
app.get('/terms', (_, res) => res.sendFile(path.join(ROOT, 'public', 'terms.html')));
app.get('/privacy', (_, res) => res.sendFile(path.join(ROOT, 'public', 'privacy.html')));

// Without an explicit policy, express.static sends no Cache-Control at all
// and intermediaries are free to guess — Discord's activity proxy guessed
// generously and kept serving a stale client long after a fix had shipped,
// which cost real debugging time. The page and its modules must revalidate
// every load; the vendored SDK is pinned by filename and never changes.
// The client modules, with every import stamped (see stampedModule).
app.get(['/app.js', '/js/:file'], (req, res, next) => {
  const rel = req.params.file ? `js/${req.params.file}` : 'app.js';
  if (!/^(app|js\/[\w-]+)\.js$/.test(rel) || !STAMPED.includes(rel)) return next();
  res.type('application/javascript');
  res.setHeader('Cache-Control', req.query.v === ASSET_V ? 'public, max-age=31536000, immutable' : 'no-cache');
  res.send(stampedModule(rel));
});
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders(res, filePath) {
    // Fonts never change in place: a new version gets a new file name.
    if (filePath.includes(`${path.sep}vendor${path.sep}`) || filePath.includes(`${path.sep}fonts${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // A module asked for under the current stamp is exactly these bytes until
    // the next deploy changes the stamp, so it can be kept. Everything else,
    // the page itself and any request under an old or missing stamp, is
    // checked every time, as before.
    else if (/\.(js|css)$/.test(filePath) && res.req.query.v === ASSET_V) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
// Every mode and the table size it needs, from the same TYPES and MIN_PLAYERS
// the game runs on, so the help screen cannot fall behind them.
app.get('/api/modes', (_, res) => res.json({ modes: TYPES.map(id => ({ id, min: MIN_PLAYERS[id] || 1 })) }));

app.get('/api/room/:code', (req, res) => {
  const r = rooms.get(String(req.params.code).toUpperCase());
  if (!r) return res.status(404).json({ exists: false });
  // Enough for an invite link to show who is waiting before anyone signs in.
  // Whoever has the code was given it, and the open-rooms list shows the same
  // host and count for any public room.
  const host = r.players.get(r.hostId);
  res.json({
    exists: true, phase: r.phase, players: humans(r).filter(p => p.connected).length,
    round: r.round, rounds: r.settings.rounds,
    host: host ? host.name : '', avatar: host ? host.avatar : null,
  });
});
app.get('/api/qr', async (req, res) => {
  try {
    const svg = await QRCode.toString(String(req.query.text || '').slice(0, 300), { type: 'svg', margin: 1, color: { dark: '#1d1842', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  } catch { res.status(400).end(); }
});

}
