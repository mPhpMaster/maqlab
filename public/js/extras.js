// Game feel, timers, the avatar editor, account and social calls, open rooms.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $app, STR, store } from './base.js';
import { HAT_LOCK, J, TYPES, closeModal, confirmBox, ctx, esc, fmt, hatLocked, isHost, modal, now, sfx, showAchievements, startMusic, state, t, toast, tone } from './state.js';
import { emit, join, leaveRoom, render, socket } from './core.js';
import { openAbout, openAdmin, openLeaderboard, openSuggest } from './people.js';
import { actions } from './actions.js';

  // ---------- game feel ----------
  // eyes follow the pointer
  export let eyeRaf = 0, px = innerWidth / 2, py = innerHeight / 3;
  export function lookAll() {
    eyeRaf = 0;
    const svgs = document.querySelectorAll('svg.jelly');
    for (let i = 0; i < svgs.length && i < 60; i++) {
      const s = svgs[i], r = s.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height * 0.5);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      const look = s.querySelector('.look');
      if (look) look.style.transform = `translate(${(dx / d) * 3.2 * k}px, ${(dy / d) * 2.6 * k}px)`;
    }
  }

  export function sparks(x, y, color) {
    const cols = color ? [color, '#fff'] : ['#ffd65c', '#4fe0b0', '#ff82c4', '#5aaeff', '#fff'];
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = (Math.PI * 2 * i) / 9 + Math.random() * 0.5, dist = 26 + Math.random() * 26;
      s.style.left = x + 'px'; s.style.top = y + 'px'; s.style.background = cols[i % cols.length];
      s.style.setProperty('--x', Math.cos(a) * dist + 'px'); s.style.setProperty('--y', Math.sin(a) * dist + 'px');
      document.body.appendChild(s); setTimeout(() => s.remove(), 650);
    }
  }

  // screen-edge flash for personal wins / losses
  export function flash(good) {
    const el = document.createElement('div');
    el.className = `flash ${good ? 'good' : 'bad'}`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 750);
  }
  // your answer flies away when sent
  export function flyFrom(el, emoji = '✉️') {
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const f = document.createElement('div');
    f.className = 'fly'; f.textContent = emoji;
    f.style.left = r.left + r.width / 2 + 'px'; f.style.top = r.top + r.height / 2 + 'px';
    f.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
    document.body.appendChild(f); setTimeout(() => f.remove(), 950);
    tone(600, 0.3, 'sine', 0.05, 0, 2.5);
  }
  // reaction bubble above the sender's avatar
  export function bubbleOn(pid, e, isText) {
    const host = $app.querySelector(`.mini[data-pid="${CSS.escape(pid)}"], .pcard[data-pid="${CSS.escape(pid)}"]`);
    if (!host) return;
    const b = document.createElement('span');
    b.className = isText ? 'bubble-r say' : 'bubble-r'; b.textContent = e;
    host.appendChild(b); setTimeout(() => b.remove(), isText ? 2600 : 1900);
  }

  // ---------- timers ----------
  export let lastSec = -1;
  export function tick() {
    let hurry = false;
    document.querySelectorAll('.timer[data-deadline]').forEach(el => {
      const left = Math.max(0, +el.dataset.deadline - now());
      const sec = Math.ceil(left / 1000);
      el.querySelector('span').textContent = sec;
      el.querySelector('.prog').setAttribute('stroke-dashoffset', 125.66 * (1 - left / state.phaseTotal));
      el.classList.toggle('low', sec <= 5 && sec > 0);
      if (sec <= 5 && sec > 0) hurry = true;
      if (sec <= 5 && sec > 0 && sec !== lastSec) { lastSec = sec; tone(70, 0.12, 'sine', 0.12); tone(62, 0.14, 'sine', 0.1, 0.16); }
    });
    let hv = document.getElementById('hurry');
    if (hurry && !hv) { hv = document.createElement('div'); hv.id = 'hurry'; hv.className = 'hurry'; document.body.appendChild(hv); }
    else if (!hurry && hv) hv.remove();
    document.querySelectorAll('[data-bar]').forEach(el => {
      const left = Math.max(0, +el.dataset.bar - now());
      el.style.transform = `scaleX(${left / state.phaseTotal})`;
    });
    document.querySelectorAll('[data-count]').forEach(el => {
      const left = Math.max(0, +el.dataset.count - now());
      el.textContent = ` ${Math.ceil(left / 1000)}`;
      // safety net: if the server's own timer is late, the host nudges it along
      if (left <= 0 && isHost() && !el.dataset.sent) { el.dataset.sent = '1'; emit('next'); }
    });
  }

  // ---------- avatar editor ----------
  export function openEditor() { state.editor = { av: { ...state.profile.avatar }, tab: 'c' }; drawEditor(); }
  export function drawEditor() {
    const ed = state.editor; if (!ed) return;
    const tabs = ['s', 'c', 'e', 'm', 'h'];
    const opts = Array.from({ length: Jelly.count[ed.tab] }, (_, i) => {
      const locked = ed.tab === 'h' && hatLocked(i);
      const inner = ed.tab === 'c' ? `<span class="sw" style="background:${Jelly.COLORS[i]}"></span>` : J({ ...ed.av, [ed.tab]: i });
      return `<button class="${ed.av[ed.tab] === i ? 'on' : ''} ${locked ? 'locked' : ''}" data-eo="${i}">${inner}${locked ? `<span class="lock">🔒${HAT_LOCK[i]}</span>` : ''}</button>`;
    }).join('');
    modal(`<h3>${t('editAvatar')}</h3>
      <div class="editor-preview">${J(ed.av)}</div>
      <div class="tabs">${tabs.map(k => `<button class="${ed.tab === k ? 'on' : ''}" data-et="${k}">${t('tab_' + k)}</button>`).join('')}</div>
      <div class="opts-grid">${opts}</div>
      <div class="row" style="margin-top:14px"><button class="btn ghost grow" data-er>${t('random')}</button><button class="btn mint grow" data-es>${t('save')}</button></div>`,
    m => m.addEventListener('click', e => {
      const o = e.target.closest('[data-eo]'), tb = e.target.closest('[data-et]');
      if (o) {
        const i = +o.dataset.eo;
        if (ed.tab === 'h' && hatLocked(i)) { toast(t('lockedAt', { n: HAT_LOCK[i] }), 'err'); return; }
        ed.av[ed.tab] = i; sfx.tap(); drawEditor();
      } else if (tb) { ed.tab = tb.dataset.et; sfx.tap(); drawEditor(); }
      else if (e.target.closest('[data-er]')) {
        let av; do { av = Jelly.random(); } while (hatLocked(av.h));
        ed.av = av; sfx.pop(); drawEditor();
      } else if (e.target.closest('[data-es]')) {
        state.profile.avatar = ed.av; store.set('profile', state.profile); closeModal(); sfx.send();
        if (state.room && state.code) socket.emit('join', { code: state.code, token: state.tokens[state.code], name: state.profile.name, avatar: state.profile.avatar }, () => {});
        render();
      }
    }));
  }

  export function openMenu() {
    const inGame = state.room && state.code && state.room.phase !== 'lobby' && state.room.phase !== 'final';
    modal(`<h3>${t('menu')}</h3><div class="col">
      <button class="btn ghost block" data-m="sound">${t('sound')}: ${state.sound ? t('on') + ' 🔊' : t('off') + ' 🔇'}</button>
      <button class="btn ghost block" data-m="music">${t('music')}: ${state.music ? t('on') + ' 🎵' : t('off')}</button>
      <button class="btn ghost block" data-m="lang">🌐 ${t('uiLang')}</button>
      <button class="btn ghost block" data-m="how">❓ ${t('how')}</button>
      <button class="btn ghost block" data-m="ach">🏅 ${t('achievements')}</button>
      <button class="btn ghost block" data-m="board">🏆 ${t('leaderboard')}</button>
      <button class="btn ghost block" data-m="suggest">💡 ${t('suggestBtn')}</button>
      <button class="btn ghost block" data-m="about">ℹ️ ${t('about')}</button>
      ${state.isAdmin ? `<button class="btn lilac block" data-m="admin">🛡️ ${t('adminPanel')}</button>` : ''}
      ${inGame && isHost() ? `<button class="btn lilac block" data-m="end">🏁 ${t('endGame')}</button>` : ''}
      ${state.code ? `<button class="btn coral block" data-m="leave">🚪 ${t('leave')}</button>` : ''}
    </div>`, m => m.addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const k = b.dataset.m;
      if (k === 'sound') { state.sound = !state.sound; store.set('sound', state.sound); openMenu(); }
      if (k === 'music') { toggleMusic(); openMenu(); }
      if (k === 'lang') { switchLang(); openMenu(); }
      if (k === 'how') howTo();
      if (k === 'ach') showAchievements();
      if (k === 'board') openLeaderboard();
      if (k === 'suggest') { closeModal(); openSuggest(); }
      if (k === 'about') openAbout();
      if (k === 'admin') { closeModal(); openAdmin(); }
      if (k === 'end') { closeModal(); emit('end'); }
      if (k === 'leave') { closeModal(); confirmBox(t('leave') + '?', leaveRoom); }
    }));
  }
  // The modes come from TYPES and their own name and description strings, and
  // the player minimums from the server, so a mode added later is explained
  // here without anyone remembering to. The hand-written list this replaced
  // stopped at eight of fourteen.
  export async function howTo() {
    if (!state.modeMins) {
      const r = await api('/api/modes');
      state.modeMins = Object.fromEntries((r.modes || []).map(m => [m.id, m.min]));
    }
    const modes = Object.keys(TYPES).map(k => {
      const min = state.modeMins[k] > 1 ? ` <small class="muted">(${t('howMin', { n: fmt(state.modeMins[k]) })})</small>` : '';
      return `<li>${TYPES[k]} <b>${t('type_' + k)}</b> — ${t('desc_' + k)}${min}</li>`;
    }).join('');
    modal(`<h3>${t('how')}</h3><ol>${STR[state.lang].howSteps.map(s => `<li>${s}</li>`).join('')}</ol>
      <h4>${t('howModes', { n: fmt(Object.keys(TYPES).length) })}</h4><ul class="how-modes">${modes}</ul>
      <button class="btn block" data-close>${t('close')}</button>`);
  }
  export function switchLang() { state.lang = state.lang === 'ar' ? 'en' : 'ar'; store.set('uiLang', state.lang); state.lastKey = ''; render(); }
  export function toggleMusic() { state.music = !state.music; store.set('music', state.music); if (state.music) { ctx(); startMusic(); } }

  // ================= account & social =================
  export async function api(path, opts = {}) {
    try {
      const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
      if (state.bearer) headers.authorization = `Bearer ${state.bearer}`;
      const r = await fetch(path, { ...opts, headers });
      const d = await r.json().catch(() => ({}));
      return r.ok ? d : { ...d, status: r.status };
    } catch { return { error: 'network' }; }
  }
  export const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body || {}) });

  export async function loadMe() {
    const r = await api('/api/auth/me');
    state.meKnown = true;
    state.me = r.user || null;
    state.isAdmin = !!r.isAdmin;
    // Discord is the source of truth for who you are; keep the local copy in step
    if (state.me) { state.profile.name = state.me.name; store.set('profile', state.profile); }
    if (r.banned) toast(t('youAreBanned', { r: r.banned }), 'err');
    // Pulled once, in the background: the unlock popup needs it the moment an
    // achievement lands, which is long before anyone opens the list.
    if (!state.achList) api('/api/achievements').then(d => { state.achList = d.list || []; }).catch(() => {});
  }

  // The OAuth callback sends people back to where they started with
  // ?login=ok|failed|banned. Said once, then taken off the address so a reload
  // does not say it again. Back on an invite link and signed in, the player
  // goes straight into the room: that is the tap they signed in to make.
  export function firstVisit() {
    if (state.inDiscord || !signedIn() || state.route.name !== 'home' || store.get('introSeen', false)) return;
    store.set('introSeen', true);
    modal(`<h3>${t('introTitle')}</h3><ol>${STR[state.lang].introSteps.map(s => `<li>${s}</li>`).join('')}</ol>
      <div class="row"><button class="btn grow" id="intro-go">🤖 ${t('practice')}</button><button class="btn ghost grow" data-close>${t('introLater')}</button></div>`,
    // A modal sits outside #app, where taps are not routed by data-act.
    m => { m.querySelector('#intro-go').onclick = () => { closeModal(); actions.practice(); }; });
  }

  export function afterSignIn() {
    const outcome = new URLSearchParams(location.search).get('login');
    if (!outcome) return;
    history.replaceState(null, '', location.pathname);
    if (outcome === 'ok' && signedIn()) {
      toast(t('loginOk'));
      if (state.route.name === 'room' && state.code !== state.route.code) join(state.route.code);
    } else if (outcome === 'banned') toast(t('err_banned'), 'err');
    else toast(t('loginFailed'), 'err');
  }

  export const signedIn = () => !!state.me;
  export function needAccount() {
    if (signedIn()) return true;
    toast(t('signInFirst'), 'err');
    return false;
  }
  export const apiErr = d => toast(d.error === 'slow_down' ? t('slowDown') : t('err_bad'), 'err');

  export function accountBar() {
    if (!signedIn()) return '';
    return `<div class="account">
      <button class="chip" data-act="profile" data-uid="${esc(state.me.id)}">👤 ${esc(state.me.name)}</button>
      ${state.isAdmin ? `<button class="chip" data-act="admin">🛡️</button>` : ''}
      <button class="chip" data-act="signout">${t('signOut')}</button></div>`;
  }

  // ---------- open rooms ----------
  export function lobbyList() {
    const ls = state.lobbies;
    if (ls === null) return '';
    const rows = ls.length ? ls.map(l => `
      <button class="lobby-row" data-act="join-lobby" data-code="${esc(l.code)}">
        ${l.avatar ? J(l.avatar) : ''}
        <div class="grow">
          <b>${esc(l.host || '')}</b>
          <small>${t('inLobby')}</small>
        </div>
        <span class="chip">${fmt(l.players)}/12</span>
        <span class="code">${esc(l.code)}</span>
      </button>`).join('') : `<div class="center muted" style="padding:14px;font-size:13px">${t('noRooms')}</div>`;
    return `<div class="section-title"><span>🚪 ${t('openRooms')}</span><button class="chip" data-act="rooms-refresh">↻ ${t('refresh')}</button></div>
      <div class="glass lobby-list">${rows}</div>`;
  }
  // Who is behind an invite link, shown before signing in. The person who
  // opened it was asked to join a friend: the friend's name is the reason to
  // press the button, and a bare room code is not.
  export async function loadPreview(code) {
    if (state.preview && state.preview.code === code) return;
    state.preview = { code, data: null };
    const d = await api(`/api/room/${encodeURIComponent(code)}`);
    if (!state.preview || state.preview.code !== code || d.error === 'network') return;
    state.preview = { code, data: d };
    if (state.route.name === 'room' && !state.code) render();
  }
  export function previewCard() {
    const pv = state.preview && state.preview.code === state.route.code && state.preview.data;
    if (!pv) return '';
    if (!pv.exists) return `<div class="glass center muted" style="padding:14px;font-size:14px">${t('roomGone')}</div>`;
    return `<div class="glass lobby-list"><div class="lobby-row" style="cursor:default">
        ${pv.avatar ? J(pv.avatar) : ''}
        <div class="grow">
          <b>${t('crewWaiting')}</b>
          <small>${pv.phase === 'lobby' ? t('hostedBy', { h: esc(pv.host || '') }) : `${t('playing')} · ${fmt(pv.round)}/${fmt(pv.rounds)}`}</small>
        </div>
        <span class="chip">${fmt(pv.players)}/12</span>
      </div></div>`;
  }

  export async function loadLobbies() {
    const r = await api('/api/lobbies');
    const next = r.lobbies || [];
    // This polls every 15 seconds. Re-rendering unconditionally — and worse,
    // clearing lastKey so the whole screen was rebuilt from scratch with its
    // entrance animations — is what made the home screen visibly redraw
    // itself while nobody was touching it. Only a list that actually changed
    // is worth a repaint, and it is a cheap one now.
    const sig = l => l.map(x => `${x.code}:${x.players}:${x.phase || ''}`).join('|');
    const changed = state.lobbies === null || sig(next) !== sig(state.lobbies);
    state.lobbies = next;
    if (changed && state.route.name === 'home') render();
  }


  // What this part sets running, called once by main.js in order.
  export function initExtras() {
  document.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!eyeRaf) eyeRaf = requestAnimationFrame(lookAll); }, { passive: true });

  // tap a jelly → squish
  document.addEventListener('pointerdown', e => {
    px = e.clientX; py = e.clientY; if (!eyeRaf) eyeRaf = requestAnimationFrame(lookAll);
    const j = e.target.closest && e.target.closest('svg.jelly');
    if (j) { j.classList.remove('squish'); void j.getBoundingClientRect(); j.classList.add('squish'); tone(220 + Math.random() * 120, 0.18, 'sine', 0.06, 0, 2.4); setTimeout(() => j.classList.remove('squish'), 550); }
    // sparks from buttons
    const b = e.target.closest && e.target.closest('.btn, .opt, .pw, .bet, .pcard, .type-tog, .seg button, .icon-btn');
    if (b && !b.disabled) sparks(e.clientX, e.clientY, b.classList.contains('coral') ? '#ff7a85' : null);
  }, { passive: true });

  // 3D tilt on answer cards
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.opt:not(:disabled), .likely-grid .pcard:not(:disabled)');
    document.querySelectorAll('.tilted').forEach(el => { if (el !== c) { el.classList.remove('tilted'); el.style.transform = ''; } });
    if (!c || e.pointerType === 'touch') return;
    const r = c.getBoundingClientRect();
    const rx = ((e.clientY - r.top) / r.height - 0.5) * -10, ry = ((e.clientX - r.left) / r.width - 0.5) * 12;
    c.classList.add('tilted');
    c.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
  }, { passive: true });
  setInterval(tick, 100);
  }
