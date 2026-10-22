// Game state, sound and music, small UI helpers, achievements.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $floaters, $modal, $toasts, IN_DISCORD, STR, store } from './base.js';
import { api, signedIn } from './extras.js';

  // ================= state =================
  export const state = {
    // English is the base language of the game; Arabic is the addition. New
    // visitors start in English whatever their browser says, and the ع button
    // in the top bar switches — the choice is then remembered.
    lang: store.get('uiLang', 'en'),
    profile: store.get('profile', { name: '', avatar: Jelly.random() }),
    tokens: store.get('tokens', {}),
    xp: store.get('xp', 0),
    recorded: store.get('recorded', []),
    sound: store.get('sound', true),
    music: store.get('music', true),
    ach: store.get('ach', { unlocked: [], games: 0, wins: 0, fooled: 0, fastest: 0 }),
    route: { name: 'home' },
    room: null, code: null, joining: false,
    draft: { name: '', code: '', lie: '', guess: '', spyClue: '', spyGuess: '', order: [], nameAns: '', two: ['', '', ''], twoLie: null, askQ: '', askA: '', stuck: false },
    bet: 1, showQR: false, reactOpen: false,
    me: null, isAdmin: false, lobbies: null, achList: null, openLink: null,
    // meKnown stays false until /api/auth/me answers. Rendering a sign-in
    // button before that is a lie half the time, and it is what made the
    // screen flip from signed-out to signed-in a moment after every load.
    meKnown: false,
    // Set only inside the Discord Activity, where cookies are unreliable and
    // the session has to ride along as a bearer token instead.
    bearer: null, inDiscord: IN_DISCORD, discordDone: false, discordStage: '', discordError: null,
    lastKey: '', phaseTotal: 1, timeouts: [], editor: null,
    // The week is shown first: an all-time table is already decided.
    boardRange: 'week',
    // Down since when, so a blink can be told from the free instance
    // having gone to sleep. null means connected.
    offlineSince: null,
  };

  // Which form of a counted noun to use. English has two; Arabic has five,
  // and "just add an s" has no equivalent — one thing, two things (dual),
  // a few (3–10) and many (11+) each take a different form, and for one and
  // two the numeral is normally dropped altogether. So a plural string is an
  // object of forms rather than one string with {n} glued into it.
  export const PLURAL = {
    en: n => (n === 1 ? 'one' : 'other'),
    ar: n => {
      const r = n % 100;
      if (n === 1) return 'one';
      if (n === 2) return 'two';
      if (r >= 3 && r <= 10) return 'few';
      if (r >= 11 && r <= 99) return 'many';
      return 'other';
    },
  };
  // Callers pass counts already run through fmt(), which in Arabic means
  // Arabic-Indic digits and thousands separators — Number('٣') is NaN, and a
  // NaN count silently picks the wrong form everywhere. So read the number
  // back out rather than trusting it to be one.
  export const countOf = v => {
    const s = String(v ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d]/g, '');
    return s ? Number(s) : 0;
  };
  export const t = (k, v = {}) => {
    let s = (STR[state.lang][k] ?? STR.ar[k] ?? k);
    // Arrays (how-to steps, chat phrases) are picked from, not counted.
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      const form = (PLURAL[state.lang] || PLURAL.en)(countOf(v.n));
      s = s[form] ?? s.many ?? s.other ?? s.one ?? k;
    }
    if (typeof s === 'string') for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(b);
    return s;
  };
  export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  export const J = (av, cls) => Jelly.svg(av, cls);
  // Outside Discord an ordinary new tab; inside the Activity only Discord can
  // open an outbound link, and a plain one fails without saying so.
  export function openLink(url) {
    if (state.openLink) { Promise.resolve(state.openLink(url)).catch(() => {}); return; }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  export const now = () => Date.now() + (state.clockOffset || 0);
  export const myId = () => state.room && state.tokens[state.room.code];
  export const isHost = () => state.room && state.room.hostId === myId();
  export const P = id => state.room && state.room.players.find(p => p.id === id);
  export const me = () => P(myId());
  // Latin digits in both languages, always. A score is read at a glance, and
  // the same number written two ways stops being the same number.
  export const fmt = n => Number(n).toLocaleString('en-US');
  export const later = (ms, fn) => state.timeouts.push(setTimeout(fn, ms));
  export function applyDir() { document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === 'ar' ? 'rtl' : 'ltr'; document.title = 'MAQLAB | مقلب'; }

  // A donation buys nothing: no badge, no cosmetic, no advantage, nothing
  // recorded against the account. That is deliberate and it is the line that
  // keeps this allowed — Discord requires anything a player *buys* to go
  // through its own checkout, and the moment a donation unlocks something it
  // becomes a paid feature sold outside it.
  export const DONATE_URL = 'https://paypal.me/mfsafadi';

  // The other two games, linked from the home screen and from the final
  // scoreboard. They go through openLink for the same reason the donate button
  // does: inside the Discord Activity the page is in an iframe on a
  // discordsays.com proxy origin, where a plain <a target="_blank"> goes
  // nowhere. The markup carries an index, not a URL, so the address a tap
  // opens is only ever one of these two.
  export const GAMES = [
    { id: 'gtl', e: '🌍', url: 'https://guess-the-language-chi.vercel.app' },
    { id: 'letterup', e: '🔤', url: 'https://letterup-two.vercel.app' },
  ];

  export const TYPES = { bluff: '🤥', number: '🎯', blitz: '⚡', likely: '👥', emoji: '🔤', odd: '🧩', order: '📊', spy: '🕵️', many: '🙋', name: '🗣️', two: '🎭', minor: '🧭', higher: '⚖️', missing: '👁️' };
  export const MODS = { normal: '✨', double: '💎', speed: '⏱️', jackpot: '🎁', golden: '👑' };
  export const AWARD_E = { liar: '🤥', detective: '🕵️', sniper: '🎯', lightning: '⚡', gambler: '🎲', fire: '🔥', star: '🌟' };
  // hats that unlock with level (index -> level)
  export const HAT_LOCK = { 7: 2, 8: 3, 9: 4, 11: 5, 1: 6 };

  export function levelInfo(xp) {
    let level = 1, need = 500;
    while (xp >= need) { xp -= need; level++; need += 250; }
    return { level, into: xp, need };
  }
  export const myLevel = () => levelInfo(state.xp).level;
  export const hatLocked = h => HAT_LOCK[h] && myLevel() < HAT_LOCK[h];

  // ================= sound, music & haptics =================
  export let actx = null;
  export function ctx() {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {}
    return actx;
  }
  export function tone(freq, dur = 0.1, type = 'sine', vol = 0.06, delay = 0, slide = 0, force) {
    if (!state.sound && !force) return;
    const a = ctx(); if (!a) return;
    try {
      const t0 = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    } catch {}
  }
  export const sfx = {
    tap: () => tone(620, 0.06, 'triangle', 0.05),
    pop: () => tone(420, 0.12, 'sine', 0.08, 0, 2.2),
    send: () => { tone(520, 0.08, 'triangle', 0.06); tone(780, 0.12, 'triangle', 0.06, 0.07); },
    tick: () => tone(1500, 0.025, 'square', 0.025),
    ding: () => { tone(988, 0.3, 'sine', 0.07); tone(1318, 0.45, 'sine', 0.05, 0.08); },
    whoosh: () => tone(300, 0.25, 'sawtooth', 0.025, 0, 3),
    boing: () => tone(180, 0.35, 'triangle', 0.08, 0, 2.6),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.07, i * 0.08)),
    fail: () => { tone(300, 0.2, 'sawtooth', 0.04, 0, 0.6); tone(200, 0.3, 'sawtooth', 0.04, 0.15, 0.6); },
    coin: () => { tone(1320, 0.05, 'square', 0.03); tone(1760, 0.08, 'square', 0.03, 0.05); },
    fanfare: () => [523, 659, 784, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.2, 'triangle', 0.07, i * 0.11)),
    low: () => tone(880, 0.05, 'sine', 0.05),
    join: () => { tone(660, 0.08, 'sine', 0.06); tone(990, 0.12, 'sine', 0.06, 0.08); },
    power: () => { tone(400, 0.3, 'sine', 0.06, 0, 3); tone(1200, 0.2, 'triangle', 0.04, 0.2); },
    drum: () => { for (let i = 0; i < 14; i++) tone(90 + (i % 2) * 20, 0.06, 'triangle', 0.06, i * 0.07); },
    ach: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.06, i * 0.1)),
  };
  export const buzz = p => { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p); } catch {} };

  // tiny generative background loop: soft bass + plucked arpeggio (Am–F–C–G)
  export const PROG = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
  export const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  export let musicStep = 0, musicTimer = null;
  export function musicTick() {
    if (!state.music || document.hidden) return;
    const bar = Math.floor(musicStep / 8) % 4, s = musicStep % 8, ch = PROG[bar];
    if (s === 0) tone(ch[0] / 2, 0.9, 'sine', 0.03, 0, 0, true);
    if (s !== 3 && s !== 7) tone(ch[ARP[s]] * 2, 0.22, 'triangle', 0.012, 0, 0, true);
    musicStep++;
  }
  export function startMusic() { if (!musicTimer) musicTimer = setInterval(musicTick, 210); }

  // ================= ui helpers =================
  export function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = msg;
    $toasts.appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
    if (kind === 'err') { sfx.fail(); buzz(80); }
  }
  export function announce(text, tone2 = 'gold') {
    const el = document.createElement('div');
    el.className = `announce ${tone2}`; el.innerHTML = `<span>${esc(text)}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
    sfx.fanfare(); buzz([40, 30, 40]);
  }
  // Where focus was before a modal opened, to give it back on close.
  let modalReturn = null;
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])';
  export function modal(html, mount) {
    if (!$modal.firstElementChild) modalReturn = document.activeElement;
    $modal.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
    const bg = $modal.firstElementChild, box = bg.firstElementChild;
    bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
    // Escape closes it, and Tab goes round inside it rather than out to the
    // page behind, which a keyboard user cannot see.
    bg.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab') return;
      const all = [...box.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (!all.length) { e.preventDefault(); return; }
      const first = all[0], last = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    const h = box.querySelector('h2, h3');
    if (h) { h.id = h.id || 'modal-title'; box.setAttribute('aria-labelledby', h.id); }
    mount && mount(box);
    (box.querySelector('[autofocus]') || box).focus({ preventScroll: true });
  }
  export const closeModal = () => {
    const had = !!$modal.firstElementChild;
    $modal.innerHTML = ''; state.editor = null;
    if (had && modalReturn && document.contains(modalReturn)) modalReturn.focus({ preventScroll: true });
    modalReturn = null;
  };
  export function confirmBox(text, cb) {
    modal(`<h3>${esc(text)}</h3><div class="row"><button class="btn coral grow" id="cf-ok">${t('yes')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
      m => { m.querySelector('#cf-ok').onclick = () => { closeModal(); cb(); }; });
  }
  export function confetti(n = 110) {
    const w = document.createElement('div'); w.className = 'confetti';
    const cols = ['#ffd65c', '#ff7a85', '#4fe0b0', '#5aaeff', '#a883ff', '#ff82c4'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
      c.style.animationDuration = 2 + Math.random() * 2.2 + 's'; c.style.animationDelay = Math.random() * 0.6 + 's';
      w.appendChild(c);
    }
    document.body.appendChild(w); setTimeout(() => w.remove(), 5200);
  }
  export function burst(g) {
    const total = g ? g.total : 0;
    const items = g ? g.items.map((it, i) => `<span class="chip" style="animation-delay:${0.25 + i * 0.12}s">${t('g_' + it.k)} <b class="${it.v < 0 ? 'neg' : ''}">${it.v > 0 ? '+' : ''}${fmt(it.v)}</b></span>`).join('') : '';
    const el = document.createElement('div'); el.className = 'burst';
    el.innerHTML = `<div class="inner"><div class="big ${total <= 0 ? 'zero' : ''}">${total > 0 ? '+' : ''}${fmt(total)}</div><div class="items">${items}</div></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2700);
    if (total > 0) { sfx.win(); buzz([30, 40, 60]); if (total >= 1000) confetti(70); } else sfx.pop();
  }
  export function floater(html) {
    const el = document.createElement('div'); el.className = 'floater';
    el.style.left = 8 + Math.random() * 80 + 'vw';
    el.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
    el.innerHTML = html;
    $floaters.appendChild(el); setTimeout(() => el.remove(), 2900);
  }

  // ================= achievements =================
  export function unlock(id) {
    if (state.ach.unlocked.includes(id)) return;
    state.ach.unlocked.push(id); store.set('ach', state.ach);
    // The emoji comes from the server's own list, which is the list that
    // decides what exists. A copy kept here held ten of the thirty and gave
    // every other unlock a generic medal.
    const e = ((state.achList || []).find(a => a.id === id) || {}).e || '🏅';
    setTimeout(() => {
      const el = document.createElement('div'); el.className = 'ach-pop';
      el.innerHTML = `<span class="e">${e}</span><div><small>${t('achUnlocked')}</small><b>${esc(t('ach_' + id))}</b></div>`;
      document.body.appendChild(el); setTimeout(() => el.remove(), 3600);
      sfx.ach(); buzz([30, 30, 30]); confetti(40);
    }, 1400);
  }
  export function bumpAch(k, n = 1) { state.ach[k] = (state.ach[k] || 0) + n; store.set('ach', state.ach); }
  export async function showAchievements() {
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    if (!state.achList) state.achList = (await api('/api/achievements')).list || [];
    let unlocked = [];
    if (signedIn()) {
      const d = await api('/api/profile/' + encodeURIComponent(state.me.id));
      unlocked = (d.profile && d.profile.achievements) || [];
    }
    const have = new Set(unlocked);
    const list = state.achList.map(({ id, e }) => {
      const ok = have.has(id);
      return `<div class="ach-row ${ok ? 'ok' : ''}"><span class="e">${ok ? e : '🔒'}</span><div class="grow"><b>${t('ach_' + id)}</b><small>${t('achd_' + id)}</small></div>${ok ? '✅' : ''}</div>`;
    }).join('');
    modal(`<h3>🏅 ${t('achievements')} (${fmt(have.size)}/${fmt(state.achList.length)})</h3>
      ${signedIn() ? '' : `<div class="center muted" style="font-size:13px;margin-bottom:10px">${t('guestNote')}</div>`}
      <div class="col" style="gap:8px;max-height:56vh;overflow-y:auto">${list}</div>
      <button class="btn block" data-close style="margin-top:14px">${t('close')}</button>`);
  }


  // What this part sets running, called once by main.js in order.
  export function initState() {
  state.draft.name = state.profile.name;
  document.addEventListener('pointerdown', () => { ctx(); startMusic(); }, { once: true });
  }
