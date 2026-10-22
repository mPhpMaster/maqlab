// Round screens: Two Truths and a Lie, Name Something, How Many of Us, Odd One Out, Who's Most Likely, The Spy; scores, the final screen, reactions.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $app, STR, store } from './base.js';
import { AWARD_E, HAT_LOCK, J, P, TYPES, announce, bumpAch, burst, buzz, confetti, esc, fmt, isHost, later, levelInfo, myId, sfx, state, t, toast, unlock } from './state.js';
import { socket } from './core.js';
import { dock, gameTop, gamesCard, hostNext, imgSearch, menuBtn, mountSpin, powerBar, qCard, quickDots, teamBars, whoRow } from './screens.js';
import { mountBluffReveal, mountNumReveal, mountQuickResult, quickResult } from './rounds-a.js';
import { flash } from './extras.js';

  // ---------- two truths and a lie ----------
  // Three boxes and a 🤥 beside each. Marking the lie is part of writing it,
  // not a second screen: by the time you have typed the third line you have
  // already decided which one you are getting away with.
  export function twoWriteView() {
    const c = state.room.current;
    const d = state.draft;
    const rows = [0, 1, 2].map(i => `<div class="tworow">
      <button type="button" class="liepick ${d.twoLie === i ? 'on' : ''}" data-act="twolie" data-i="${i}"
        aria-label="${t('twoMark')}" aria-pressed="${d.twoLie === i}">🤥</button>
      <input id="two${i}" class="input" maxlength="60" placeholder="${t('twoPh')}"
        value="${esc(d.two[i])}" autocomplete="off" ${i === 0 ? 'data-autofocus' : ''}>
    </div>`).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag two">${TYPES.two} ${t('type_two')}</span>
        <div class="q">${t('twoTip')}</div><div class="sub">${t('twoMark')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="answer-box">${c.mine
        ? `<div class="col">${c.mine.lines.map((l, i) => `<div class="ansrow ${i === c.mine.lie ? 'no' : 'ok'}">
            <span class="nm">${esc(l)}</span>${i === c.mine.lie ? `<span class="said">${t('twoMine')}</span>` : ''}</div>`).join('')}
           <div class="center muted"><span class="dots">${t('waitOthers')}</span></div></div>`
        : `<form data-form="two" class="col">
            <div class="chips">${(t('twoStarters') || []).map(x => `<button type="button" class="chipb" data-act="twostart" data-s="${esc(x.replace(/…$/, ''))}">${esc(x)}</button>`).join('')}</div>
            ${rows}<button class="btn coral block" type="submit">${t('send')}</button></form>`}</div>
      ${whoRow(c.submitted)}
    </div></div></div></div>`;
  }

  export function twoGuessView() {
    const c = state.room.current, mid = myId();
    const author = P(c.whose);
    const mine = c.whose === mid;
    const rows = (c.lines || []).map((l, i) => `<button class="opt ${c.myPick === i ? 'picked' : ''}"
      style="animation-delay:${i * 60}ms" data-act="twoguess" data-i="${i}"
      ${mine || c.myPick != null ? 'disabled' : ''}>${mine && c.lie === i ? `<span class="tag">🤥</span>` : ''}${esc(l)}</button>`).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag two">${TYPES.two} ${t('type_two')}
          <small>${t('twoSetN', { a: fmt((c.idx || 0) + 1), b: fmt(c.total || 1) })}</small></span>
        <div class="q">${author ? `<span class="qwho">${J(author.avatar)}${esc(t('twoWhose', { n: author.name }))}</span>` : t('twoPick')}</div>
        <div class="sub">${mine ? t('twoYours') : t('twoPick')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="options">${rows}</div>
      ${whoRow(c.picked)}
    </div></div></div></div>`;
  }

  export function twoResultView() {
    const c = state.room.current, mid = myId();
    const author = P(c.whose);
    const picks = c.picks || {};
    const fooled = Object.values(picks).filter(v => v !== c.lie).length;
    const rows = (c.lines || []).map((l, i) => {
      const voters = Object.entries(picks).filter(([, v]) => v === i)
        .map(([pid]) => { const p = P(pid); return p ? `<span class="repp">${J(p.avatar)}${esc(p.name)}</span>` : ''; }).join('');
      return `<div class="ansrow ${i === c.lie ? 'no' : 'ok'} ${picks[mid] === i ? 'mineans' : ''}">
        <span class="nm">${esc(l)}</span><span class="repw">${voters}</span>
        <span class="said">${i === c.lie ? t('twoWasLie') : ''}</span></div>`;
    }).join('');
    const verdict = c.whose === mid
      ? (fooled ? t('twoFooledN', { n: fmt(fooled) }) : t('twoFooledNone'))
      : (picks[mid] === c.lie ? t('twoSpotted') : t('twoMissed'));
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag two">${TYPES.two} ${t('type_two')}</span>
        <div class="q">${author ? `<span class="qwho">${J(author.avatar)}${esc(t('twoWhose', { n: author.name }))}</span>` : ''}</div></div>
      <div class="center" style="margin-top:10px;font-weight:800">${verdict}</div>
      <div class="answers">${rows}</div>
    </div></div></div></div>`;
  }

  // ---------- name something ----------
  export function nameWriteView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag name">${TYPES.name} ${t('type_name')}</span><div class="q">${esc(c.prompt)}</div><div class="sub">${t('nameTip')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="answer-box">${c.mine
        ? `<div class="my-answer"><small>${t('yourAnswer')}</small>${esc(c.mine)}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
        : `<form data-form="name" class="col"><input id="nameans" class="input" maxlength="30" placeholder="${t('nameWritePh')}" value="${esc(state.draft.nameAns)}" autocomplete="off" data-autofocus><button class="btn coral block" type="submit">${t('send')}</button></form>`}</div>
      ${whoRow(c.submitted)}
    </div></div></div></div>`;
  }
  export function nameRevealView() {
    const c = state.room.current, mid = myId();
    const groups = c.groups || [];
    const mine = groups.find(g => g.ids.includes(mid));
    // Biggest cluster first: the shape of the answer is the story here — one
    // word four people reached for, and one nobody else did.
    const rows = groups.map((g, i) => `<div class="ansrow ${g.ids.length > 1 ? 'ok' : 'no'} ${g.ids.includes(mid) ? 'mineans' : ''}" style="animation-delay:${i * 70}ms">
      <span class="nm">${esc(g.text)}</span>
      <span class="repw">${g.ids.map(id => { const p = P(id); return p ? `<span class="repp">${J(p.avatar)}${esc(p.name)}</span>` : ''; }).join('')}</span>
      <span class="said">${g.ids.length > 1 ? '+' + fmt((g.ids.length - 1) * 200) : '0'}</span></div>`).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag name">${TYPES.name} ${t('type_name')}</span><div class="q">${esc(c.prompt)}</div></div>
      ${mine ? `<div class="center" style="margin-top:10px;font-weight:800">${mine.ids.length > 1 ? t('nameWith', { n: fmt(mine.ids.length - 1) }) : t('nameAlone')}</div>` : ''}
      <div class="answers">${rows}</div>
    </div></div></div></div>`;
  }

  // ---------- how many of us ----------
  export function manyAskView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag many">${TYPES.many} ${t('type_many')}</span><div class="q">${esc(c.prompt)}</div><div class="sub">${t('manyAsked')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="tf">
        <button class="btn mint ${a === true ? 'chosen' : ''}" data-act="many" data-v="1" ${a != null ? 'disabled' : ''}><span class="emo">🙋</span>${t('manyYes')}</button>
        <button class="btn coral ${a === false ? 'chosen' : ''}" data-act="many" data-v="0" ${a != null ? 'disabled' : ''}><span class="emo">🙅</span>${t('manyNo')}</button>
      </div>
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  export function manyGuessView() {
    const c = state.room.current, g = c.myGuess;
    // Buttons rather than a keypad: the range is the size of the room, and a
    // number you tap is a number you can pick before the clock runs out.
    const options = Array.from({ length: (c.total || 0) + 1 }, (_, n) => n);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag many">${TYPES.many} ${t('type_many')}</span><div class="q">${esc(c.prompt)}</div>
        <div class="sub">${t('manyYouSaid', { n: c.myAnswer ? t('manyYes') : t('manyNo') })}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="section-title"><span>${t('manyGuessQ')}</span></div>
      <div class="many-grid">${options.map(n => `<button class="many-n ${g === n ? 'picked' : ''}" data-act="manyguess" data-n="${n}" ${g != null ? 'disabled' : ''}>${fmt(n)}</button>`).join('')}</div>
      ${g != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.guessed)}
    </div></div></div></div>`;
  }
  export function manyRevealView() {
    const c = state.room.current, mine = c.myGuess;
    const off = mine == null ? null : Math.abs(mine - c.count);
    const yes = (c.yesIds || []).map(id => P(id)).filter(Boolean);
    const rows = state.room.players.filter(p => p.connected).map(p => {
      const g = c.guesses ? c.guesses[p.id] : null;
      const d = g == null ? null : Math.abs(g - c.count);
      return `<div class="ansrow ${d === 0 ? 'ok' : d === 1 ? '' : g == null ? 'none' : 'no'}">${J(p.avatar)}<span class="nm">${esc(p.name)}</span>
        <span class="said">${g == null ? '—' : t('manyGuessedN', { n: fmt(g) })}</span></div>`;
    }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag many">${TYPES.many} ${t('type_many')}</span><div class="q">${esc(c.prompt)}</div></div>
      <div class="center" style="font-size:34px;font-weight:900;margin-top:10px">${fmt(c.count)}</div>
      <div class="center muted" style="font-weight:700">${t('manyWere', { n: fmt(c.count) })}</div>
      <div class="who-row">${yes.length ? yes.map(p => `<div class="mini done">${J(p.avatar)}<span class="nm">${esc(p.name)}</span></div>`).join('') : `<span class="muted">${t('manyNobody')}</span>`}</div>
      ${mine != null ? `<div class="center" style="margin-top:10px;font-weight:800">${off === 0 ? t('manyExactMsg') : off === 1 ? t('manyNearMsg') : t('manyOffMsg')}</div>` : ''}
      <div class="answers"><div class="ans-title">${t('whatTheySaid')}</div>${rows}</div>
    </div></div></div></div>`;
  }

  // ---------- odd one out ----------
  export function oddView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c)}
      <div class="q-card glass"><span class="type-tag odd">${TYPES.odd} ${t('type_odd')}</span><div class="q">${t('whichOdd')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="grid4">${c.options.map((o, i) => `<button class="opt ${o.hidden ? 'gone' : ''} ${a === o.id ? 'picked' : ''}" style="animation-delay:${i * 60}ms" data-act="odd" data-id="${o.id}" ${a != null || o.hidden ? 'disabled' : ''}>${o.hidden ? '<span class="tag">🔍</span>' : ''}${esc(o.text)}</button>`).join('')}</div>
      ${powerBar()}
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  export function oddResultView() {
    const c = state.room.current;
    const right = c.options.find(o => o.id === c.correctId);
    // The reason is the payoff: without it a wrong guess just feels unfair.
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c, true)}
      <div class="q-card glass"><span class="type-tag odd">${TYPES.odd} ${t('type_odd')}</span><div class="q">${t('whichOdd')}</div></div>
      ${quickResult(c, `<div class="verdict t">${esc(right ? right.text : '')}</div><div class="why">${esc(c.why || '')}</div>${imgSearch(right ? right.text : '')}`, (r, c) => (c.options.find(o => o.id === r.id) || {}).text)}
    </div></div></div></div>`;
  }

  // ---------- who's most likely ----------
  export function likelyVoteView() {
    const c = state.room.current, v = c.myVote;
    const online = state.room.players.filter(p => p.connected);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="lk"><div class="wrap">
      ${qCard('likely', c.prompt)}
      <div class="center" style="font-weight:800;margin-top:16px">${v ? t('youPicked', { n: esc(P(v)?.name || '') }) : t('pickPlayer')}</div>
      <div class="players likely-grid">${online.map((p, i) => `
        <button class="pcard ${v === p.id ? 'me' : ''}" style="animation-delay:${i * 50}ms" data-act="likely" data-id="${esc(p.id)}" ${v ? 'disabled' : ''}>${J(p.avatar)}<span class="nm">${esc(p.name)}</span></button>`).join('')}</div>
      ${powerBar()}
      ${v ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>${whoRow(c.voted)}` : ''}
    </div></div></div></div>`;
  }
  export function likelyRevealView() {
    const c = state.room.current, mid = myId();
    const online = state.room.players.filter(p => p.connected || c.tally[p.id]);
    const max = Math.max(1, ...Object.values(c.tally));
    const rows = online.map(p => ({ p, n: c.tally[p.id] || 0 })).sort((a, b) => b.n - a.n).map((r, i) => {
      const voters = Object.entries(c.votes).filter(([, tg]) => tg === r.p.id).map(([vid]) => P(vid)).filter(Boolean);
      const win = c.winners.includes(r.p.id);
      return `<div class="lk-row ${win ? 'win' : ''}" style="animation-delay:${0.3 + i * 0.12}s">
        ${J(r.p.avatar)}<div class="grow"><div class="lk-top"><b>${esc(r.p.name)}${win ? ' 👑' : ''}</b><span>${t('votesN', { n: fmt(r.n) })}</span></div>
        <div class="lk-bar"><i data-w="${(r.n / max) * 100}"></i></div>
        <div class="lk-voters">${voters.map(v => J(v.avatar)).join('')}</div></div></div>`;
    }).join('');
    const names = c.winners.map(id => esc(P(id)?.name || '?')).join(' & ');
    const myV = c.votes[mid];
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="lr"><div class="wrap">
      ${qCard('likely', c.prompt)}
      <div class="lk-winner" id="lk-winner">${c.winners.length ? t('likelyWinner', { n: names }) : t('noVotes')}</div>
      ${myV && c.winners.includes(myV) ? `<div class="center" style="margin-top:6px"><span class="chip" style="background:rgba(79,224,176,.2)">${t('withCrowd')}</span></div>` : ''}
      <div class="lk-list">${rows}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  export function mountLikelyReveal() {
    const c = state.room.current, mid = myId();
    sfx.drum();
    later(1100, () => {
      $app.querySelectorAll('.lk-bar i').forEach(el => { el.style.width = el.dataset.w + '%'; });
      document.getElementById('lk-winner')?.classList.add('show');
      sfx.fanfare(); buzz([30, 40, 60]);
      if (c.winners.includes(mid)) { confetti(80); flash(true); unlock('famous'); }
      else if (c.winners.includes(c.votes[mid])) { sfx.coin(); flash(true); }
    });
  }

  // ---------- spy ----------
  export function spyClueView() {
    const c = state.room.current;
    // Three things a player kept having to work out for themselves: which side
    // they are on, what they are being asked to write, and what any of it is
    // worth. Each side now gets all three, in that order, above the input.
    const roleCard = c.amSpy
      ? `<div class="q-card glass spy-card spy"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span>
          <div class="spy-role">${t('youAreSpy')}</div>
          <div class="spy-cat">${t('spySpyNoWord')}</div>
          <div class="spy-cat">${t('category')}: <b>${esc(c.category)}</b></div>
          <div class="spy-task">${t('spyTaskSpy')}</div>
          <div class="spy-win">${t('spyWinSpy')}</div></div>`
      : `<div class="q-card glass spy-card"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span>
          <div class="spy-role civ">${t('youAreCivilian')}</div>
          <div class="spy-word">${esc(c.word)}</div>
          <div class="spy-cat">${t('spyOneDoesnt')}</div>
          <div class="spy-task">${t('spyTaskCivilian')}</div>
          <div class="spy-win">${t('spyWinCivilian')}</div></div>`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="sp"><div class="wrap">
      ${roleCard}
      ${whoRow(c.submitted)}
      <div class="answer-box">
        ${c.myClue
          ? `<div class="my-answer"><small>${t('yourClue')}</small>${esc(c.myClue)}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
          : `<form data-form="spyClue" class="col"><input id="spyclue" class="input" maxlength="24" placeholder="${t('writeClue')}" value="${esc(state.draft.spyClue)}" autocomplete="off" data-autofocus><div class="center muted" style="font-size:12px">${t('spyClueExample')}</div><button class="btn coral block" type="submit">${t('send')}</button></form>`}
      </div>
      ${powerBar()}
    </div></div></div></div>`;
  }

  export function spyVoteView() {
    const c = state.room.current, v = c.myVote, mid = myId();
    const online = state.room.players.filter(p => p.connected);
    const clueMap = Object.fromEntries((c.clues || []).map(o => [o.id, o.text]));
    const cluesList = online.map((p, i) => `<div class="spy-clue-row" style="animation-delay:${i * 60}ms">${J(p.avatar)}<b>${esc(p.name)}</b><span>${esc(clueMap[p.id] || '')}</span></div>`).join('');
    const roleLine = c.amSpy
      ? `${t('youAreSpy')} — ${t('spyWinSpy')}`
      : `${t('spyWordIs', { n: esc(c.word) })} — ${t('spyWinCivilian')}`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="spv"><div class="wrap">
      <div class="q-card glass spy-card"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span><div class="sub">${roleLine}</div></div>
      <div class="section-title"><span>${t('spyPickSuspect')}</span></div>
      <div class="spy-clues">${cluesList}</div>
      <div class="players likely-grid">${online.map((p, i) => `
        <button class="pcard ${v === p.id ? 'me' : ''}" style="animation-delay:${i * 50}ms" data-act="spyvote" data-id="${esc(p.id)}" ${v || p.id === mid ? 'disabled' : ''}>${J(p.avatar)}<span class="nm">${esc(p.name)}</span></button>`).join('')}</div>
      ${c.amSpy && c.myGuess == null ? `<form data-form="spyGuess" class="col" style="margin-top:14px"><input id="spyguess" class="input" maxlength="40" placeholder="${t('guessWord')}" value="${esc(state.draft.spyGuess)}" autocomplete="off"><button class="btn lilac block" type="submit">${t('spyGuessBtn')}</button></form>` : ''}
      ${c.amSpy && c.myGuess != null ? `<div class="center muted" style="margin-top:10px">${t('guessSent', { n: esc(c.myGuess) })}</div>` : ''}
      ${powerBar()}
      ${v ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>${whoRow(c.voted)}` : ''}
    </div></div></div></div>`;
  }

  export function spyRevealView() {
    const c = state.room.current;
    const spyP = P(c.spyId);
    const online = state.room.players.filter(p => p.connected || c.tally[p.id]);
    const max = Math.max(1, ...Object.values(c.tally));
    const rows = online.map(p => ({ p, n: c.tally[p.id] || 0 })).sort((a, b) => b.n - a.n).map((r, i) => {
      const voters = Object.entries(c.votes || {}).filter(([, tg]) => tg === r.p.id).map(([vid]) => P(vid)).filter(Boolean);
      const isSpy = r.p.id === c.spyId;
      return `<div class="lk-row ${isSpy ? 'spy-row' : ''}" style="animation-delay:${0.3 + i * 0.12}s">
        ${J(r.p.avatar)}<div class="grow"><div class="lk-top"><b>${esc(r.p.name)}${isSpy ? ' 🕵️' : ''}</b><span>${t('votesN', { n: fmt(r.n) })}</span></div>
        <div class="lk-bar"><i data-w="${(r.n / max) * 100}"></i></div>
        <div class="lk-voters">${voters.map(vp => J(vp.avatar)).join('')}</div></div></div>`;
    }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="spr"><div class="wrap">
      <div class="q-card glass spy-card"><span class="type-tag spy">${TYPES.spy} ${t('type_spy')}</span><div class="spy-word">${esc(c.word)}</div>${imgSearch(c.word)}</div>
      <div class="lk-winner" id="spy-reveal-line">${spyP ? t('spyWas', { n: esc(spyP.name) }) : ''}</div>
      <div class="center" style="margin-top:6px"><span class="chip" style="background:${c.caught ? 'rgba(79,224,176,.2)' : 'rgba(255,122,133,.2)'}">${c.caught ? t('spyCaught') : t('spyEscaped')}</span></div>
      <div class="center muted" style="margin-top:6px;font-size:13px">${c.caught ? t('spyWhyCaught') : t('spyWhyEscaped')}</div>
      ${c.guess ? `<div class="center muted" style="margin-top:8px">${t('spyGuessWas', { n: esc(c.guess) })} ${c.guessRight ? '✅' : '❌'}</div>` : ''}
      <div class="lk-list">${rows}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  export function mountSpyReveal() {
    const c = state.room.current, mid = myId();
    sfx.drum();
    later(1100, () => {
      $app.querySelectorAll('.lk-bar i').forEach(el => { el.style.width = el.dataset.w + '%'; });
      document.getElementById('spy-reveal-line')?.classList.add('show');
      sfx.fanfare(); buzz([30, 40, 60]);
      if (c.spyId === mid) { if (!c.caught) { confetti(80); flash(true); } else flash(false); }
      else if (c.votes[mid] === c.spyId) { sfx.coin(); flash(true); }
    });
  }

  // ---------- scores ----------
  export function scoresView() {
    const s = state.room, mid = myId();
    const ranked = [...s.players].filter(p => p.connected || p.score > 0).sort((a, b) => b.score - a.score);
    const rows = ranked.map((p, i) => {
      const g = s.gains[p.id], d = g ? g.total : 0;
      const pr = s.prevRank[p.id];
      const mv = pr == null ? '' : pr > i ? `<span class="mv up">▲${pr - i}</span>` : pr < i ? `<span class="mv down">▼${i - pr}</span>` : '<span class="mv"></span>';
      return `<div class="brow ${p.id === mid ? 'me' : ''} ${p.team ? 'team-' + p.team : ''}" data-from="${pr == null ? i : pr}" data-to="${i}" data-old="${p.score - d}" data-new="${p.score}">
        <span class="rk">${i === 0 ? '👑' : i + 1}</span>${J(p.avatar)}<span class="nm" ${p.userId ? `data-act="profile" data-uid="${esc(p.userId)}"` : ''}>${esc(p.name)}</span>${p.streak >= 2 ? `<span class="streak">🔥${p.streak}</span>` : ''}
        <span class="delta ${d < 0 ? 'neg' : ''}">${d ? (d > 0 ? '+' : '') + fmt(d) : ''}</span><span class="sc">${fmt(p.score - d)}</span>${mv}
      </div>`;
    }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="s"><div class="wrap">
      <h2 class="center" style="margin:18px 0 0;font-size:26px">🏆 ${t('scores')}</h2>
      ${teamBars()}
      <div class="board">${rows}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  export function mountScores() {
    const rows = [...$app.querySelectorAll('.brow')];
    const h = rows[0] ? rows[0].offsetHeight + 8 : 60;
    rows.forEach(r => { r.style.transform = `translateY(${(+r.dataset.from - +r.dataset.to) * h}px)`; });
    const s = state.room, mid = myId();
    burst(s.gains[mid]);
    later(1900, () => {
      rows.forEach(r => { r.classList.add('go'); r.style.transform = 'translateY(0)'; });
      const t0 = performance.now();
      const step = tnow => {
        const k = Math.min(1, (tnow - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
        rows.forEach(r => { const a = +r.dataset.old, b = +r.dataset.new; r.querySelector('.sc').textContent = fmt(Math.round(a + (b - a) * e)); });
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      for (let i = 0; i < 6; i++) later(i * 150, sfx.coin);
    });
    const myRow = rows.find(r => r.classList.contains('me'));
    if (myRow && +myRow.dataset.to === 0 && +myRow.dataset.from !== 0 && +myRow.dataset.new > 0) later(3000, () => announce(t('ann_first')));
  }

  // ---------- final ----------
  export function finalView() {
    const s = state.room, mid = myId();
    const ranked = [...s.players].filter(p => p.connected || p.score > 0).sort((a, b) => b.score - a.score);
    const pod = (p, n) => p ? `<div class="pod p${n}">${J(p.avatar)}<span class="nm" ${p.userId ? `data-act="profile" data-uid="${esc(p.userId)}"` : ''}>${esc(p.name)}</span><span class="sc">${fmt(p.score)}</span><div class="blk">${n}</div></div>` : '<div class="pod"></div>';
    const awards = (s.awards || []).map((a, i) => { const p = P(a.pid); return p ? `<div class="award"><div class="flip" style="animation-delay:${1.8 + i * 0.35}s"><div class="face"><span class="e">${AWARD_E[a.key]}</span><span class="t">${t('a_' + a.key)}</span>${J(p.avatar)}<span class="who">${esc(p.name)}</span><span class="n">${t('a_' + a.key + '_d', { n: fmt(a.value) })}</span></div></div></div>` : ''; }).join('');
    const bl = s.bestLie;
    const L = levelInfo(state.xp);
    return `<div class="screen"><div class="topbar">${menuBtn}<div class="mid"><div class="logo sm">${t('appName')}</div></div><div style="width:44px"></div></div>
      <div class="scroll" data-scroll="f"><div class="wrap" style="padding-bottom:16px">
        <h1 class="center" style="margin:6px 0 0;font-size:32px">${t('final')}</h1>
        ${ranked[0] ? `<div class="center muted" style="font-weight:700">${t('winnerIs', { n: esc(ranked[0].name) })}</div>` : ''}
        <div class="podium">${pod(ranked[1], 2)}${pod(ranked[0], 1)}${pod(ranked[2], 3)}</div>
        ${s.teamScores ? `<div class="team-result">${s.teamScores.A === s.teamScores.B ? t('teamTie') : t('teamWins', { n: t('team_' + (s.teamScores.A > s.teamScores.B ? 'A' : 'B')) })}</div>${teamBars()}` : ''}
        ${rivalsCard(s.rivals && s.rivals[mid])}
        ${bl ? `<div class="best-lie glass"><small>😈 ${t('bestLie')}</small><div class="txt">«${esc(bl.text)}»</div><div class="muted">${t('bestLieBy', { n: bl.authors.map(a => esc(P(a)?.name || '?')).join(' & '), f: fmt(bl.fooled) })}</div></div>` : ''}
        ${awards ? `<div class="section-title"><span>🏅 ${t('awards')}</span></div><div class="awards">${awards}</div>` : ''}
        <div class="glass xp-card"><div class="top"><span>${t('level')} <b id="lv">${L.level}</b></span><span class="gain" id="xpg"></span></div><div class="bar"><i id="xpbar" style="width:${(L.into / L.need) * 100}%"></i></div></div>
        <div class="board" style="margin-top:14px">${ranked.slice(3).map((p, i) => `<div class="brow ${p.id === mid ? 'me' : ''}"><span class="rk">${i + 4}</span>${J(p.avatar)}<span class="nm">${esc(p.name)}</span><span class="sc">${fmt(p.score)}</span></div>`).join('')}</div>
        ${gamesCard(true)}
        <div class="center" style="margin-top:16px">
          <button class="btn sm ghost quiet" data-act="donate">${t('supportSmall')}</button>
        </div>
      </div></div>
      ${dock(`<button class="btn sm ghost block" data-act="share-result" style="margin-bottom:8px" ${s.matchId ? '' : 'hidden'}>📤 ${t('shareResult')}</button><div class="row">${isHost() ? `<button class="btn grow" data-act="again">${t('playAgain')}</button>` : ''}<button class="btn ghost grow" data-act="leave">${t('home')}</button></div>`)}
    </div>`;
  }
  export function rivalsCard(r) {
    if (!r) return '';
    const cell = (x, title, desc) => { const p = x && P(x.id); return p ? `<div class="rival">${J(p.avatar)}<small>${title}</small><b>${esc(p.name)}</b><span>${t(desc, { n: fmt(x.n) })}</span></div>` : ''; };
    const body = cell(r.nemesis, t('nemesis'), 'nemesisD') + cell(r.victim, t('victim'), 'victimD');
    return body ? `<div class="section-title"><span>${t('rivals')}</span></div><div class="rivals">${body}</div>` : '';
  }

  export function mountFinal() {
    const s = state.room, mid = myId();
    sfx.fanfare(); confetti(140); buzz([50, 60, 50, 60, 120]);
    const key = `${s.code}:${s.gameNo}`;
    if (state.recorded.includes(key)) return;
    const mine = s.players.find(p => p.id === mid);
    if (!mine) return;
    const ranked = [...s.players].sort((a, b) => b.score - a.score);
    const won = ranked[0] && ranked[0].id === mid && mine.score > 0;
    const nAwards = (s.awards || []).filter(a => a.pid === mid).length;
    const gainXp = 50 + Math.floor(mine.score / 10) + nAwards * 100 + (won ? 200 : 0);
    const before = levelInfo(state.xp);
    state.xp += gainXp; store.set('xp', state.xp);
    state.recorded = [...state.recorded.slice(-40), key]; store.set('recorded', state.recorded);
    bumpAch('games'); if (won) bumpAch('wins');
    unlock('first_game');
    if (won) unlock('first_win');
    if (state.ach.games >= 10) unlock('games10');
    if (state.ach.wins >= 5) unlock('wins5');
    const after = levelInfo(state.xp);
    later(1200, () => {
      const g = document.getElementById('xpg'), bar = document.getElementById('xpbar'), lv = document.getElementById('lv');
      if (g) g.textContent = `+${fmt(gainXp)} XP`;
      if (after.level > before.level) {
        if (bar) bar.style.width = '100%';
        later(1700, () => {
          if (bar) { bar.style.transition = 'none'; bar.style.width = '0'; void bar.offsetWidth; bar.style.transition = ''; bar.style.width = (after.into / after.need) * 100 + '%'; }
          if (lv) lv.textContent = after.level;
          announce(t('levelUp') + ' ' + after.level); confetti(80);
          const newHats = Object.entries(HAT_LOCK).filter(([, lvl]) => lvl > before.level && lvl <= after.level);
          if (newHats.length) later(2400, () => toast(t('hatUnlocked'), 'ok'));
        });
      } else if (bar) bar.style.width = (after.into / after.need) * 100 + '%';
    });
  }

  export function mountHooks() {
    const s = state.room;
    if (!s || state.route.name !== 'room') return;
    ({ spin: mountSpin, bluffReveal: mountBluffReveal, numReveal: mountNumReveal, blitzResult: mountQuickResult, emojiResult: mountQuickResult, oddResult: mountQuickResult, likelyReveal: mountLikelyReveal, spyReveal: mountSpyReveal, scores: mountScores, final: mountFinal }[s.phase] || (() => {}))();
  }

  // ---------- reactions ----------
  export const REACTIONS = ['😂', '🔥', '😱', '👏', '🤡', '💀', '😈', '❤️'];
  export function renderReactBar() {
    let bar = document.getElementById('react-bar');
    const show = state.room && state.route.name === 'room' && state.code;
    if (!show) { bar && bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'react-bar'; bar.className = 'react-bar'; document.body.appendChild(bar); }
    const phrases = STR[state.lang].phrases;
    bar.innerHTML = (state.chatOpen ? `<div class="phrases">${phrases.map((p, i) => `<button data-say="${i}" style="animation-delay:${i * 20}ms">${esc(p)}</button>`).join('')}</div>` : '')
      + (state.reactOpen ? REACTIONS.map((e, i) => `<button class="r" data-react="${e}" style="animation-delay:${i * 25}ms">${e}</button>`).join('') : '')
      + `<button class="react-toggle" data-chat-toggle>${state.chatOpen ? '✕' : '💬'}</button><button class="react-toggle" data-react-toggle>${state.reactOpen ? '✕' : '😀'}</button>`;
  }

  // What this part sets running, called once by main.js in order.
  export function initRoundsB() {
  document.addEventListener('click', e => {
    const r = e.target.closest('[data-react]');
    if (r) { socket.emit('react', r.dataset.react); buzz(10); return; }
    const sy = e.target.closest('[data-say]');
    if (sy) { socket.emit('say', +sy.dataset.say); buzz(10); return; }
    if (e.target.closest('[data-chat-toggle]')) { state.chatOpen = !state.chatOpen; state.reactOpen = false; sfx.tap(); renderReactBar(); return; }
    if (e.target.closest('[data-react-toggle]')) { state.reactOpen = !state.reactOpen; state.chatOpen = false; sfx.tap(); renderReactBar(); }
  });

  }
