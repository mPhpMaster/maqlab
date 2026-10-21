// Profiles, the leaderboard, reports and suggestions, admin, about.
// Split out of app.js unchanged (and still indented as it was); js/main.js runs the parts in order.
import { $modal, STR } from './base.js';
import { DONATE_URL, J, MODS, TYPES, buzz, closeModal, confirmBox, esc, fmt, levelInfo, modal, openLink, sfx, state, t, toast } from './state.js';
import { navigate } from './core.js';
import { api, apiErr, needAccount, post } from './extras.js';
import { actions } from './actions.js';

  // ---------- profile ----------
  export async function openProfile(userId) {
    if (!userId) return;
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    const d = await api('/api/profile/' + encodeURIComponent(userId));
    if (d.error || d.status) { closeModal(); toast(d.status === 503 ? t('err_bad') : t('err_noroom'), 'err'); return; }
    drawProfile(d);
  }

  // Dates come back as ISO strings; only the day matters on a scoreboard.
  export const shortDate = v => {
    const d = new Date(v);
    // ar-EG keeps the Gregorian calendar and Arabic month names; -u-nu-latn
    // keeps the digits Latin, like everywhere else.
    return isNaN(d) ? '' : d.toLocaleDateString(state.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });
  };
  export const medal = n => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : '#' + n);

  // The match itself, round by round: every question, every lie somebody
  // wrote, every vote. All of it was on screen during the game — this is the
  // same thing, kept. Rounds start collapsed so the scoreboard stays the first
  // thing you see; opening one is the point of the page.
  export function replayHtml(d) {
    if (!d.log || !d.log.length) return '';
    const by = {};
    for (const p of d.players) if (p.pid) by[p.pid] = p;
    const who = pid => by[pid] || null;
    // A player, as a small avatar-and-name pill. `tail` is whatever they did:
    // the option they picked, the number they guessed, their bet.
    const chip = (pid, cls, tail) => {
      const p = who(pid);
      return `<span class="repp ${cls || ''}">${J(p && p.avatar ? p.avatar : {})}${esc(p ? p.name : '—')}${
        tail ? ` <b>${esc(String(tail))}</b>` : ''}</span>`;
    };
    const chips = (ids, cls) => (ids.length ? ids.map(i => chip(i, cls)).join('') : `<span class="by">${t('repNobody')}</span>`);
    const line = (main, note, right, cls) => `<div class="repo ${cls || ''}">
      <span class="txt">${main}</span>${note ? `<span class="by">${note}</span>` : ''}
      ${right ? `<span class="repw">${right}</span>` : ''}</div>`;

    const bluff = r => r.options.map(o => {
      const voters = Object.entries(r.votes || {})
        .filter(([, v]) => v.id === o.id)
        .map(([pid, v]) => chip(pid, o.truth ? 'ok' : 'no', v.bet > 1 ? '×' + v.bet : ''));
      const note = o.truth ? `✅ ${t('repTruth')}`
        : o.house ? t('repHouse')
        : `✍️ ${esc(o.authors.map(a => (who(a) || {}).name || '—').join('، '))}`;
      return line(esc(o.text), note, voters.join(''), o.truth ? 'ok' : '');
    }).join('');

    const number = r => line(fmt(r.answer), t('repAnswer'), '', 'ok') +
      Object.entries(r.guesses || {})
        .sort((a, b) => Math.abs(a[1] - r.answer) - Math.abs(b[1] - r.answer))
        .map(([pid, g]) => line(chip(pid, (r.bulls || []).includes(pid) ? 'ok' : ''), '', `<b>${fmt(g)}</b>${(r.bulls || []).includes(pid) ? ' 🎯' : ''}`))
        .join('');

    const likely = r => line(chips(r.winners || [], 'ok'), t('repMostVotes'), '', 'ok') +
      Object.entries(r.votes || {}).map(([pid, target]) =>
        line(chip(pid), '→', chip(target, (r.winners || []).includes(target) ? 'ok' : ''))).join('');

    const spy = r =>
      line(`🕵️ ${chip(r.spyId)}`, r.caught ? t('repCaught') : t('repEscaped'), '', r.caught ? 'ok' : 'no') +
      Object.entries(r.clues || {}).map(([pid, clue]) =>
        line(chip(pid, pid === r.spyId ? 'no' : ''), '', `<b>${esc(clue)}</b>`)).join('') +
      Object.entries(r.votes || {}).map(([pid, target]) =>
        line(chip(pid), '→', chip(target, target === r.spyId ? 'ok' : ''))).join('') +
      (r.guess ? line(esc(r.guess), t('repSpyGuess'), r.guessRight ? '✅' : '❌', r.guessRight ? 'ok' : '') : '');

    // blitz, emoji and odd are one shape: a few items, one right answer each.
    const quick = (r, type) => r.items.map(it => {
      const said = a => (type === 'blitz' ? (a.v ? t('true') : t('false'))
        : (it.opts.find(o => o.id === a.id) || {}).text || '—');
      const head = type === 'blitz' ? esc(it.text)
        : type === 'emoji' ? `<span style="font-size:22px">${esc(it.e)}</span>`
        : it.opts.map(o => esc(o.text)).join(' · ');
      const right = type === 'blitz' ? (it.truth ? t('true') : t('false'))
        : (it.opts.find(o => o.id === it.correctId) || {}).text || '';
      const answers = Object.entries(it.answers || {})
        .map(([pid, a]) => chip(pid, a.ok ? 'ok' : 'no', said(a)));
      return `<div class="repi">${line(head, '', '', '')}
        ${line(`✅ ${esc(right)}`, type === 'odd' ? esc(it.why) : '', answers.join('') || `<span class="by">${t('repNobody')}</span>`, 'ok')}</div>`;
    }).join('');

    const order = r => {
      const text = {};
      for (const it of r.items) text[it.id] = it;
      const seq = ids => ids.map(id => esc((text[id] || {}).text || '?')).join(' › ');
      return line(seq(r.truth), t('repCorrect'), '', 'ok') +
        r.truth.map((id, i) => line(`${i + 1}. ${esc((text[id] || {}).text || '?')}`, '', `<b>${fmt((text[id] || {}).v)}</b>`)).join('') +
        Object.entries(r.orders || {}).map(([pid, s]) => line(chip(pid), '', `<b>${seq(s)}</b>`)).join('');
    };

    // Name Something and How Many of Us shipped without a branch here and
    // fell through to quick(), which reads r.items — a field neither of them
    // records. One such round in a match broke the whole page.
    const name = r => (r.groups || []).map(g =>
      line(esc(g.text), g.ids.length > 1 ? t('repMatched') : '', chips(g.ids, g.ids.length > 1 ? 'ok' : 'no'),
        g.ids.length > 1 ? 'ok' : '')).join('');

    const many = r => line(`${fmt(r.count)} ${t('repYesCount')}`, '', chips(r.yesIds || [], 'ok'), 'ok') +
      Object.entries(r.guesses || {}).sort((a, b) => Math.abs(a[1] - r.count) - Math.abs(b[1] - r.count))
        .map(([pid, g]) => line(chip(pid, g === r.count ? 'ok' : ''), t('repGuessed'), `<b>${fmt(g)}</b>${g === r.count ? ' 🎯' : ''}`)).join('');

    // Each set that was played, the lie marked, and who fell for what.
    // two sides, and the smaller one took the round
    const minor = r => (r.pair || []).map((label, i) => {
      const k = i === 0 ? 'a' : 'b';
      const ids = Object.entries(r.picks || {}).filter(([, v]) => v === k).map(([pid]) => pid);
      const won = ids.length && ids.every(id => (r.winners || []).includes(id));
      return line(esc(label), `${ids.length}`, chips(ids, won ? 'ok' : 'no'), won ? 'ok' : '');
    }).join('');

    const higher = r => (r.pair || []).map((label, i) => {
      const k = i === 0 ? 'left' : 'right';
      const ids = Object.entries(r.picks || {}).filter(([, v]) => v === k).map(([pid]) => pid);
      return line(esc(label), k === r.correct ? `✅ ${t('repTruth')}` : '', chips(ids, k === r.correct ? 'ok' : 'no'), k === r.correct ? 'ok' : '');
    }).join('');

    const missing = r => (r.items || []).map(it => {
      const ids = Object.entries(r.picks || {}).filter(([, v]) => v === it.id).map(([pid]) => pid);
      const gone = it.id === r.goneId;
      return line(esc(it.text), gone ? '👁️' : '', chips(ids, gone ? 'ok' : 'no'), gone ? 'ok' : '');
    }).join('');

    const two = r => (r.sets || []).map(set => `<div class="repi">
      ${line(chip(set.pid), t('repSaid'), '')}
      ${set.lines.map((l, i) => line(esc(l), i === set.lie ? t('twoWasLie') : '',
        Object.entries(set.picks || {}).filter(([, v]) => v === i)
          .map(([pid]) => chip(pid, i === set.lie ? 'ok' : 'no')).join(''),
        i === set.lie ? 'no' : '')).join('')}</div>`).join('');

    // The question is the summary line, so it is not repeated in the body.
    const bodyFor = r =>
      (r.type === 'spy' ? `<div class="repq">${esc(r.word)} <span class="by">· ${esc(r.cat)}</span></div>` : '') +
      (r.type === 'bluff' ? bluff(r)
        : r.type === 'number' ? number(r)
        : r.type === 'likely' ? likely(r)
        : r.type === 'spy' ? spy(r)
        : r.type === 'order' ? order(r)
        : r.type === 'name' ? name(r)
        : r.type === 'many' ? many(r)
        : r.type === 'two' ? two(r)
        : r.type === 'minor' ? minor(r)
        : r.type === 'higher' ? higher(r)
        : r.type === 'missing' ? missing(r)
        : quick(r, r.type));

    const rounds = d.log.map(r => {
      const pts = Object.entries(r.pts || {}).sort((a, b) => b[1] - a[1])
        .map(([pid, n]) => chip(pid, n > 0 ? 'ok' : 'no', (n > 0 ? '+' : '') + fmt(n)));
      const head = r.type === 'spy' ? t('type_spy') : r.q || t('type_' + r.type);
      return `<details class="rep">
        <summary><span class="rn">${r.n}</span><span>${TYPES[r.type] || ''} ${MODS[r.mod] || ''}</span>
          <span class="rq">${esc(head)}</span></summary>
        <div class="repbody">${bodyFor(r)}
          ${pts.length ? line(`<span class="by">${t('repRoundPts')}</span>`, '', pts.join('')) : ''}</div>
      </details>`;
    }).join('');
    return `<div style="margin-top:14px"><div class="muted" style="font-size:12px;font-weight:800;margin-bottom:4px">${t('repRounds')}</div>${rounds}</div>`;
  }

  // The scoreboard of one finished game. Reachable from a profile and from a
  // /match/<id> link, which is the whole point — it has to stand on its own
  // for someone who was never in the room.
  export async function openMatch(id, fromRoute) {
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    const d = await api('/api/match/' + encodeURIComponent(id));
    if (d.error || d.status) {
      closeModal();
      toast(t('matchGone'), 'err');
      if (fromRoute) navigate('/');
      return;
    }
    const url = `${location.origin}/match/${d.id}`;
    const rows = d.players.map(g => `
      <div class="brow ${g.won ? 'me' : ''}" ${g.userId ? `data-mt-uid="${esc(g.userId)}"` : ''}>
        <span class="rk">${medal(g.place)}</span>${J(g.avatar && g.avatar.s != null ? g.avatar : {})}
        <span class="nm">${esc(g.name || '—')}${g.bot ? ' 🤖' : ''}</span>
        <span class="sc">${fmt(g.score)}</span>
      </div>`).join('');
    modal(`<h3>🏁 ${t('matchResult')}</h3>
      <div class="center muted" style="font-size:12px;margin-bottom:10px">${shortDate(d.finishedAt)} · ${t('roundsN', { n: fmt(d.rounds) })}</div>
      <div style="max-height:56vh;overflow-y:auto">
        <div class="board">${rows}</div>
        ${replayHtml(d)}
      </div>
      <div class="row" style="margin-top:14px">
        <button class="btn sm mint grow" data-mt="share">🔗 ${t('shareMatch')}</button>
        <button class="btn sm ghost grow" data-close>${t('close')}</button>
      </div>`,
    m => m.addEventListener('click', async e => {
      if (e.target.closest('[data-mt="share"]')) {
        if (navigator.share) { try { await navigator.share({ title: 'MAQLAB', url }); return; } catch {} }
        try { await navigator.clipboard.writeText(url); toast(t('copied'), 'ok'); } catch { toast(url); }
        return;
      }
      const r = e.target.closest('[data-mt-uid]');
      if (r) { closeModal(); openProfile(r.dataset.mtUid); }
    }));
    // Closing a match that the URL points at should return home, not leave the
    // address bar pointing at a modal that is no longer open.
    if (fromRoute) {
      const bg = $modal.firstElementChild;
      bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) navigate('/'); });
    }
  }

  export function drawProfile(d) {
    const p = d.profile;
    const games = Number(p.games) || 0;
    const rate = games ? Math.round((Number(p.wins) / games) * 100) : 0;
    const L = levelInfo(Number(p.xp) || 0);
    const tile = (label, value) => `<div class="stat"><b>${value}</b><small>${label}</small></div>`;
    const recent = (d.games || []).slice(0, 7);
    const trend = recent.length
      ? `<div class="trend">${recent.slice().reverse().map(g => `<i class="${g.won ? 'w' : ''}" style="height:${Math.max(8, Math.min(46, (g.score / 4000) * 46))}px" title="${fmt(g.score)}"></i>`).join('')}</div>`
      : `<div class="center muted" style="font-size:12px">${t('noGames')}</div>`;
    const ach = (p.achievements || []).length;
    // Games recorded before match ids existed have nothing to link to, so they
    // stay in the trend bars above and out of this list.
    const history = (d.games || []).filter(g => g.match_id).slice(0, 5).map(g => `
      <div class="mrow" data-match="${esc(g.match_id)}">
        <span class="rk">${medal(g.place)}</span>
        <span class="nm">${g.place === 1 ? t('place1') : t('placeN', { n: g.place })} · ${fmt(g.players)} 👥</span>
        <span class="dt">${shortDate(g.finished_at)}</span>
        <span class="sc">${fmt(g.score)}</span>
      </div>`).join('');

    modal(`
      <div class="prof-head">
        ${J(p.avatar && p.avatar.s != null ? p.avatar : Jelly.random())}
        <div>
          <h3 style="margin:0;text-align:start">${esc(p.name)}</h3>
          <div class="row" style="gap:6px;margin-top:4px">
            <span class="chip">${t('level')} ${L.level}</span>
            ${d.rank ? `<span class="chip gold">#${fmt(d.rank)}</span>` : ''}
            ${p.banned_at ? `<span class="chip bad">${t('ban')}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="stats-grid">
        ${tile(t('winRate'), rate + '%')}
        ${tile(t('totalScore'), fmt(p.total_score))}
        ${tile(t('games', { n: games }), fmt(games))}
        ${tile(t('wins', { n: p.wins }), fmt(p.wins))}
        ${tile(t('bestScore'), fmt(p.best_score))}
        ${tile(t('curStreak'), '🔥 ' + fmt(p.win_streak))}
        ${tile(t('bestStreak'), fmt(p.best_win_streak))}
        ${tile(t('achievements'), `${fmt(ach)}/24`)}
      </div>
      <div class="section-title"><span>${t('lastGames')}</span><span class="chip">${fmt(d.follows.followers)} ${t('followers', { n: d.follows.followers })} · ${t('followingN')} ${fmt(d.follows.following)}</span></div>
      ${trend}
      ${history}
      <div class="row" style="margin-top:16px;flex-wrap:wrap">
        ${d.isMe ? '' : `<button class="btn sm ${d.isFollowing ? 'ghost' : 'mint'} grow" data-pf="follow">${d.isFollowing ? t('unfollow') : t('follow')}</button>`}
        ${d.isMe ? '' : `<button class="btn sm ghost" data-pf="report">🚩 ${t('report')}</button>`}
        ${d.isMe ? `<button class="btn sm ghost" data-pf="export">⬇️ ${t('exportData')}</button>
        <button class="btn sm ghost" data-pf="delete">🗑️ ${t('deleteAccount')}</button>` : ''}
        ${d.viewerIsAdmin && !d.isMe ? `<button class="btn sm coral" data-pf="${p.banned_at ? 'unban' : 'ban'}">${p.banned_at ? t('unban') : t('ban')}</button>
        <button class="btn sm ghost" data-pf="reset">${t('resetProfile')}</button>` : ''}
        <button class="btn sm ghost grow" data-close>${t('close')}</button>
      </div>`,
    m => m.addEventListener('click', async e => {
      const mt = e.target.closest('[data-match]');
      if (mt) { closeModal(); openMatch(mt.dataset.match); return; }
      const b = e.target.closest('[data-pf]'); if (!b) return;
      const k = b.dataset.pf;
      if (k === 'follow') {
        if (!needAccount()) return;
        const r = await post('/api/follow', { userId: p.user_id, follow: !d.isFollowing });
        if (r.ok) { d.isFollowing = r.following; sfx.tap(); drawProfile(d); }
      } else if (k === 'report') { closeModal(); openReport(p); }
      else if (k === 'export') {
        const data = await api('/api/account/export');
        if (data.error || data.status) { toast(t('err_bad'), 'err'); return; }
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: `maqlab-${p.user_id}.json` });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else if (k === 'delete') {
        closeModal();
        confirmBox(t('confirmDelete'), async () => {
          const r = await post('/api/account/delete', { confirm: 'delete' });
          if (r.ok) { state.me = null; state.isAdmin = false; state.lastKey = ''; toast(t('accountDeleted'), 'ok'); navigate('/'); }
          else toast(t('err_' + (r.error || 'bad')), 'err');
        });
      }
      else if (k === 'ban') { closeModal(); openBan(p); }
      else if (k === 'unban') { await post('/api/admin/action', { action: 'unban', userId: p.user_id }); toast(t('sent'), 'ok'); closeModal(); }
      else if (k === 'reset') {
        closeModal();
        confirmBox(t('confirmReset', { n: p.name }), async () => {
          await post('/api/admin/action', { action: 'reset', userId: p.user_id });
          toast(t('sent'), 'ok');
        });
      }
    }));
  }

  // ---------- leaderboard ----------
  export async function openLeaderboard(range) {
    // Only the two known ranges count; anything else falls back to the default.
    range = range === 'week' || range === 'all' ? range : state.boardRange;
    state.boardRange = range;
    modal(`<div class="center" style="padding:40px"><div class="spinner"></div></div>`);
    const d = await api('/api/leaderboard' + (range === 'week' ? '?range=week' : ''));
    if (d.error || d.status) { closeModal(); toast(t('err_bad'), 'err'); return; }
    const rows = d.entries.length ? d.entries.map((e, i) => `
      <div class="brow ${e.user_id === d.meId ? 'me' : ''}">
        <span class="rk">${i === 0 ? '👑' : i + 1}</span>${J(e.avatar && e.avatar.s != null ? e.avatar : {})}
        <span class="nm" data-act="profile" data-uid="${esc(e.user_id)}">${esc(e.name)}</span>
        <span class="sc">${fmt(e.total_score)}</span>
        ${e.user_id === d.meId ? '' : `<button class="flag" data-lb-report="${esc(e.user_id)}" data-lb-name="${esc(e.name)}">🚩</button>`}
      </div>`).join('') : `<div class="center muted" style="padding:20px">${t(range === 'week' ? 'boardEmptyWeek' : 'nothingHere')}</div>`;
    modal(`<h3>🏆 ${t('leaderboard')}</h3>
      <div class="seg" style="margin-bottom:10px">
        <button data-range="week" class="${range === 'week' ? 'on' : ''}">${t('boardWeek')}</button>
        <button data-range="all" class="${range === 'week' ? '' : 'on'}">${t('boardAll')}</button>
      </div>
      ${d.myRank ? `<div class="center muted" style="font-size:13px;margin-bottom:8px">${t('rank')}: #${fmt(d.myRank)}</div>` : ''}
      <div class="board" data-scroll="lb" style="max-height:58vh;overflow-y:auto">${rows}</div>
      <button class="btn block ghost" data-close style="margin-top:14px">${t('close')}</button>`,
    m => m.addEventListener('click', e => {
      const r = e.target.closest('[data-range]');
      if (r) { openLeaderboard(r.dataset.range); return; }
      const f = e.target.closest('[data-lb-report]');
      if (f) { closeModal(); openReport({ user_id: f.dataset.lbReport, name: f.dataset.lbName }); return; }
      const n = e.target.closest('[data-act="profile"]');
      if (n) { closeModal(); openProfile(n.dataset.uid); }
    }));
  }

  // ---------- report / suggest ----------
  export function openReport(target) {
    if (!needAccount()) return;
    const reasons = [['cheat', 'r_cheat'], ['name', 'r_name'], ['chat', 'r_chat'], ['other', 'r_other']];
    modal(`<h3>🚩 ${t('reportTitle', { n: esc(target.name) })}</h3>
      <div class="lbl" style="font-weight:700;margin-bottom:8px">${t('reportWhy')}</div>
      <div class="types">${reasons.map(([v, k], i) => `<button class="type-tog ${i === 0 ? 'on' : ''}" data-reason="${v}">${t(k)}</button>`).join('')}</div>
      <textarea id="rep-details" class="input" style="height:80px;text-align:start;padding:12px;margin-top:12px" maxlength="500" placeholder="${t('reportDetails')}"></textarea>
      <div class="row" style="margin-top:14px"><button class="btn coral grow" data-send>${t('report')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
    m => {
      let reason = 'cheat';
      m.addEventListener('click', async e => {
        const r = e.target.closest('[data-reason]');
        if (r) { reason = r.dataset.reason; m.querySelectorAll('[data-reason]').forEach(b => b.classList.toggle('on', b === r)); return; }
        if (!e.target.closest('[data-send]')) return;
        const d = await post('/api/report', { userId: target.user_id, reason, details: m.querySelector('#rep-details').value });
        closeModal();
        d.ok ? toast(t('reportSent'), 'ok') : apiErr(d);
      });
    });
  }

  export function openBan(target) {
    modal(`<h3>${t('ban')} — ${esc(target.name)}</h3>
      <input id="ban-why" class="input" maxlength="200" placeholder="${t('banWhy')}" style="text-align:start">
      <div class="row" style="margin-top:14px"><button class="btn coral grow" data-send>${t('ban')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
    m => m.addEventListener('click', async e => {
      if (!e.target.closest('[data-send]')) return;
      const d = await post('/api/admin/action', { action: 'ban', userId: target.user_id, reason: m.querySelector('#ban-why').value });
      closeModal();
      d.ok ? toast(t('sent'), 'ok') : apiErr(d);
    }));
  }

  export function openSuggest() {
    if (!needAccount()) return;
    modal(`<h3>💡 ${t('suggestBtn')}</h3>
      <textarea id="sug-body" class="input" style="height:120px;text-align:start;padding:12px" maxlength="2000" placeholder="${t('suggestPlaceholder')}"></textarea>
      <div class="row" style="margin-top:14px"><button class="btn mint grow" data-send>${t('send')}</button><button class="btn ghost grow" data-close>${t('cancel')}</button></div>`,
    m => m.addEventListener('click', async e => {
      if (!e.target.closest('[data-send]')) return;
      const d = await post('/api/suggest', { body: m.querySelector('#sug-body').value });
      closeModal();
      d.ok ? toast(t('sent'), 'ok') : apiErr(d);
    }));
  }

  // ---------- admin ----------
  export async function openAdmin(tab = 'reports') {
    const d = await api('/api/admin/state');
    if (d.status === 404) { toast(t('err_host'), 'err'); return; }
    const tabs = [['reports', d.reports.length], ['suggestions', d.suggestions.length], ['banned', d.banned.length], ['search', '']];
    const card = (inner, actions) => `<div class="adm-row"><div class="grow">${inner}</div><div class="row">${actions}</div></div>`;
    let body = '';
    if (tab === 'reports') {
      body = d.reports.length ? d.reports.map(r => card(
        `<b data-act="profile" data-uid="${esc(r.reported_id)}">${esc(r.reported_name)}</b>
         <small>${esc(r.reason)}${r.details ? ' — ' + esc(r.details) : ''}</small>
         <small class="muted">${esc(r.reporter_name)}</small>`,
        `<button class="btn sm coral" data-adm="ban" data-id="${esc(r.reported_id)}" data-name="${esc(r.reported_name)}">${t('ban')}</button>
         <button class="btn sm ghost" data-adm="handleReport" data-rid="${r.id}">${t('markDone')}</button>`)).join('') : '';
    } else if (tab === 'suggestions') {
      body = d.suggestions.length ? d.suggestions.map(s => card(
        `<b>${esc(s.name)}</b><small>${esc(s.body)}</small>`,
        `<button class="btn sm ghost" data-adm="handleSuggestion" data-rid="${s.id}">${t('markDone')}</button>`)).join('') : '';
    } else if (tab === 'banned') {
      body = d.banned.length ? d.banned.map(b => card(
        `<b data-act="profile" data-uid="${esc(b.user_id)}">${esc(b.name)}</b><small>${esc(b.ban_reason || '')}</small>`,
        `<button class="btn sm mint" data-adm="unban" data-id="${esc(b.user_id)}">${t('unban')}</button>`)).join('') : '';
    } else {
      body = `<input id="adm-q" class="input" placeholder="${t('searchPlayers')}" style="text-align:start"><div id="adm-results" class="col" style="gap:8px;margin-top:10px"></div>`;
    }
    modal(`<h3>🛡️ ${t('adminPanel')}</h3>
      <div class="tabs">${tabs.map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-adm-tab="${k}">${t('tab_' + k)}${n ? ` (${n})` : ''}</button>`).join('')}</div>
      <div class="adm-list">${body || `<div class="center muted" style="padding:20px">${t('nothingHere')}</div>`}</div>
      <button class="btn block ghost" data-close style="margin-top:14px">${t('close')}</button>`,
    m => {
      const q = m.querySelector('#adm-q');
      if (q) {
        let timer = 0;
        q.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(async () => {
            const r = await post('/api/admin/action', { action: 'search', term: q.value });
            m.querySelector('#adm-results').innerHTML = (r.results || []).map(u =>
              `<div class="adm-row"><div class="grow"><b data-act="profile" data-uid="${esc(u.user_id)}">${esc(u.name)}</b><small>${fmt(u.games)} ${t('games', { n: u.games })} · ${fmt(u.total_score)}</small></div>
               <button class="btn sm ${u.banned_at ? 'mint' : 'coral'}" data-adm="${u.banned_at ? 'unban' : 'ban'}" data-id="${esc(u.user_id)}" data-name="${esc(u.name)}">${u.banned_at ? t('unban') : t('ban')}</button></div>`).join('');
          }, 350);
        });
      }
      m.addEventListener('click', async e => {
        const tb = e.target.closest('[data-adm-tab]');
        if (tb) { openAdmin(tb.dataset.admTab); return; }
        const pr = e.target.closest('[data-act="profile"]');
        if (pr) { closeModal(); openProfile(pr.dataset.uid); return; }
        const b = e.target.closest('[data-adm]'); if (!b) return;
        const act = b.dataset.adm;
        if (act === 'ban') { closeModal(); openBan({ user_id: b.dataset.id, name: b.dataset.name }); return; }
        await post('/api/admin/action', { action: act, userId: b.dataset.id, id: b.dataset.rid ? +b.dataset.rid : undefined });
        openAdmin(tab);
      });
    });
  }

  // ---------- about ----------
  export function openAbout() {
    modal(`<div class="center"><div class="logo sm">${t('appName')}</div></div>
      ${STR[state.lang].aboutBody.map(p => `<p>${esc(p)}</p>`).join('')}
      <div class="mode-strip" style="margin:14px 0">${Object.keys(TYPES).map(k => `<span class="chip">${TYPES[k]} ${t('type_' + k)}</span>`).join('')}</div>
      <div class="support-card">
        <b>${t('supportTitle')}</b>
        <p>${t('supportBody')}</p>
        <p class="muted">${t('supportNothing')}</p>
        <button class="btn mint block" data-act="donate">${t('supportBtn')}</button>
      </div>
      <div class="center muted" style="font-size:12px">${t('aboutMade')} · ${t('version')} 2.0</div>
      <div class="center" style="margin-top:8px;font-size:12px"><a href="/terms" target="_blank" style="color:var(--muted)">${t('terms')}</a> · <a href="/privacy" target="_blank" style="color:var(--muted)">${t('privacy')}</a></div>
      <button class="btn block ghost" data-close style="margin-top:14px">${t('close')}</button>`,
      // Modals live outside the app container, so the main click delegate
      // never sees them — every interactive modal brings its own listener.
      m => m.addEventListener('click', e => {
        if (e.target.closest('[data-act="donate"]')) { buzz(10); openLink(DONATE_URL); }
      }));
  }
