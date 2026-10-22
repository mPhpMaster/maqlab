// Shared pieces of the round screens, and the home, lobby and spin screens.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { GAMES, J, MODS, P, TYPES, announce, buzz, confetti, esc, fmt, isHost, later, levelInfo, me, myId, now, sfx, state, t, tone } from './state.js';
import { accountBar, lobbyList, previewCard, signedIn } from './extras.js';

  // ---------- shared pieces ----------
  export const menuBtn = `<button class="icon-btn" data-act="menu" aria-label="menu">☰</button>`;
  export function levelPill() {
    const L = levelInfo(state.xp);
    return `<div class="level-pill"><span class="lv">${L.level}</span><span>${t('level')}</span><span class="bar"><i style="width:${(L.into / L.need) * 100}%"></i></span></div>`;
  }
  // Two shapes, one list. `compact` is the version for the final scoreboard,
  // where the screen is already full and a whole card would be shouting.
  export function gamesCard(compact) {
    // The compact rows keep the arrow next to the name rather than out at the
    // edge. Everywhere inside a room the reaction bar floats over a 44px
    // column in the bottom corner — measured — on the same side a label at
    // the row's end would sit, and it swaps sides with the page direction. So
    // in the lobby and on the final scoreboard the mark that says this is a
    // link is kept next to the name. The home screen has no reaction bar,
    // which is why the full card there can afford to put "Open" at the edge.
    const rows = GAMES.map((g, i) => `<button class="game-row" data-act="game" data-i="${i}">
      <span class="ge">${g.e}</span>
      <span class="gt"><b>${t('game_' + g.id)}${compact ? ' ↗' : ''}</b>${compact ? '' : `<small>${t('gamed_' + g.id)}</small>`}</span>
      ${compact ? '' : `<span class="go">${t('openGame')} ↗</span>`}
    </button>`).join('');
    if (compact) return `<div class="games-strip">${rows}</div>`;
    return `<div class="games-card">
      <b>${t('moreGames')}</b>
      <p class="muted">${t('moreGamesBody')}</p>
      ${rows}
    </div>`;
  }

  export function meCard() {
    if (!signedIn()) {
      // Until the server answers we show the shape of the card, not a claim
      // about who you are.
      if (!state.meKnown) return `<div class="me-card skeleton"><div class="av"></div><div class="who-name"><i></i><i class="wide"></i></div></div>`;
      // A top-level redirect to discord.com cannot happen inside the Activity
      // iframe — Discord blocks it and the player just gets a white page. In
      // there, signing in is the Activity's own job, so we say so instead of
      // offering a button that goes nowhere.
      // While the bootstrap is still running, name the stage it is on. Once it
      // has given up, say so — a player left on "signing you in…" forever has
      // no way to tell a dead Activity from a slow one, which is exactly how
      // this looked the last time it broke. A sign-in button cannot help in
      // here (Discord blocks the top-level redirect), so the honest offer is
      // to start the Activity over.
      if (state.inDiscord && !state.discordDone) {
        return `<div class="center muted" style="font-size:14px">${t('discordSignInBusy')}${state.discordStage ? ` <b>${esc(state.discordStage)}</b>` : ''}</div>`;
      }
      if (state.inDiscord) return `<div class="col" style="gap:10px">
        <div class="center muted" style="font-size:14px">${t('discordFailed', { e: state.discordError || '—' })}</div>
        <button class="btn lilac block" data-act="retry">↻ ${t('tryAgain')}</button>
      </div>`;
      return `<div class="col" style="gap:10px">
        <div class="center muted" style="font-size:14px">${t('signInToPlay')}</div>
        <button class="btn lilac block" data-act="signin">💬 ${t('signIn')}</button>
      </div>`;
    }
    return `<div class="me-card">
      <button class="av" data-act="edit" aria-label="${t('editAvatar')}" style="border:none">${J(state.profile.avatar)}<span class="edit">✏️</span></button>
      <div class="who-name"><small>${t('signedInAs')}</small><b>${esc(state.me.name)}</b></div>
    </div>`;
  }
  export function timerRing() {
    const s = state.room;
    if (!s.deadline || !s.answering) return '<div style="width:48px"></div>';
    return `<div class="timer" data-deadline="${s.deadline}"><svg viewBox="0 0 48 48"><circle class="track" cx="24" cy="24" r="20"/><circle class="prog" cx="24" cy="24" r="20" stroke-dasharray="125.66" stroke-dashoffset="0"/></svg><span>0</span></div>`;
  }
  export function gameTop() {
    const s = state.room, m = s.current ? s.current.mod : 'normal';
    const modChip = m && m !== 'normal' ? `<span class="mod ${m}">${MODS[m]} ${t('mod_' + m)}</span>` : '';
    const mp = me();
    const rank = mp ? [...s.players].sort((a, b) => b.score - a.score).findIndex(p => p.id === mp.id) + 1 : 0;
    const scoreChip = mp ? `<div class="my-score">⭐ <b>${fmt(mp.score)}</b><span>#${fmt(rank)}</span>${mp.streak >= 2 ? `<span class="fire">🔥${mp.streak}</span>` : ''}</div>` : '';
    return `<div class="topbar">${menuBtn}<div class="mid"><div class="mid-stack"><div class="round-pill">${t('round')} ${s.round}/${s.settings.rounds}${modChip}</div>${scoreChip}</div></div>${timerRing()}</div>`;
  }
  export function leaderId() {
    const ps = state.room.players.filter(p => p.connected);
    const top = ps.reduce((a, b) => (b.score > (a ? a.score : -1) ? b : a), null);
    return top && top.score > 0 ? top.id : null;
  }
  export function whoRow(doneIds, resultMap) {
    const done = new Set(doneIds || []);
    const lead = leaderId();
    const dbl = new Set((state.room.current && state.room.current.doubled) || []);
    return `<div class="who-row">${state.room.players.filter(p => p.connected).map(p => {
      let badge = '';
      if (resultMap) { const r = resultMap[p.id]; badge = `<span class="ok" style="background:${r ? (r.correct ? 'var(--mint)' : 'var(--coral)') : 'var(--muted)'}">${r ? (r.correct ? '✓' : '✗') : '–'}</span>`; }
      else if (done.has(p.id)) badge = '<span class="ok">✓</span>';
      const on = resultMap ? (resultMap[p.id] && resultMap[p.id].correct) : done.has(p.id);
      return `<div class="mini ${on ? 'done' : 'wait'} ${p.team ? 'team-' + p.team : ''}" data-pid="${esc(p.id)}">${p.id === lead ? '<span class="lead">👑</span>' : ''}${dbl.has(p.id) ? '<span class="dbl">💎</span>' : ''}<span class="typing-b">✍️</span>${J(p.avatar)}${badge}<span class="nm">${esc(p.name)}</span></div>`;
    }).join('')}</div>`;
  }
  export function qCard(type, text, sub = '') {
    return `<div class="q-card glass"><span class="type-tag ${type}">${TYPES[type]} ${t('type_' + type)}</span><h1>${esc(text)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
  }
  export function powerBar() {
    const s = state.room, c = s.current, m = me();
    if (!m || !m.powers) return '';
    const doubled = c.doubled.includes(m.id);
    const peekable = (s.phase === 'vote' && !c.myVote) || ((s.phase === 'emoji' || s.phase === 'odd') && c.myAnswer == null);
    const peekUsedNow = c.options && c.options.some(o => o.hidden);
    return `<div class="powers">
      <button class="pw peek" data-act="power" data-k="peek" ${!m.powers.peek || !peekable || peekUsedNow ? 'disabled' : ''}><span class="e">🔍</span><b>${t('power_peek')}</b><i>×${m.powers.peek}</i></button>
      <button class="pw double ${doubled ? 'on' : ''}" data-act="power" data-k="double" ${!m.powers.double || doubled ? 'disabled' : ''}><span class="e">💎</span><b>${doubled ? t('powerOn') : t('power_double')}</b>${doubled ? '' : `<i>×${m.powers.double}</i>`}</button>
    </div>`;
  }
  // Half the fun of a reveal is 'what does that even look like'. Opens the
  // answer in an image search rather than trying to ship pictures ourselves.
  export const imgSearch = term => term
    ? `<a class="img-search" href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(term)}" target="_blank" rel="noopener noreferrer" title="${t('seeImages')}">🔍 ${t('seeImages')}</a>`
    : '';
  export const dock = inner => `<div class="dock"><div class="wrap">${inner}</div></div>`;
  // Reveal/score screens auto-advance on a server timer. Show that countdown so
  // it never looks frozen, and let the host jump ahead early.
  export function hostNext(key) {
    const dl = state.room.deadline || 0;
    const cd = dl ? `<span class="cd" data-count="${dl}"></span>` : '';
    return dock(isHost()
      ? `<button class="btn ghost block" data-act="next">${t(key || 'next')}${cd}</button>`
      : `<div class="center muted" style="font-size:13px">${t('nextIn')}${cd}</div>`);
  }

  // The host's control belongs on every screen of every mode, so it is put
  // there from one place rather than added to each view by hand. Added by
  // hand, it reached five views out of thirty: ten reveals had no way past
  // them but the clock, and no round anyone was still answering could be cut
  // short at all. A view that already docks something keeps what it has.
  //
  // Which word it uses comes from the server (room.clock), because the server
  // is what knows whether a phase is a reveal or a round in progress.
  // Joined mid-game: the screen is the room's, so they can follow it, but the
  // answer controls are switched off and a line says when they are in.
  export function asWatcher(html) {
    const m = me(), s = state.room;
    if (!html || !m || !m.watching || !s || ['lobby', 'final'].includes(s.phase)) return html;
    return html.replace('<div class="screen"', '<div class="screen watching"')
      .replace(/(<div class="screen watching"[^>]*>)/, `$1<div class="watch-banner">${t('watchingBanner')}</div>`);
  }
  export function hostControl(html) {
    const s = state.room;
    if (!html || !s || ['lobby', 'final', 'enter'].includes(s.phase)) return html;
    if (html.includes('class="dock"')) return html;
    // Mid-round, everyone but the host already has the round's own clock on
    // screen; a second countdown under it says nothing.
    if (!isHost() && s.clock !== 'next') return html;
    const at = html.lastIndexOf('</div>');
    if (at < 0) return html;
    return html.slice(0, at) + hostNext(s.clock === 'skip' ? 'skip' : 'next') + html.slice(at);
  }
  export const quickDots = (c, final) => `<div class="blitz-dots">${Array.from({ length: c.total }, (_, i) => `<i class="${i < c.idx || (final && i === c.idx) ? 'done' : i === c.idx ? 'on' : ''}"></i>`).join('')}</div>`;

  // ---------- home ----------
  export function homeView() {
    return `<div class="screen"><div class="scroll" data-scroll="home">
      <div class="home-top">${levelPill()}<div class="row">
        <button class="icon-btn" data-act="music" aria-label="${t('music')}">${state.music ? '🎵' : '<span style="opacity:.4">🎵</span>'}</button>
        <button class="icon-btn" data-act="sound" aria-label="${t('sound')}">${state.sound ? '🔊' : '🔇'}</button>
        <button class="icon-btn" data-act="lang" style="font-weight:800;font-size:14px">${state.lang === 'ar' ? 'EN' : 'ع'}</button></div></div>
      <div class="wrap">
        <div class="hero">
          <div class="mascots">${J({ s: 2, c: 4, e: 1, m: 1, h: 10 })}${J({ s: 0, c: 0, e: 2, m: 3, h: 1 })}${J({ s: 3, c: 8, e: 4, m: 7, h: 2 })}</div>
          <div class="logo">MAQLAB<small>مقلب</small></div>
          <div class="tagline">${t('tagline')}</div>
          <div class="mode-strip">${Object.keys(TYPES).map((k, i) => `<span class="chip" style="animation-delay:${i * 0.08}s">${TYPES[k]} ${t('type_' + k)}</span>`).join('')}</div>
        </div>
        <div class="glass col" style="padding:16px;margin-top:10px">
          ${meCard()}
          ${signedIn() ? `<button class="btn block" data-act="create">${t('create')}</button>
          <div class="row" style="margin-top:8px"><button class="btn sky grow" data-act="quick">⚡ ${t('quickPlay')}</button><button class="btn ghost grow" data-act="practice">🤖 ${t('practice')}</button></div>
          <div class="divider">${t('or')}</div>
          <div class="join-row">
            <input id="code" class="input code" maxlength="5" placeholder="ABCDE" value="${esc(state.draft.code)}" autocomplete="off" autocapitalize="characters" spellcheck="false">
            <button class="btn sky" data-act="join-code">${t('join')}</button>
          </div>` : ''}
        </div>
        ${accountBar()}
        ${lobbyList()}
        ${gamesCard(false)}
        <div class="links">
          <button data-act="how">❓ ${t('how')}</button>
          <button data-act="edit">🎨 ${t('editAvatar')}</button>
          <button data-act="achievements">🏅 ${t('achievements')}</button>
          <button data-act="leaderboard">🏆 ${t('leaderboard')}</button>
          <button data-act="suggest">💡 ${t('suggestBtn')}</button>
          <button data-act="about">ℹ️ ${t('about')}</button>
        </div>
      </div>
    </div></div>`;
  }

  export function enterView() {
    return `<div class="screen"><div class="topbar"><button class="icon-btn" data-act="home">${state.lang === 'ar' ? '→' : '←'}</button><div class="mid"><span class="chip">${t('room')} <b style="letter-spacing:3px;direction:ltr">${esc(state.route.code)}</b></span></div><div style="width:44px"></div></div>
      <div class="scroll"><div class="wrap">
        <div class="hero"><div class="logo sm">${t('appName')}</div><div class="tagline">${t('tagline')}</div></div>
        ${previewCard()}
        <div class="glass col" style="padding:16px;margin-top:10px">${meCard()}${signedIn() ? `<button class="btn block" data-act="enter">${t('enterRoom')} 🚪</button>` : ''}</div>
      </div></div></div>`;
  }

  // ---------- lobby ----------
  export function lobbyView() {
    const s = state.room, st = s.settings, host = isHost(), mid = myId();
    const online = s.players.filter(p => p.connected);
    const dis = host ? '' : 'disabled';
    const hq = s.hostQ || { count: 0, max: 10 };
    const seg = (key, vals, lab) => `<div class="seg">${vals.map(v => `<button class="${st[key] === v ? 'on' : ''}" data-act="set" data-k="${key}" data-v="${v}" ${dis}>${lab(v)}</button>`).join('')}</div>`;
    const players = online.map(p => `
      <div class="pcard ${p.id === mid ? 'me' : ''} ${p.bot ? 'is-bot' : ''} ${p.team ? 'team-' + p.team : ''}" data-pid="${esc(p.id)}" ${p.id !== mid && !p.bot ? `data-act="poke" data-id="${esc(p.id)}"` : ''}>
        ${p.id === s.hostId ? '<span class="crown">👑</span>' : ''}${p.bot ? '<span class="bot-tag">🤖</span>' : ''}${host && p.id !== mid ? (p.bot
          ? `<span class="kick-x" data-act="unbot" data-id="${esc(p.id)}">✕</span>`
          : `<span class="kick-x" data-act="kick" data-id="${esc(p.id)}">✕</span><span class="crown-give" data-act="makehost" data-id="${esc(p.id)}" title="${t('makeHost')}">👑</span>`) : ''}${p.ready && !p.bot ? '<span class="rdy">✅</span>' : ''}${J(p.avatar)}<span class="nm" ${p.userId ? `data-act="profile" data-uid="${esc(p.userId)}"` : ''}>${esc(p.name)}</span>
      </div>`).join('');
    const invite = online.length < 12 ? `<div class="pcard empty" data-act="copy">＋<span style="font-size:12px;font-weight:700">${t('invite')}</span></div>` : '';
    // Alone, two of the six round types cannot run at all. Starting solo fills
    // the table automatically, but the button is here for anyone who wants
    // another player without waiting for one.
    const addBot = host && online.length < 12 ? `<div class="pcard empty" data-act="addbot">🤖<span style="font-size:12px;font-weight:700">${t('addBot')}</span></div>` : '';
    return `<div class="screen">
      <div class="topbar">${menuBtn}<div class="mid"><div class="logo sm">${t('appName')}</div></div><div style="width:44px"></div></div>
      <div class="scroll" data-scroll="lobby"><div class="wrap" style="padding-bottom:20px">
        <div class="glass code-card">
          <div class="label">${t('roomCode')}</div>
          <div class="code" data-act="copy-code">${esc(s.code)}</div>
          <div class="actions">
            <button class="btn sm ghost" data-act="copy">🔗 ${t('copyLink')}</button>
            ${navigator.share ? `<button class="btn sm ghost" data-act="share">📤 ${t('share')}</button>` : ''}
            <button class="btn sm ghost" data-act="qr">▦ QR</button>
          </div>
          ${state.showQR ? `<div class="qr-box"><img alt="QR" src="/api/qr?text=${encodeURIComponent(location.origin + '/room/' + s.code)}"></div>` : ''}
        </div>
        <div class="section-title"><span>${t('players')}</span><span class="chip">${online.length}/12</span></div>
        ${st.teams ? teamColumns(online, mid) : `<div class="players">${players}${invite}${addBot}</div>`}
        ${online.filter(p => !p.bot).length > 1 ? `<div class="center muted" style="font-size:12px;margin-top:8px">${t('pokeHint')}</div>` : ''}
        ${balloonCard()}
        <div class="section-title"><span>${t('settings')}</span>${host ? '' : '<span class="chip">🔒</span>'}</div>
        <div class="glass settings">
          <div class="set-row"><div class="lbl">${t('qLang')}</div>${seg('lang', ['en', 'ar'], v => v === 'ar' ? 'العربية' : 'English')}</div>
          <div class="set-row"><div class="lbl">${t('rounds')}</div>${seg('rounds', [3, 5, 8, 12], v => v)}</div>
          <div class="set-row"><div class="lbl">${t('types')}</div><div class="types">
            ${Object.keys(TYPES).map(k => {
              // A mode this table is too small for, said on the toggle itself.
              // Without it a host could switch everything else off and start a
              // game in which not one round could be played as chosen.
              const need = (state.room.mins || {})[k] || 1;
              const short = online.length < need;
              return `<button class="type-tog ${st.types[k] ? 'on' : ''} ${short ? 'short' : ''}" data-act="type" data-k="${k}" ${dis}><span class="e">${TYPES[k]}</span>${t('type_' + k)}${short ? `<i class="need">${t('needsN', { n: fmt(need) })}</i>` : ''}</button>`;
            }).join('')}
          </div></div>
          <div class="set-row"><div class="lbl">${t('pace')}</div>${seg('pace', ['chill', 'normal', 'fast'], v => t(v))}</div>
          <div class="set-row"><div class="lbl">${t('teams')}</div><div class="seg">${[false, true].map(v => `<button class="${st.teams === v ? 'on' : ''}" data-act="teams" data-v="${v}" ${dis}>${v ? t('teamsOn') : t('teamsOff')}</button>`).join('')}</div></div>
          <div class="set-row"><div class="lbl">${t('publicRoom')}</div><div class="seg">${[true, false].map(v => `<button class="${st.public === v ? 'on' : ''}" data-act="public" data-v="${v}" ${dis}>${v ? t('roomPublic') : t('roomPrivate')}</button>`).join('')}</div></div>
        </div>
        <div class="section-title"><span>${t('myQs')}</span>${hq.count ? `<span class="chip">${t('myQsCount', { n: fmt(hq.count), m: fmt(hq.max) })}</span>` : ''}</div>
        <div class="glass settings">
          ${!host ? `<div class="muted" style="font-size:13px">${hq.count ? t('myQsQueued', { n: fmt(hq.count) }) : t('myQsNone')}</div>`
            : st.public ? `<div class="muted" style="font-size:13px">${t('myQsPrivate')}</div>`
            : `<div class="muted" style="font-size:13px;margin-bottom:10px">${t('myQsHint')}</div>
              <div class="qlist">${(hq.list || []).map((e, i) => `<div class="ansrow ${e.played ? 'no' : 'ok'}">
                <span class="nm">${esc(e.q)}</span>
                <span class="said">${e.played ? t('myQsPlayed') : esc(e.a)}</span>
                ${e.played ? '' : `<button class="qx" data-act="unaskq" data-i="${i}" aria-label="remove">✕</button>`}
              </div>`).join('') || `<div class="muted" style="font-size:13px">${t('myQsNone')}</div>`}</div>
              ${(hq.list || []).length < hq.max ? `<form data-form="askq" class="col" style="margin-top:10px">
                <input id="askq" class="input" maxlength="120" placeholder="${t('myQsQ')}" value="${esc(state.draft.askQ)}" autocomplete="off">
                <input id="aska" class="input" maxlength="60" placeholder="${t('myQsA')}" value="${esc(state.draft.askA)}" autocomplete="off">
                <button class="btn mint block" type="submit">${t('myQsAdd')}</button>
              </form>` : ''}
              <div class="muted" style="font-size:12px;margin-top:10px">${t('myQsWarn')}</div>`}
        </div>
        <div class="section-title"><span>${t('moreGames')}</span></div>
        ${gamesCard(true)}
      </div></div>
      ${dock(host
        ? `${online.length < 2 ? `<div class="center muted" style="font-size:13px;margin-bottom:8px">${t('soloHint')}</div>` : `<div class="center muted" style="font-size:13px;margin-bottom:8px">${t('readyN', { n: fmt(online.filter(p => p.ready || p.id === mid).length), m: fmt(online.length) })}</div>`}<button class="btn block pulse" data-act="start" style="min-height:60px;font-size:19px">${t('start')}</button>`
        : `<div class="row"><button class="btn ${me() && me().ready ? 'mint' : 'ghost'} grow" data-act="ready">${me() && me().ready ? t('ready') : t('notReady')}</button></div><div class="center muted" style="margin-top:8px;font-size:13px"><span class="dots">${t('waitHost')}</span></div>`)}
    </div>`;
  }

  export function teamColumns(online, mid) {
    const col = team => {
      const ps = online.filter(p => p.team === team);
      const mine = me() && me().team === team;
      return `<div class="team-col team-${team}">
        <div class="team-head"><b>${t('team_' + team)}</b><span class="chip">${fmt(ps.length)}</span></div>
        <div class="team-list">${ps.map(p => `<div class="pcard team-${team} ${p.id === mid ? 'me' : ''}" data-pid="${esc(p.id)}" ${p.id !== mid ? `data-act="poke" data-id="${esc(p.id)}"` : ''}>${p.id === state.room.hostId ? '<span class="crown">👑</span>' : ''}${p.ready ? '<span class="rdy">✅</span>' : ''}${isHost() && p.id !== mid ? `<span class="kick-x" data-act="kick" data-id="${esc(p.id)}">✕</span>` : ''}${J(p.avatar)}<span class="nm">${esc(p.name)}</span></div>`).join('')}</div>
        ${mine ? '' : `<button class="btn sm ${team === 'A' ? 'coral' : 'sky'} block" data-act="team" data-t="${team}">${t('joinTeam')} ${t('team_' + team)}</button>`}
      </div>`;
    };
    return `<div class="teams-wrap">${col('A')}<div class="vs">VS</div>${col('B')}</div>`;
  }

  export function balloonCard() {
    const b = state.room.balloon || { size: 0, pops: {} };
    const king = Object.entries(b.pops || {}).sort((a, c) => c[1] - a[1])[0];
    const kp = king && P(king[0]);
    return `<div class="section-title"><span>${t('balloonTitle')}</span></div>
      <div class="glass balloon-card">
        <button class="balloon-btn" data-act="pump" aria-label="balloon"><svg id="balloon" viewBox="0 0 100 130" style="transform:scale(${balloonScale(b.size)})">
          <defs><radialGradient id="bg1" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffc1c6"/><stop offset=".6" stop-color="#ff7a85"/><stop offset="1" stop-color="#c94f5c"/></radialGradient></defs>
          <path d="M50 118 Q46 124 52 130" stroke="#ddd" stroke-width="1.5" fill="none"/>
          <ellipse cx="50" cy="55" rx="38" ry="46" fill="url(#bg1)"/><path d="M45 100 L55 100 L50 108 Z" fill="#c94f5c"/>
          <ellipse cx="36" cy="36" rx="9" ry="14" fill="#fff" opacity=".35" transform="rotate(-25 36 36)"/>
        </svg></button>
        <div class="muted center" style="font-size:12px">${t('balloonHint')}</div>
        ${kp ? `<div class="center" style="margin-top:6px"><span class="chip">${t('balloonKing', { n: esc(kp.name), c: fmt(king[1]) })}</span></div>` : ''}
      </div>`;
  }
  export const balloonScale = size => (0.55 + Math.min(size, 45) * 0.022).toFixed(3);
  export function setBalloon(size, wobble) {
    const el = document.getElementById('balloon');
    if (!el) return;
    el.style.transform = `scale(${balloonScale(size)})`;
    if (wobble) { el.classList.remove('wob'); void el.getBoundingClientRect(); el.classList.add('wob'); }
  }
  export function teamBars() {
    const ts = state.room.teamScores;
    if (!ts) return '';
    const max = Math.max(1, ts.A, ts.B);
    return `<div class="team-bars">${['A', 'B'].map(k => `<div class="tb team-${k}"><div class="tb-top"><b>${t('team_' + k)}</b><span>${fmt(ts[k])}</span></div><div class="tb-bar"><i style="width:${(ts[k] / max) * 100}%"></i></div></div>`).join('')}</div>`;
  }

  // ---------- spin ----------
  export function spinView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}
      <div class="spin-stage">
        <div class="spin-title">${t('spinning')}</div>
        <div class="slot ${c.mod === 'golden' ? 'golden-glow' : ''}"><div class="reel" id="reel1"><div class="strip"></div></div><div class="reel" id="reel2"><div class="strip"></div></div></div>
        <div class="spin-result" id="spin-result"></div>
      </div></div>`;
  }
  export function mountSpin() {
    const c = state.room.current;
    const types = Object.keys(TYPES), mods = ['normal', 'double', 'speed', 'jackpot', 'golden'];
    const build = (el, list, target, labelFn, emojiMap, dur) => {
      const n = 16;
      const seq = Array.from({ length: n - 1 }, (_, i) => list[(i + Math.floor(Math.random() * list.length)) % list.length]).concat(target);
      const strip = el.querySelector('.strip');
      strip.innerHTML = seq.map(k => `<div class="cell"><span class="e">${emojiMap[k]}</span><span class="t">${labelFn(k)}</span></div>`).join('');
      strip.style.transform = 'translateY(0)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        strip.style.transition = `transform ${dur}ms cubic-bezier(.12,.72,.1,1)`;
        strip.style.transform = `translateY(-${(n - 1) * 150}px)`;
      }));
    };
    build(document.getElementById('reel1'), types, c.type, k => t('type_' + k), TYPES, 2300);
    build(document.getElementById('reel2'), mods, c.mod, k => t('mod_' + k), MODS, 3000);
    let dt = 45, acc = 0;
    while (acc < 2900) { later(acc, sfx.tick); dt *= 1.14; acc += dt; }
    later(2350, () => { sfx.pop(); buzz(20); });
    later(3050, () => {
      const el = document.getElementById('spin-result');
      if (!el) return;
      el.innerHTML = `<div class="land"><h2>${TYPES[c.type]} ${t('type_' + c.type)}</h2><p>${t('desc_' + c.type)}</p>
        ${c.mod !== 'normal' ? `<div class="chip" style="margin-top:10px;background:${c.mod === 'golden' ? 'linear-gradient(90deg,#ffe27a,#ffb347)' : 'var(--lemon)'};color:var(--ink)">${MODS[c.mod]} ${t('mdesc_' + c.mod)}</div>` : ''}</div>`;
      if (c.mod === 'golden') { announce(t('ann_golden')); confetti(60); } else if (c.mod !== 'normal') sfx.win(); else sfx.ding();
      buzz(40);
    });
    // 3… 2… 1… GO! while the server finishes the spin phase
    const left = Math.max(0, state.room.deadline - now());
    const start = Math.max(3500, left - 2600);
    ['3', '2', '1', state.lang === 'ar' ? 'يلا!' : 'GO!'].forEach((txt, i) => later(start + i * 650, () => countdown(txt, i === 3)));
  }
  export function countdown(txt, go) {
    document.querySelector('.countdown')?.remove();
    const el = document.createElement('div');
    el.className = `countdown ${go ? 'go' : ''}`; el.innerHTML = `<span>${txt}</span>`;
    document.body.appendChild(el); setTimeout(() => el.remove(), 700);
    if (go) { tone(784, 0.18, 'square', 0.05); tone(1175, 0.3, 'square', 0.05, 0.08); buzz(60); }
    else { tone(523, 0.12, 'square', 0.05); buzz(25); }
  }
