// Every tap the page handles, by data-act name.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $app, store } from './base.js';
import { DONATE_URL, GAMES, P, buzz, confirmBox, me, openLink, sfx, showAchievements, state, t, toast, tone } from './state.js';
import { emit, join, leaveRoom, navigate, parseRoute, render, socket } from './core.js';
import { setBalloon } from './screens.js';
import { orderSeq } from './rounds-a.js';
import { flyFrom, howTo, loadLobbies, openEditor, openMenu, post, signedIn, switchLang, toggleMusic } from './extras.js';
import { openAbout, openAdmin, openLeaderboard, openProfile, openSuggest } from './people.js';

  // ================= actions =================
  export function needName() {
    if (!signedIn()) { toast(t('signInFirst'), 'err'); return false; }
    state.profile.name = state.me.name;
    store.set('profile', state.profile);
    return true;
  }
  export async function shareLink(native) {
    const url = `${location.origin}/room/${state.room.code}`;
    if (native && navigator.share) { try { await navigator.share({ title: 'MAQLAB', text: state.lang === 'ar' ? 'تعال العب معي مقلب! 😈' : 'Come play MAQLAB with me! 😈', url }); } catch {} return; }
    try { await navigator.clipboard.writeText(url); toast(t('copied'), 'ok'); } catch { toast(url); }
  }
  export let lastTyping = 0;
  export function sendTyping() { const n = Date.now(); if (n - lastTyping > 1000) { lastTyping = n; socket.emit('typing'); } }

  export const actions = {
    menu: openMenu, how: howTo, edit: openEditor, achievements: showAchievements,
    home: () => navigate('/'),
    retry: () => location.reload(),
    signin: () => {
      if (state.inDiscord) { toast(t('discordSignInBusy'), 'err'); return; }
      // Comes back to this page, so an invite link still leads into its room.
      location.href = '/api/auth/discord/start?next=' + encodeURIComponent(location.pathname);
    },
    async signout() { await post('/api/auth/logout'); state.me = null; state.isAdmin = false; state.lastKey = ''; render(); },
    profile: el => openProfile(el.dataset.uid),
    // Wrapped: actions are called with the clicked element, which would arrive
    // as the range argument and silently select the wrong board.
    leaderboard: () => openLeaderboard(),
    suggest: openSuggest,
    about: openAbout,
    admin: () => openAdmin(),
    async addbot() { sfx.tap(); const r = await emit('addBot'); if (r && r.error) toast(t('err_full'), 'err'); },
    async unbot(el) { sfx.tap(); await emit('removeBot', el.dataset.id); },
    'rooms-refresh'() { sfx.tap(); loadLobbies(); },
    'join-lobby'(el) {
      if (!needName()) return;
      sfx.send();
      history.pushState(null, '', `/room/${el.dataset.code}`);
      state.route = parseRoute();
      join(el.dataset.code);
    },
    makehost(el, e) {
      e.stopPropagation();
      const p = P(el.dataset.id); if (!p) return;
      confirmBox(t('confirmHost', { n: p.name }), () => emit('makeHost', p.id));
    },
    sound() { state.sound = !state.sound; store.set('sound', state.sound); render(); sfx.tap(); },
    music() { toggleMusic(); render(); },
    lang: switchLang,
    async create() {
      if (!needName()) return;
      sfx.send();
      const r = await emit('create', { lang: state.lang });
      if (r.code) { history.pushState(null, '', `/room/${r.code}`); state.route = parseRoute(); join(r.code); }
      else if (r && r.error) toast(t('err_' + r.error), 'err');
    },
    'join-code'() {
      if (!needName()) return;
      const code = state.draft.code.trim().toUpperCase();
      if (!/^[A-Z]{4,5}$/.test(code)) { toast(t('needCode'), 'err'); return; }
      sfx.send(); history.pushState(null, '', `/room/${code}`); state.route = parseRoute(); join(code);
    },
    enter() { if (!needName()) return; sfx.send(); join(state.route.code); },
    'copy-code'() { try { navigator.clipboard.writeText(state.room.code); toast(t('copied'), 'ok'); } catch {} },
    copy: () => shareLink(false),
    share: () => shareLink(true),
    qr() { state.showQR = !state.showQR; render(); },
    set(el) { const k = el.dataset.k; let v = el.dataset.v; if (k === 'rounds') v = +v; sfx.tap(); emit('settings', { [k]: v }); },
    type(el) { sfx.tap(); emit('settings', { toggleType: el.dataset.k }); },
    kick(el, e) { e.stopPropagation(); const p = P(el.dataset.id); if (p) confirmBox(t('confirmKick', { n: p.name }), () => emit('kick', p.id)); },
    poke(el, e) { if (e.target.closest('[data-act="kick"]')) return actions.kick(e.target.closest('[data-act="kick"]'), e); socket.emit('poke', el.dataset.id); buzz(15); },
    start() { sfx.send(); buzz(30); emit('start'); },
    teams(el) { sfx.tap(); emit('settings', { teams: el.dataset.v === 'true' }); },
    public(el) { sfx.tap(); emit('settings', { public: el.dataset.v === 'true' }); },
    team(el) { sfx.join(); socket.emit('team', el.dataset.t); },
    ready() { const r = !(me() && me().ready); if (r) { sfx.win(); buzz([20, 30]); } else sfx.tap(); socket.emit('ready'); },
    pump() {
      socket.emit('pump');
      const size = (state.room.balloon.size || 0) + 1;
      setBalloon(size, true); tone(260 + size * 16, 0.07, 'sine', 0.05); buzz(8);
    },
    laugh(el) {
      if (el.classList.contains('on')) return;
      $app.querySelectorAll('.laugh.on').forEach(b => b.classList.remove('on'));
      el.classList.add('on');
      socket.emit('laugh', el.dataset.id);
      tone(880, 0.08, 'triangle', 0.05); tone(1100, 0.1, 'triangle', 0.05, 0.08); buzz(15);
    },
    bet(el) { state.bet = +el.dataset.b; if (state.bet === 3) { sfx.boing(); buzz(40); } else sfx.tap(); render(); },
    async vote(el) { sfx.send(); buzz(20); await emit('vote', { id: el.dataset.id, bet: state.bet }); },
    async tf(el) { sfx.send(); buzz(20); await emit('blitz', el.dataset.v === '1'); },
    async emoji(el) { sfx.send(); buzz(20); await emit('emoji', el.dataset.id); },
    async odd(el) { sfx.send(); buzz(20); await emit('odd', el.dataset.id); },
    async many(el) { sfx.send(); buzz(20); await emit('many', el.dataset.v === '1'); },
    async minor(el) { sfx.send(); buzz(20); await emit('minor', el.dataset.v); },
    async higher(el) { sfx.send(); buzz(20); await emit('higher', el.dataset.v); },
    async miss(el) { sfx.send(); buzz(20); await emit('miss', el.dataset.id); },
    // Fills the box and hands it back. Sending it would make the round the
    // game's answer rather than the player's, and a player who edits one word
    // has written a lie.
    donate() { buzz(10); openLink(DONATE_URL); },
    game(el) { const g = GAMES[Number(el.dataset.i)]; if (g) { sfx.tap(); buzz(10); openLink(g.url); } },
    async stuck() {
      buzz(10);
      const r = await emit('stuck');   // emit() reports the error itself
      if (!r.ok) return;
      state.draft.lie = r.text;
      state.draft.stuck = true;
      render();
      const el = document.getElementById('lie');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    },
    // Puts the opening words in the first empty line. The blank page is the
    // problem here, not the writing — nothing about you can be suggested.
    twostart(el) {
      buzz(10);
      const i = state.draft.two.findIndex(x => !x.trim());
      if (i < 0) return;
      state.draft.two[i] = el.dataset.s + ' ';
      render();
      const box = document.getElementById('two' + i);
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    },
    twolie(el) { state.draft.twoLie = Number(el.dataset.i); buzz(10); render(); },
    async unaskq(el) { buzz(10); await emit('unaskQ', Number(el.dataset.i)); },
    async twoguess(el) { sfx.send(); buzz(20); await emit('twoGuess', Number(el.dataset.i)); },
    async manyguess(el) { sfx.send(); buzz(20); await emit('manyGuess', Number(el.dataset.n)); },
    ordpick(el) {
      const id = el.dataset.id, cur = state.draft.order;
      // Tapping something already placed takes it out and closes the gap.
      state.draft.order = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
      // Not state.lastKey = '' — that forces the whole screen to be built
      // again, entrance animations and all, which is what made picking an
      // item look like the page reloading under your finger. The render below
      // patches what changed and leaves the rest standing.
      sfx.tap(); buzz(10); render();
    },
    ordclear() { state.draft.order = []; sfx.tap(); render(); },
    async ordsend() {
      const r = await emit('order', orderSeq());
      if (r && r.error) { toast(t('err_' + r.error), 'err'); return; }
      sfx.send(); buzz(20); state.draft.order = [];
    },
    async likely(el) { sfx.send(); buzz(20); await emit('likely', el.dataset.id); },
    async spyvote(el) { sfx.send(); buzz(20); await emit('spyVote', el.dataset.id); },
    async power(el) {
      const k = el.dataset.k;
      const r = await emit('power', k);
      if (r.ok) { sfx.power(); buzz([20, 40, 20]); toast(k === 'peek' ? t('peekDone') : t('doubleDone'), 'ok'); }
    },
    next() { sfx.tap(); emit('next'); },
    again() { emit('lobby'); },
    leave: leaveRoom,
  };

  // What this part sets running, called once by main.js in order.
  export function initActions() {

  $app.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  $app.addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target.dataset.form;
    if (f === 'lie') {
      if (!state.draft.lie.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('lie');
      const r = await emit('lie', state.draft.lie);
      if (r.ok) { flyFrom(inp); buzz(20); } else document.getElementById('lie')?.classList.add('shake');
    } else if (f === 'guess') {
      if (!state.draft.guess.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('guess');
      const r = await emit('guess', state.draft.guess);
      if (r.ok) { flyFrom(inp, '🎯'); buzz(20); }
    } else if (f === 'name') {
      if (!state.draft.nameAns.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('nameans');
      const r = await emit('name', state.draft.nameAns);
      if (r.ok) { flyFrom(inp); buzz(20); state.draft.nameAns = ''; } else document.getElementById('nameans')?.classList.add('shake');
    } else if (f === 'askq') {
      const q = state.draft.askQ.trim(), a = state.draft.askA.trim();
      if (!q || !a) return toast(t('err_empty'), 'err');
      const r = await emit('askQ', { q, a });   // emit() reports the error itself
      if (r.ok) { buzz(20); state.draft.askQ = ''; state.draft.askA = ''; render(); }
    } else if (f === 'two') {
      const lines = state.draft.two.map(x => x.trim());
      if (lines.some(x => !x)) return toast(t('twoNeedAll'), 'err');
      if (state.draft.twoLie == null) return toast(t('twoNeedLie'), 'err');
      const r = await emit('two', { lines, lie: state.draft.twoLie });
      if (r.ok) { buzz(20); state.draft.two = ['', '', '']; state.draft.twoLie = null; }
    } else if (f === 'spyClue') {
      if (!state.draft.spyClue.trim()) return toast(t('err_empty'), 'err');
      const inp = document.getElementById('spyclue');
      const r = await emit('spyClue', state.draft.spyClue);
      if (r.ok) { flyFrom(inp); buzz(20); } else document.getElementById('spyclue')?.classList.add('shake');
    } else if (f === 'spyGuess') {
      if (!state.draft.spyGuess.trim()) return;
      const inp = document.getElementById('spyguess');
      const r = await emit('spyGuess', state.draft.spyGuess);
      if (r.ok) { flyFrom(inp, '🕵️'); buzz(20); render(); }
    }
  });
  $app.addEventListener('input', e => {
    const id = e.target.id;
    if (id === 'code') { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); state.draft.code = e.target.value; }
    else if (id === 'lie') { state.draft.lie = e.target.value; sendTyping(); }
    else if (id === 'guess') { state.draft.guess = e.target.value; sendTyping(); }
    else if (id === 'nameans') { state.draft.nameAns = e.target.value; sendTyping(); }
    else if (id === 'askq') { state.draft.askQ = e.target.value; }
    else if (id === 'aska') { state.draft.askA = e.target.value; }
    else if (/^two[012]$/.test(id)) { state.draft.two[Number(id[3])] = e.target.value; sendTyping(); }
    else if (id === 'spyclue') { state.draft.spyClue = e.target.value; sendTyping(); }
    else if (id === 'spyguess') { state.draft.spyGuess = e.target.value; }
  });
  $app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (e.target.id === 'code') actions['join-code']();
  });

  }
