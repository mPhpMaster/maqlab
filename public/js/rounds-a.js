// Round screens: The Bluff, Closest Number, True or False, Emoji Decode, Line Them Up, Which is Bigger, What Went Missing, The Minority.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $app } from './base.js';
import { J, P, TYPES, announce, bumpAch, buzz, confetti, esc, fmt, later, myId, sfx, state, t, toast, unlock } from './state.js';
import { gameTop, hostNext, imgSearch, powerBar, qCard, quickDots, whoRow } from './screens.js';
import { flash } from './extras.js';

  // ---------- bluff ----------
  export function writeView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="w"><div class="wrap">
      ${qCard('bluff', c.question, t('lieHint'))}
      ${whoRow(c.submitted)}
      <div class="answer-box">
        ${c.myLie
          ? `<div class="my-answer"><small>${t('yourLie')}</small>${esc(c.myLie)}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
          : `<form data-form="lie" class="col"><input id="lie" class="input" maxlength="50" placeholder="${t('writeLie')}" value="${esc(state.draft.lie)}" autocomplete="off" data-autofocus><button class="btn coral block" type="submit">${t('send')}</button>
              <button type="button" class="btn ghost sm quiet" data-act="stuck">${t(state.draft.stuck ? 'stuckAgain' : 'stuck')}</button>
              ${state.draft.stuck ? `<div class="center muted" style="font-size:12px">${t('stuckHint')}</div>` : ''}</form>`}
      </div>
      ${powerBar()}
    </div></div></div></div>`;
  }

  export function voteView() {
    const c = state.room.current;
    const voted = c.myVote;
    const bets = [1, 2, 3].map(b => `<button class="bet b${b} ${(voted ? voted.bet : state.bet) === b ? 'on' : ''}" data-act="bet" data-b="${b}" ${voted ? 'disabled' : ''}><span class="coins">${'🪙'.repeat(b)}</span><b>×${b}</b><span>${t('bet' + b)}</span></button>`).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="v"><div class="wrap">
      ${qCard('bluff', c.question)}
      <div class="center" style="font-weight:800;margin-top:16px">${voted ? t('voted') : t('pickTruth')}</div>
      <div class="bets">${bets}</div>
      <div class="center muted" style="font-size:12px;margin-top:6px">${t('betInfo')}</div>
      <div class="options">${c.options.map((o, i) => `
        <button class="opt ${o.mine ? 'mine' : ''} ${o.hidden ? 'gone' : ''} ${voted && voted.id === o.id ? 'picked' : ''}" style="animation-delay:${i * 70}ms" data-act="vote" data-id="${o.id}" ${o.mine || o.hidden || voted ? 'disabled' : ''}>
          ${o.mine ? `<span class="tag">${t('yours')}</span>` : ''}${o.hidden ? '<span class="tag">🔍</span>' : ''}${voted && voted.id === o.id ? `<span class="betb">×${voted.bet}</span>` : ''}${esc(o.text)}
        </button>`).join('')}</div>
      ${powerBar()}
      ${voted ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>${whoRow(c.voted)}` : ''}
    </div></div></div></div>`;
  }

  export function bluffRevealView() {
    const c = state.room.current;
    const lies = c.options.filter(o => !o.truth).sort((a, b) => a.voters.length - b.voters.length);
    const truth = c.options.find(o => o.truth);
    const STEP = 2.4;
    const voterList = (vs, d) => vs.map((v, j) => { const p = P(v.id); return p ? `<span class="v" style="animation-delay:${d + 0.5 + j * 0.12}s">${J(p.avatar)}${v.bet > 1 ? `<span class="bb">×${v.bet}</span>` : ''}</span>` : ''; }).join('');
    const names = ids => ids.map(id => esc(P(id)?.name || '?')).join(' & ');
    const cards = lies.map((o, i) => {
      const d = i * STEP;
      const stamp = o.authors.length ? `<span class="stamp lie" style="animation-delay:${d + 1.1}s">${t('lieBy', { n: names(o.authors) })}</span>` : `<span class="stamp house" style="animation-delay:${d + 1.1}s">${t('houseLie')}</span>`;
      const gl = o.voters.length && o.authors.length ? `<div class="gainline" style="animation-delay:${d + 1.5}s">${t('fooledN', { n: fmt(o.voters.length) })} +${fmt(300 * o.voters.length)}</div>` : '';
      const canLaugh = o.authors.length && !o.authors.includes(myId());
      const laugh = canLaugh ? `<button class="laugh ${c.myLaugh === o.id ? 'on' : ''}" data-act="laugh" data-id="${o.id}" style="animation-delay:${d + 1.6}s">😂 <b>${fmt((c.laughs || {})[o.id] || 0)}</b></button>` : '';
      return `<div class="rv" style="animation-delay:${d}s">${stamp}<div class="txt">${esc(o.text)}</div><div class="voters">${voterList(o.voters, d)}</div>${gl}${laugh}</div>`;
    }).join('');
    const d = lies.length * STEP;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="r"><div class="wrap">
      ${qCard('bluff', c.question)}
      ${lies.some(o => o.authors.length) ? `<div class="center muted" style="font-size:12px;margin-top:10px">${t('laughHint')}</div>` : ''}
      <div class="rv-list">${cards}
        <div class="rv truth" style="animation-delay:${d}s"><span class="stamp" style="animation-delay:${d + 0.4}s">${t('truth')}</span><div class="txt">${esc(truth.text)}</div>${imgSearch(truth.text)}<div class="voters">${voterList(truth.voters, d)}</div>
          <div class="gainline" style="animation-delay:${d + 1}s">${truth.voters.length ? t('gotIt') : t('nobody')}</div></div>
      </div>
    </div></div></div>${hostNext()}</div>`;
  }
  export function mountBluffReveal() {
    const c = state.room.current, mid = myId();
    const lies = c.options.filter(o => !o.truth).sort((a, b) => a.voters.length - b.voters.length);
    lies.forEach((o, i) => {
      later(i * 2400, sfx.whoosh);
      later(i * 2400 + 200, () => { const els = $app.querySelectorAll('.rv'); els[i] && els[i].scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      if (o.voters.length) later(i * 2400 + 1100, () => {
        sfx.boing();
        if (o.voters.some(v => v.id === mid) && o.authors.length) { buzz(120); toast(t('gotFooledBy', { n: o.authors.map(a => P(a)?.name || '?').join(' & ') })); }
        if (o.authors.includes(mid)) { sfx.coin(); buzz([20, 30, 20]); }
      });
    });
    const myFooled = lies.filter(o => o.authors.includes(mid)).reduce((n, o) => n + o.voters.length, 0);
    if (myFooled) { bumpAch('fooled', myFooled); if (state.ach.fooled >= 5) unlock('liar5'); }
    const truth = c.options.find(o => o.truth);
    later(lies.length * 2400, () => {
      const el = $app.querySelector('.rv.truth'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      sfx.ding();
      const mine = truth.voters.find(v => v.id === mid);
      if (mine) { sfx.win(); flash(true); confetti(60); buzz([30, 40, 60]); if (mine.bet === 3) unlock('allin'); }
      else if (c.options.some(o => !o.truth && o.voters.some(v => v.id === mid))) flash(false);
      if (myFooled >= 2) later(900, () => announce(t('ann_legend'), 'pink'));
    });
  }

  // ---------- number ----------
  export function guessView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="g"><div class="wrap">
      ${qCard('number', c.question, c.unit ? `(${esc(c.unit)})` : '')}
      ${whoRow(c.submitted)}
      <div class="answer-box">
        ${c.myGuess != null
          ? `<div class="my-answer"><small>${t('yourGuess')}</small><span style="direction:ltr;display:inline-block">${fmt(c.myGuess)}</span> ${esc(c.unit || '')}</div><div class="center muted"><span class="dots">${t('waitOthers')}</span></div>`
          : `<form data-form="guess" class="col"><input id="guess" class="input num-input" inputmode="decimal" placeholder="${t('typeNumber')}" value="${esc(state.draft.guess)}" autocomplete="off" data-autofocus><button class="btn sky block" type="submit">${t('send')}</button></form>`}
      </div>
      ${powerBar()}
    </div></div></div></div>`;
  }

  export function numRevealView() {
    const c = state.room.current;
    const vals = c.results.map(r => r.g).concat(c.answer);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    const pos = v => ((v - lo) / (hi - lo)) * 100;
    const sorted = [...c.results].sort((a, b) => a.g - b.g);
    let lastPos = -99, level = 0, maxLevel = 0;
    const marks = sorted.map(r => {
      const p = P(r.pid); if (!p) return '';
      const x = pos(r.g);
      level = x - lastPos < 9 ? level + 1 : 0; lastPos = x; maxLevel = Math.max(maxLevel, level);
      return `<div class="mk" data-x="${x}" style="left:50%;top:${18 - level * 40}px">${J(p.avatar)}<span class="v">${fmt(r.g)}</span></div>`;
    }).join('');
    const label = r => r.bull ? t('g_bullseye') : r.rank === 0 ? t('g_closest') : r.rank === 1 ? t('g_second') : r.rank === 2 ? t('g_third') : '';
    const list = c.results.map((r, i) => { const p = P(r.pid); return p ? `<div class="nr ${r.bull ? 'bull' : ''}" style="animation-delay:${2.2 + i * 0.15}s">${J(p.avatar)}<b>${esc(p.name)}</b><span class="g muted">${fmt(r.g)}</span><span class="pts">${label(r)}</span></div>` : ''; }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll" data-scroll="n"><div class="wrap">
      ${qCard('number', c.question)}
      <div class="numline" style="margin-top:${40 + maxLevel * 40}px"><div class="axis"></div>${marks}
        <div class="truth-mk" style="left:${pos(c.answer)}%"><span class="flag">${fmt(c.answer)} ${esc(c.unit || '')}</span><span class="pole"></span></div></div>
      <div class="num-results">${list}</div>
    </div></div></div>${hostNext()}</div>`;
  }
  export function mountNumReveal() {
    const c = state.room.current, mid = myId();
    requestAnimationFrame(() => requestAnimationFrame(() => $app.querySelectorAll('.numline .mk').forEach(el => { el.style.left = el.dataset.x + '%'; })));
    sfx.drum();
    later(1600, () => { sfx.ding(); buzz(30); });
    const mine = c.results.find(r => r.pid === mid);
    if (mine && mine.bull) { unlock('bull'); later(2000, () => { flash(true); announce(t('bullseye')); confetti(); }); }
    else if (mine && mine.rank === 0) later(2000, () => { sfx.win(); buzz([30, 40]); });
  }

  // ---------- true / false ----------
  export function blitzView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c)}
      ${qCard('blitz', c.statement)}
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="tf">
        <button class="btn mint ${a === true ? 'chosen' : ''}" data-act="tf" data-v="1" ${a != null ? 'disabled' : ''}><span class="emo">✅</span>${t('true')}</button>
        <button class="btn coral ${a === false ? 'chosen' : ''}" data-act="tf" data-v="0" ${a != null ? 'disabled' : ''}><span class="emo">❌</span>${t('false')}</button>
      </div>
      ${powerBar()}
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  // After a result, who actually said what. A tick tells you that you were
  // wrong; seeing that three people picked the same wrong answer, and which
  // one, is the part everyone argues about afterwards.
  export function answerList(say) {
    const c = state.room.current;
    const rows = state.room.players.filter(p => p.connected).map(p => {
      const r = c.results && c.results[p.id];
      const said = r ? say(r, c) : null;
      const cls = !r ? 'none' : r.correct ? 'ok' : 'no';
      return `<div class="ansrow ${cls}">${J(p.avatar)}<span class="nm">${esc(p.name)}</span>
        <span class="said">${said ? esc(said) : '—'}</span></div>`;
    }).join('');
    return `<div class="answers"><div class="ans-title">${t('whatTheySaid')}</div>${rows}</div>`;
  }

  export function quickResult(c, header, say) {
    const mine = c.results[myId()];
    const fast = c.fastest && P(c.fastest);
    return `${header}
      <div class="center" style="font-weight:800;font-size:20px;margin-top:6px">${mine ? (mine.correct ? t('rightAns') : t('wrongAns')) : t('noAns')}</div>
      ${fast ? `<div class="center" style="margin-top:8px"><span class="chip">${t('fastestIs', { n: esc(fast.name) })}</span></div>` : ''}
      ${say ? answerList(say) : ''}
      ${whoRow(null, c.results)}`;
  }
  export function blitzResultView() {
    const c = state.room.current;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c, true)}${qCard('blitz', c.statement)}
      ${quickResult(c, `<div class="verdict ${c.truth ? 't' : 'f'}">${c.truth ? '✅ ' + t('true') : '❌ ' + t('false')}</div>`, r => (r.v ? t('true') : t('false')))}
    </div></div></div></div>`;
  }
  export function mountQuickResult() {
    const c = state.room.current, mid = myId(), mine = c.results[mid];
    if (mine && mine.correct) { sfx.win(); flash(true); buzz([25, 30, 25]); } else { sfx.fail(); flash(false); buzz(120); $app.querySelector('.verdict')?.classList.add('shake'); }
    if (c.fastest === mid) { later(300, sfx.coin); bumpAch('fastest'); if (state.ach.fastest >= 3) unlock('speedy'); }
    // perfect 3/3 in a quick round
    if (c.idx === c.total - 1 && mine && mine.correct) {
      const prevCorrect = (state.quickCorrect || 0) + 1;
      if (prevCorrect >= c.total) later(700, () => announce(t('ann_perfect'), 'mint'));
    }
    state.quickCorrect = c.idx === 0 ? (mine && mine.correct ? 1 : 0) : (state.quickCorrect || 0) + (mine && mine.correct ? 1 : 0);
  }

  // ---------- emoji decode ----------
  export function emojiView() {
    const c = state.room.current, a = c.myAnswer;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c)}
      <div class="q-card glass emoji-card"><span class="type-tag emoji">${TYPES.emoji} ${t('type_emoji')}</span><div class="big-emoji">${esc(c.emoji)}</div><div class="sub">${t('whatEmoji')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="grid4">${c.options.map((o, i) => `<button class="opt ${o.hidden ? 'gone' : ''} ${a === o.id ? 'picked' : ''}" style="animation-delay:${i * 60}ms" data-act="emoji" data-id="${o.id}" ${a != null || o.hidden ? 'disabled' : ''}>${o.hidden ? '<span class="tag">🔍</span>' : ''}${esc(o.text)}</button>`).join('')}</div>
      ${powerBar()}
      ${a != null ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.answered)}
    </div></div></div></div>`;
  }
  export function emojiResultView() {
    const c = state.room.current;
    const right = c.options.find(o => o.id === c.correctId);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${quickDots(c, true)}
      <div class="q-card glass emoji-card"><span class="type-tag emoji">${TYPES.emoji} ${t('type_emoji')}</span><div class="big-emoji">${esc(c.emoji)}</div></div>
      ${quickResult(c, `<div class="verdict t">${esc(right ? right.text : '')}</div>${imgSearch(right ? right.text : '')}`, (r, c) => (c.options.find(o => o.id === r.id) || {}).text)}
    </div></div></div></div>`;
  }

  // ---------- line them up ----------
  // Tapping, not dragging. Dragging four cards into order on a phone, against
  // a clock, with a thumb, is a worse game than the one being played — so you
  // tap them in order and tap again to take one back.
  // The one place that decides what this round's ordering is. The view used to
  // filter the draft down to the current round's items while ordsend posted
  // the draft raw, so a round that ran out of time poisoned the next one: four
  // items showed as 1-4 on screen while eight ids went to the server, and it
  // answered "invalid choice" to an order that looked perfectly valid.
  export const orderSeq = () => {
    const c = state.room && state.room.current;
    if (!c || !Array.isArray(c.items)) return [];
    return state.draft.order.filter(id => c.items.some(it => it.id === id));
  };

  export function orderView() {
    const c = state.room.current;
    const picked = orderSeq();
    const done = c.myOrder != null;
    const seq = done ? c.myOrder : picked;
    const byId = Object.fromEntries(c.items.map(it => [it.id, it]));
    const rank = id => seq.indexOf(id);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('order', c.question)}
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="order-list">${c.items.map((it, i) => {
        const at = rank(it.id);
        return `<button class="ord ${at >= 0 ? 'picked' : ''}" style="animation-delay:${i * 60}ms" data-act="ordpick" data-id="${esc(it.id)}" ${done ? 'disabled' : ''}>
          <span class="pos">${at >= 0 ? at + 1 : ''}</span><span class="nm">${esc(it.text)}</span>
        </button>`;
      }).join('')}</div>
      ${done
        ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>`
        : `<div class="row" style="margin-top:14px">
            <button class="btn sm ghost" data-act="ordclear" ${seq.length ? '' : 'disabled'}>${t('clear')}</button>
            <button class="btn mint grow" data-act="ordsend" ${seq.length === c.items.length ? '' : 'disabled'}>${seq.length === c.items.length ? t('lockIn') : t('pickAll', { n: c.items.length - seq.length })}</button>
          </div>`}
      ${whoRow(c.submitted)}
    </div></div></div></div>`;
  }

  // Everyone else's ordering, not just your own. Half the fun of this round is
  // finding out that someone put the whale last.
  export function everyOrder(c) {
    const by = Object.fromEntries(c.truth.map(it => [it.id, it.text]));
    const rows = state.room.players.filter(p => p.connected).map(p => {
      const r = c.results && c.results[p.id];
      const seq = r ? r.seq.map(id => by[id] || '?').join(' › ') : null;
      const perfect = r && r.pairs === c.truth.length - 1;
      return `<div class="ansrow ${!r ? 'none' : perfect ? 'ok' : ''}">${J(p.avatar)}<span class="nm">${esc(p.name)}</span>
        <span class="said">${seq ? esc(seq) : '—'}${r ? ` <b>${t('pairsRight', { n: r.pairs })}</b>` : ''}</span></div>`;
    }).join('');
    return `<div class="answers"><div class="ans-title">${t('whatTheySaid')}</div>${rows}</div>`;
  }

  export function orderResultView() {
    const c = state.room.current, mid = myId();
    const mine = (c.results && c.results[mid]) || null;
    const place = id => (mine ? mine.seq.indexOf(id) : -1);
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('order', c.question)}
      <div class="order-list">${c.truth.map((it, i) => {
        const at = place(it.id);
        // Green when you had it in exactly this slot, amber when you had it
        // somewhere else — at a glance you can see what you nearly had.
        const cls = at < 0 ? '' : at === i ? 'right' : 'near';
        return `<div class="ord reveal ${cls}" style="animation-delay:${i * 90}ms">
          <span class="pos">${i + 1}</span><span class="nm">${esc(it.text)}</span>
          <span class="val">${fmt(it.v)}</span>${at >= 0 && at !== i ? `<span class="yours">${t('youSaid', { n: at + 1 })}</span>` : ''}
        </div>`;
      }).join('')}</div>
      ${mine ? `<div class="center" style="margin-top:14px;font-weight:800">${mine.pairs === c.truth.length - 1 ? t('perfectOrder') : t('pairsRight', { n: mine.pairs })}</div>` : ''}
      ${everyOrder(c)}
    </div></div></div></div>`;
  }

  // ---------- which is bigger ----------
  export function higherView() {
    const c = state.room.current, mine = c.myPick;
    const side = (k, label) => `<button class="opt big ${mine === k ? 'picked' : ''}"
      data-act="higher" data-v="${k}" ${mine ? 'disabled' : ''}>${esc(label)}</button>`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('higher', c.question)}
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="two-up">${side('left', c.left)}${side('right', c.right)}</div>
      ${mine ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.picked)}
    </div></div></div></div>`;
  }

  export function higherRevealView() {
    const c = state.room.current, mid = myId();
    const won = c.picks && c.picks[mid] === c.correct;
    const side = (k, label) => `<div class="side ${c.correct === k ? 'ok' : ''}">
      <div class="side-head"><b>${esc(label)}</b></div>
      <div class="repw">${Object.entries(c.picks || {}).filter(([, v]) => v === k)
        .map(([pid]) => { const p = P(pid); return p ? `<span class="repp">${J(p.avatar)}${esc(p.name)}</span>` : ''; }).join('')}</div></div>`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('higher', c.question)}
      <div class="center" style="margin-top:10px;font-weight:800">${c.picks && c.picks[mid] ? (won ? t('higherRight') : t('higherWrong')) : ''}</div>
      <div class="sides">${side('left', c.left)}${side('right', c.right)}</div>
    </div></div></div></div>`;
  }

  // ---------- what went missing ----------
  // One view for both phases: during the watch phase every item is there and
  // nothing is tappable; from the pick phase the server simply stops sending
  // the one that went, so there is nothing in the page to read it from.
  export function missView() {
    const c = state.room.current, watching = c.watching, mine = c.myPick;
    if (watching) {
      return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
        ${qCard('missing', t('missWatch'))}
        <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
        <div class="grid4">${c.items.map((it, i) =>
          `<button class="opt" style="animation-delay:${i * 60}ms" disabled>${esc(it.text)}</button>`).join('')}</div>
      </div></div></div></div>`;
    }
    // The first version drew the empty slot as a "?", which meant the answer
    // was the one thing on screen you could not read — no memory required at
    // all. What is left on the board is shown plainly, and the four names you
    // started with are the buttons; finding which one is no longer there is
    // the round.
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('missing', t('missWhich'))}
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="still">${c.items.map(it => `<span class="chip">${esc(it.text)}</span>`).join('')}</div>
      <div class="grid4">${c.all.map((it, i) =>
        `<button class="opt ${mine === it.id ? 'picked' : ''}" style="animation-delay:${i * 60}ms"
          data-act="miss" data-id="${it.id}" ${mine ? 'disabled' : ''}>${esc(it.text)}</button>`).join('')}</div>
      ${whoRow(c.picked)}
    </div></div></div></div>`;
  }

  export function missRevealView() {
    const c = state.room.current, mid = myId();
    const gone = (c.all || []).find(x => x.id === c.goneId);
    const right = c.picks && c.picks[mid] === c.goneId;
    const rows = (c.all || []).map(it => {
      const voters = Object.entries(c.picks || {}).filter(([, v]) => v === it.id)
        .map(([pid]) => { const p = P(pid); return p ? `<span class="repp">${J(p.avatar)}${esc(p.name)}</span>` : ''; }).join('');
      return `<div class="ansrow ${it.id === c.goneId ? 'ok' : ''}">
        <span class="nm">${esc(it.text)}</span><span class="repw">${voters}</span></div>`;
    }).join('');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      ${qCard('missing', `${t('missWrong')} ${gone ? gone.text : ''}`)}
      <div class="center" style="margin-top:10px;font-weight:800">${c.picks && c.picks[mid] ? (right ? t('missRight') : '') : ''}</div>
      <div class="answers">${rows}</div>
    </div></div></div></div>`;
  }

  // ---------- the minority ----------
  // Two buttons and nothing else on screen: what the rest of the room is
  // choosing is the whole puzzle, so the only thing shown before the reveal is
  // how many have answered — never which side they took.
  export function minorPickView() {
    const c = state.room.current, mine = c.myPick;
    const side = (k, label) => `<button class="opt big ${mine === k ? 'picked' : ''}"
      data-act="minor" data-v="${k}" ${mine ? 'disabled' : ''}>${esc(label)}</button>`;
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag minor">${TYPES.minor} ${t('type_minor')}</span>
        <div class="q">${t('minorPickQ')}</div><div class="sub">${t('minorTip')}</div></div>
      <div class="timebar"><i data-bar="${state.room.deadline}"></i></div>
      <div class="two-up">${side('a', c.a)}${side('b', c.b)}</div>
      ${mine ? `<div class="center muted" style="margin-top:14px"><span class="dots">${t('waitOthers')}</span></div>` : ''}
      ${whoRow(c.picked)}
    </div></div></div></div>`;
  }

  export function minorRevealView() {
    const c = state.room.current, mid = myId();
    const won = (c.winners || []).includes(mid);
    const faces = k => Object.entries(c.picks || {}).filter(([, v]) => v === k)
      .map(([pid]) => { const p = P(pid); return p ? `<span class="repp">${J(p.avatar)}${esc(p.name)}</span>` : ''; }).join('');
    const col = (k, label) => {
      const n = (c.counts || {})[k] || 0;
      const isMinority = (c.winners || []).length && c.picks[(c.winners || [])[0]] === k;
      return `<div class="side ${isMinority ? 'ok' : ''}">
        <div class="side-head"><b>${esc(label)}</b><span class="cnt">${fmt(n)}</span></div>
        <div class="repw">${faces(k) || `<span class="by">${t('repNobody')}</span>`}</div></div>`;
    };
    const verdict = !(c.winners || []).length
      ? (c.counts && c.counts.a && c.counts.b ? t('minorTie') : t('minorAll'))
      : won ? t('minorWon') : t('minorLost');
    return `<div class="screen">${gameTop()}<div class="stage"><div class="scroll"><div class="wrap">
      <div class="q-card glass"><span class="type-tag minor">${TYPES.minor} ${t('type_minor')}</span>
        <div class="q">${t('minorPickQ')}</div></div>
      <div class="center" style="margin-top:10px;font-weight:800">${verdict}</div>
      <div class="sides">${col('a', c.a)}${col('b', c.b)}</div>
    </div></div></div></div>`;
  }
