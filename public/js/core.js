// The socket, routing, and rendering a screen.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $app, IN_DISCORD, STR, store } from './base.js';
import { P, announce, applyDir, buzz, closeModal, confetti, esc, floater, fmt, later, myId, sfx, state, t, toast, tone, unlock } from './state.js';
import { asWatcher, enterView, homeView, hostControl, lobbyView, setBalloon, spinView } from './screens.js';
import { blitzResultView, blitzView, bluffRevealView, emojiResultView, emojiView, guessView, higherRevealView, higherView, minorPickView, minorRevealView, missRevealView, missView, numRevealView, orderResultView, orderView, voteView, writeView } from './rounds-a.js';
import { finalView, likelyRevealView, likelyVoteView, manyAskView, manyGuessView, manyRevealView, mountHooks, nameRevealView, nameWriteView, oddResultView, oddView, renderReactBar, scoresView, spyClueView, spyRevealView, spyVoteView, twoGuessView, twoResultView, twoWriteView } from './rounds-b.js';
import { bubbleOn, loadPreview, lookAll, sparks, tick } from './extras.js';
import { openMatch } from './people.js';

  // ================= socket =================
  // Inside Discord the handshake needs a bearer token that does not exist yet,
  // so the socket waits rather than connecting once anonymously and then
  // reconnecting — that second handshake was pure latency on the way in.
  export const socket = io({ transports: ['websocket', 'polling'], autoConnect: !IN_DISCORD });
  export const emit = (ev, data) => new Promise(res => socket.emit(ev, data, r => { if (r && r.error) toast(t('err_' + r.error), 'err'); res(r || {}); }));
  // A toast said "connection lost" and then vanished, which left whoever was
  // looking at a dead screen with nothing to read. On a free instance a drop
  // that lasts more than a few seconds is almost always the server having gone
  // to sleep, and waking it takes about half a minute — so say that, and keep
  // saying it until it is back.
  export const WAKING_AFTER_MS = 5000;
  export let offlineTimer = null;
  export function setOffline(down) {
    if (down && state.offlineSince) return;
    state.offlineSince = down ? Date.now() : null;
    clearInterval(offlineTimer);
    offlineTimer = null;
    if (down) {
      // Re-render once as the wording crosses from "reconnecting" to "waking".
      offlineTimer = setInterval(() => {
        if (!state.offlineSince) return clearInterval(offlineTimer);
        if (Date.now() - state.offlineSince >= WAKING_AFTER_MS) { clearInterval(offlineTimer); offlineTimer = null; drawConnection(); }
      }, 1000);
    }
    drawConnection();
  }
  export function drawConnection() {
    const el = document.getElementById('conn');
    if (!el) return;
    if (!state.offlineSince) { el.innerHTML = ''; el.classList.remove('on'); return; }
    const waking = Date.now() - state.offlineSince >= WAKING_AFTER_MS;
    el.classList.add('on');
    el.innerHTML = `<div class="conn-bar"><span class="dots">${esc(t(waking ? 'waking' : 'reconnecting'))}</span></div>`;
  }

  export function onPhase(prev, s) {
    state.phaseTotal = s.deadline ? Math.max(1000, s.deadline - s.now) : 1;
    if (s.phase === 'write') { state.draft.lie = ''; state.draft.stuck = false; }
    // The three boxes and the marked lie belong to one round only.
    if (s.phase === 'twoWrite') { state.draft.two = ['', '', '']; state.draft.twoLie = null; }
    if (s.phase === 'guess') state.draft.guess = '';
    if (s.phase === 'vote') state.bet = 1;
    if (s.phase === 'spyClue') state.draft.spyClue = '';
    if (s.phase === 'spyVote') state.draft.spyGuess = '';
    const m = s.players.find(p => p.id === myId());
    if (s.phase === 'scores' && prev && m) {
      const old = prev.players.find(p => p.id === m.id);
      if (m.streak >= 5 && (!old || old.streak < m.streak)) later(2900, () => announce(t('ann_unstoppable'), 'fire'));
      else if (m.streak >= 3 && (!old || old.streak < m.streak)) later(2900, () => announce(t('ann_combo', { n: m.streak }), 'fire'));
      else if (m.streak === 2 && (!old || old.streak < 2)) later(2900, () => toast(t('streakToast', { n: 2 }), 'ok'));
      if (m.streak >= 4) unlock('streak4');
    }
  }

  export function forget(code) { if (code) { delete state.tokens[code]; store.set('tokens', state.tokens); } }

  export async function join(code, silent) {
    if (state.joining) return;
    state.joining = true; render();
    const r = await new Promise(res => socket.emit('join', { code, token: state.tokens[code], name: state.profile.name, avatar: state.profile.avatar }, res));
    state.joining = false;
    if (!r || r.error) {
      forget(code);
      if (r && r.error) toast(t('err_' + r.error), 'err');
      if (!silent || (r && r.error === 'noroom')) { state.room = null; state.code = null; navigate('/'); }
      else render();
      return;
    }
    state.tokens[code] = r.token; store.set('tokens', state.tokens);
    state.code = code;
    render();
  }

  export function leaveRoom() {
    socket.emit('leave');
    state.room = null; state.code = null;
    navigate('/');
  }

  // ================= routing =================
  export function parseRoute() {
    const m = location.pathname.match(/^\/room\/([A-Za-z]{4,5})/);
    if (m) return { name: 'room', code: m[1].toUpperCase() };
    const g = location.pathname.match(/^\/match\/([0-9a-f-]{36})/i);
    return g ? { name: 'match', id: g[1] } : { name: 'home' };
  }
  export function navigate(path) { history.pushState(null, '', path); onRoute(); }
  export function onRoute() {
    const prev = state.route;
    state.route = parseRoute();
    closeModal();
    if (prev.name === 'room' && state.code && (state.route.name !== 'room' || state.route.code !== state.code)) {
      socket.emit('leave'); state.room = null; state.code = null;
    }
    if (state.route.name === 'room' && state.code !== state.route.code && state.tokens[state.route.code] && state.profile.name) join(state.route.code, false);
    if (state.route.name === 'room' && state.code !== state.route.code && !IN_DISCORD) loadPreview(state.route.code);
    render();
    // A shared /match/<id> link lands on the home screen with the scoreboard
    // on top of it, so closing it leaves the visitor somewhere they can play.
    if (state.route.name === 'match') openMatch(state.route.id, true);
  }

  // ================= render =================
  export const STATIC = new Set(['spin', 'bluffReveal', 'numReveal', 'blitzResult', 'emojiResult', 'oddResult', 'orderResult', 'likelyReveal', 'spyReveal', 'scores', 'final']);
  export function screenKey() {
    const r = state.route, s = state.room;
    if (r.name === 'room' && s && state.code === r.code) return `room:${s.phase}:${s.gameNo}:${s.round}:${s.current && s.current.idx != null ? s.current.idx : ''}`;
    if (r.name === 'room') return state.joining || (state.tokens[r.code] && state.profile.name) ? 'loading' : 'enter';
    // An Activity is always on its way into the channel's room, so the home
    // screen is a place the player never goes. Showing it while the handshake
    // runs is a flicker of the wrong game. If the handshake fails we fall
    // through to home, which at least has something to press.
    if (state.inDiscord && !state.discordDone) return 'loading';
    return 'home';
  }

  // Updating the screen without throwing it away.
  //
  // Every state change used to assign $app.innerHTML, which destroys every
  // element and builds it again. On a screen you are in the middle of using —
  // Line Them Up, where you tap four things in order — that is a visible flash
  // under your finger on each tap, and it happens again every time any other
  // player answers and the room broadcasts. Measured: one tap, one full
  // rebuild, plus two more within the next second and a half from other
  // people's answers.
  //
  // So when the screen is the same screen, the new markup is walked against
  // the old one and only the differences are written: attributes, text, and
  // nodes that are genuinely new. Nothing here tries to be a general diffing
  // library — the moment two nodes disagree on what they are it gives up and
  // returns false, and the caller replaces everything exactly as before. That
  // keeps the failure mode identical to today's behaviour rather than
  // inventing a new one.
  //
  // Safe because nothing holds a reference to these nodes and no listener is
  // attached to them: every handler in this app is delegated from $app.
  export function morph(from, to) {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) return false;
    if (from.nodeType === Node.TEXT_NODE || from.nodeType === Node.COMMENT_NODE) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return true;
    }
    if (from.nodeType !== Node.ELEMENT_NODE) return true;

    for (const a of [...from.attributes]) if (!to.hasAttribute(a.name)) from.removeAttribute(a.name);
    for (const a of to.attributes) if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
    // An input's live value is not in its attributes, and the player may be
    // part way through typing into it.
    if (from.tagName === 'INPUT' || from.tagName === 'TEXTAREA') {
      const want = to.getAttribute('value');
      if (want != null && from !== document.activeElement && from.value !== want) from.value = want;
      return true;
    }
    // Children used to be matched by position, on the theory that a list
    // rebuilt from the same template puts the same thing at index 3 every
    // time. It does not. Eighteen of these views insert a line when you have
    // answered -- "waiting for others", above the row of players -- and that
    // one insertion shifts every later child by one. Matched by position, the
    // row of players is then patched into the waiting line and rebuilt from
    // scratch underneath it. Measured on a tap, before this: 159 of the 181
    // elements on screen were brand new, in `higher`, `blitz`, `minor`,
    // `emoji` and `likely` alike. `order` was clean only because its child
    // list is the one that never changes shape.
    //
    // So children are matched by what they are, and a short lookahead covers
    // the insertion or the removal of a child without giving up on the ones
    // after it.
    const olds = [...from.childNodes];
    const news = [...to.childNodes];
    for (const op of alignChildren(olds.map(keyOf), news.map(keyOf))) {
      if (op.op === 'insert') {
        const anchor = olds[op.before], clone = news[op.n].cloneNode(true);
        if (anchor) from.insertBefore(clone, anchor); else from.appendChild(clone);
      } else if (op.op === 'remove') {
        from.removeChild(olds[op.o]);
      } else {
        const a = olds[op.o], b = news[op.n];
        if (!morph(a, b)) from.replaceChild(b.cloneNode(true), a);
      }
    }
    return true;
  }

  // What makes two children the same child. The tag, the id, and the first
  // class -- the one that says what the thing is, where the rest say what
  // state it is in. A button that gains "picked" is the same button; a
  // "waiting" line where the player row used to be is not the player row.
  export function keyOf(n) {
    if (n.nodeType !== Node.ELEMENT_NODE) return 't' + n.nodeType;
    const cls = (n.getAttribute('class') || '').trim().split(/\s+/)[0] || '';
    return n.nodeName + '#' + (n.id || '') + '.' + cls;
  }

  // Pure on purpose: it decides what to do from two lists of keys and touches
  // no DOM, so tests/morph.test.js can hold it to account without a browser.
  //
  // LOOK is 4 rather than 1 because the templates put whitespace between
  // elements: inserting one line inserts two nodes, the line and the newline
  // in front of it, and a lookahead of one would still rebuild everything
  // below it.
  export function alignChildren(a, b, look = 4) {
    const ops = [];
    let i = 0, j = 0;
    while (j < b.length) {
      if (i >= a.length) { ops.push({ op: 'insert', n: j, before: i }); j++; continue; }
      if (a[i] === b[j]) { ops.push({ op: 'patch', o: i, n: j }); i++; j++; continue; }
      // is the child that is here now still coming, a little further down the
      // new list? then what sits in front of it is new.
      let ahead = 0;
      for (let k = 1; k <= look && j + k < b.length; k++) if (b[j + k] === a[i]) { ahead = k; break; }
      if (ahead) { for (let k = 0; k < ahead; k++) { ops.push({ op: 'insert', n: j, before: i }); j++; } continue; }
      // or is the child the new list wants a little further down the old one?
      // then what sits in front of that is gone.
      let gone = 0;
      for (let k = 1; k <= look && i + k < a.length; k++) if (a[i + k] === b[j]) { gone = k; break; }
      if (gone) { for (let k = 0; k < gone; k++) { ops.push({ op: 'remove', o: i }); i++; } continue; }
      // neither: a different thing in the same slot, patched where it stands.
      ops.push({ op: 'patch', o: i, n: j }); i++; j++;
    }
    for (; i < a.length; i++) ops.push({ op: 'remove', o: i });
    return ops;
  }

  // Replaces the screen, or patches it if it is the same screen and the shapes
  // line up. Returns true when the DOM was left standing.
  export function paint(html, same) {
    if (!same) { $app.innerHTML = html; return false; }
    const next = document.createElement('div');
    next.innerHTML = html;
    const olds = [...$app.childNodes];
    const news = [...next.childNodes];
    for (let i = 0; i < news.length; i++) {
      const a = olds[i];
      if (!a) { $app.appendChild(news[i].cloneNode(true)); continue; }
      if (!morph(a, news[i])) $app.replaceChild(news[i].cloneNode(true), a);
    }
    for (let i = news.length; i < olds.length; i++) $app.removeChild(olds[i]);
    return true;
  }

  export function render() {
    applyDir();
    const rs = state.room;
    document.body.dataset.tint = rs && state.route.name === 'room' && rs.current && !['lobby', 'final'].includes(rs.phase) && !(rs.phase === 'spin') ? rs.current.type : '';
    const key = screenKey();
    const same = key === state.lastKey;
    const phase = state.room && state.room.phase;
    if (same && key.startsWith('room:') && STATIC.has(phase)) { renderReactBar(); return; }

    const f = document.activeElement, fid = f && f.id;
    const sel = fid && f.selectionStart != null ? [f.selectionStart, f.selectionEnd] : null;
    const scrolls = {}; $app.querySelectorAll('[data-scroll]').forEach(el => { scrolls[el.dataset.scroll] = el.scrollTop; });

    if (!same) { state.timeouts.forEach(clearTimeout); state.timeouts = []; }
    $app.classList.toggle('no-anim', same);
    const kept = paint(asWatcher(view(key)), same);
    state.lastKey = key;

    // A patched screen never lost its scroll position or its focus, so there
    // is nothing to put back — and putting it back anyway would fight with a
    // player who is scrolling right now.
    if (same && !kept) $app.querySelectorAll('[data-scroll]').forEach(el => { if (scrolls[el.dataset.scroll] != null) el.scrollTop = scrolls[el.dataset.scroll]; });
    if (fid && !kept) { const el = document.getElementById(fid); if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch {} } }
    else if (!same) { const af = $app.querySelector('[data-autofocus]'); if (af && matchMedia('(pointer:fine)').matches) af.focus(); }
    if (!same) mountHooks();
    renderReactBar();
    tick();
    requestAnimationFrame(lookAll);
  }

  export function view(key) {
    if (key === 'home') return homeView();
    if (key === 'loading') return `<div class="screen"><div class="center-msg"><div>
      ${state.inDiscord ? `<div class="logo sm" style="margin-bottom:18px">MAQLAB<small>مقلب</small></div>` : ''}
      <div class="spinner"></div><b>${t('loading')}</b>
    </div></div></div>`;
    if (key === 'enter') return enterView();
    const views = {
      lobby: lobbyView, spin: spinView, write: writeView, vote: voteView, bluffReveal: bluffRevealView, guess: guessView, numReveal: numRevealView,
      blitz: blitzView, blitzResult: blitzResultView, likelyVote: likelyVoteView, likelyReveal: likelyRevealView, emoji: emojiView, emojiResult: emojiResultView, odd: oddView, oddResult: oddResultView, order: orderView, orderResult: orderResultView,
      spyClue: spyClueView, spyVote: spyVoteView, spyReveal: spyRevealView,
      manyAsk: manyAskView, manyGuess: manyGuessView, manyReveal: manyRevealView,
      nameWrite: nameWriteView, nameReveal: nameRevealView,
      twoWrite: twoWriteView, twoGuess: twoGuessView, twoResult: twoResultView,
      minorPick: minorPickView, minorReveal: minorRevealView,
      higherPick: higherView, higherReveal: higherRevealView,
      missWatch: missView, missPick: missView, missReveal: missRevealView,
      scores: scoresView, final: finalView,
    };
    return hostControl((views[state.room.phase] || (() => ''))());
  }


  // What this part sets running, called once by main.js in order.
  export function initCore() {
  socket.on('connect', () => { setOffline(false); if (state.code && state.route.name === 'room') join(state.code, true); });
  socket.on('disconnect', () => setOffline(true));
  socket.on('connect_error', () => setOffline(true));
  socket.on('room', snap => {
    const prev = state.room;
    state.clockOffset = snap.now - Date.now();
    state.room = snap;
    // A new round starts from an empty hand. Without this an ordering left
    // unfinished when the clock ran out stayed in the draft for the next one.
    if (prev && prev.round !== snap.round) state.draft.order = [];
    const changed = !prev || prev.phase !== snap.phase || prev.round !== snap.round || (snap.current && prev.current && snap.current.idx !== prev.current.idx);
    if (changed) onPhase(prev, snap);
    else if (prev && prev.current && snap.current) {
      const added = snap.current.doubled.filter(id => !prev.current.doubled.includes(id) && id !== myId());
      added.forEach(id => { const p = P(id); if (p) { toast(t('doubledBy', { n: p.name })); sfx.power(); } });
    }
    render();
  });
  socket.on('joined', ({ id }) => { if (id !== myId()) sfx.join(); });
  socket.on('react', r => { const p = P(r.pid); bubbleOn(r.pid, r.e); floater(`<span class="e">${esc(r.e)}</span>${p ? `<span class="n">${esc(p.name)}</span>` : ''}`); if (r.pid !== myId()) tone(900 + Math.random() * 400, 0.05, 'sine', 0.03); });
  socket.on('typing', pid => {
    const el = $app.querySelector(`.mini[data-pid="${CSS.escape(pid)}"]`);
    if (!el) return;
    el.classList.add('typing');
    clearTimeout(el._tt); el._tt = setTimeout(() => el.classList.remove('typing'), 1800);
  });
  socket.on('poke', ({ from, to }) => {
    const el = $app.querySelector(`.pcard[data-pid="${CSS.escape(to)}"]`);
    if (el) { el.classList.remove('poked'); void el.offsetWidth; el.classList.add('poked'); }
    const f = P(from);
    tone(500, 0.12, 'triangle', 0.05, 0, 1.8);
    if (to === myId() && f) { toast(t('pokedYou', { n: f.name })); buzz([60, 40, 60]); sfx.boing(); }
  });
  socket.on('say', ({ pid, i }) => {
    const text = STR[state.lang].phrases[i];
    if (!text) return;
    bubbleOn(pid, text, true);
    const pl = P(pid);
    floater(`<span class="say-f">${esc(text)}</span>${pl ? `<span class="n">${esc(pl.name)}</span>` : ''}`);
    if (pid !== myId()) tone(700, 0.08, 'triangle', 0.04);
  });
  socket.on('balloon', ({ size, by }) => {
    if (state.room) state.room.balloon.size = size;
    setBalloon(size, true);
    if (by !== myId()) tone(300 + size * 14, 0.05, 'sine', 0.03);
  });
  socket.on('pop', ({ by, pops }) => {
    if (!state.room) return;
    state.room.balloon = { size: 0, pops };
    const pl = P(by);
    const el = document.getElementById('balloon');
    if (el) { const r = el.getBoundingClientRect(); sparks(r.left + r.width / 2, r.top + r.height / 2); sparks(r.left + r.width / 2, r.top + r.height / 3, '#ff7a85'); }
    tone(120, 0.3, 'sawtooth', 0.1, 0, 0.3); tone(900, 0.15, 'square', 0.05, 0.05, 0.4);
    confetti(by === myId() ? 90 : 40); buzz([60, 30, 60]);
    if (pl) toast(t('popped', { n: pl.name }), by === myId() ? 'ok' : '');
    state.lastKey = ''; render();
  });
  socket.on('laughs', counts => {
    if (!state.room || !state.room.current) return;
    state.room.current.laughs = counts;
    $app.querySelectorAll('.laugh[data-id]').forEach(b => { b.querySelector('b').textContent = fmt(counts[b.dataset.id] || 0); });
    tone(1000 + Math.random() * 300, 0.05, 'triangle', 0.03);
  });
  socket.on('achievements', ids => ids.forEach((id, i) => later(1400 + i * 1200, () => {
    const found = (state.achList || []).find(a => a.id === id);
    const el = document.createElement('div');
    el.className = 'ach-pop';
    el.innerHTML = `<span class="e">${found ? found.e : '🏅'}</span><div><small>${t('achUnlocked')}</small><b>${esc(t('ach_' + id))}</b></div>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 3600);
    sfx.ach(); buzz([30, 30, 30]); confetti(40);
  })));
  socket.on('kicked', () => { forget(state.code); state.room = null; state.code = null; toast(t('kicked'), 'err'); navigate('/'); });
  window.addEventListener('popstate', onRoute);
  }
