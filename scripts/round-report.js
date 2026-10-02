#!/usr/bin/env node
// What each round type is actually costing players.
//
//   node --env-file-if-exists=.env scripts/round-report.js
//   node --env-file-if-exists=.env scripts/round-report.js --since 2026-10-02
//   node --env-file-if-exists=.env scripts/round-report.js --compare 2026-10-02
//
// Two numbers per type, and they answer different questions:
//
//   took part  — how many of the people in the room did the thing the round
//                asked for. This is the number that found the problem: 22% of
//                players never submit a lie in Bluff, the worst in the game.
//
//   how long   — how long the ones who did answer took. Without it a player
//                who did not understand looks exactly like one who ran out of
//                time, and those want opposite fixes: if the people who answer
//                are using most of the clock, the round is too tight; if they
//                answer in a third of it and others still skip, the round is
//                not understood, or not worth doing.
//
// Read-only, and it reads what the game already records — nothing here needs
// new instrumentation beyond the timings added on 2 Oct 2026.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
if (!URL) {
  console.error('no NEON_DATABASE_URL or DATABASE_URL in the environment');
  process.exit(1);
}

const arg = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SINCE = arg('since', null);
const COMPARE = arg('compare', null);
const LIMIT = Number(arg('limit', 2000));

// ---------------------------------------------------------------------------
// Who took part. Deliberately one rule per type: "answered" means something
// different in each round, and a missing rule would quietly report a type as
// 0% — which looks exactly like the disaster this tool exists to find. The
// rules are checked against the server's own TYPES list before anything runs.
// ---------------------------------------------------------------------------
const TOOK_PART = {
  bluff: r => (r.options || []).flatMap(o => o.authors || []),
  number: r => Object.keys(r.guesses || {}),
  likely: r => Object.keys(r.votes || {}),
  spy: r => Object.keys(r.clues || {}),
  order: r => Object.keys(r.orders || {}),
  name: r => (r.groups || []).flatMap(g => g.ids || []),
  many: r => Object.keys(r.guesses || {}),
  two: r => (r.sets || []).map(s => s.pid),
  // the quick rounds all answer per item
  blitz: r => quickAnswerers(r),
  emoji: r => quickAnswerers(r),
  odd: r => quickAnswerers(r),
};
const quickAnswerers = r => {
  const ids = new Set();
  for (const it of r.items || []) for (const pid of Object.keys(it.answers || {})) ids.add(pid);
  return [...ids];
};

// The phase a type's answer time is measured against, and the tightest
// allowance it is ever given. Parsed from the server rather than copied, so a
// pace change does not quietly make this report wrong.
const PHASE_FOR = {
  bluff: 'write', number: 'guess', likely: 'likelyVote', spy: 'spyClue',
  order: 'order', name: 'nameWrite', many: 'manyAsk', two: 'twoWrite',
  blitz: 'blitz', emoji: 'emoji', odd: 'odd',
};

function paceTable() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const block = src.match(/const T = \{[\s\S]*?\n\};/)[0];
  const out = {};
  for (const pace of ['chill', 'normal', 'fast']) {
    const row = block.match(new RegExp(pace + ': \\{([^}]*)\\}'))[1];
    out[pace] = {};
    for (const [, k, v] of row.matchAll(/(\w+):\s*([\d.]+)/g)) out[pace][k] = Number(v);
  }
  return out;
}

function serverTypes() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  return src.match(/const TYPES = \[(.*?)\];/)[1].match(/'(\w+)'/g).map(t => t.replace(/'/g, ''));
}

// Timings: the typed rounds carry one figure per player, the quick rounds
// carry one per item. Both are milliseconds from the moment the phase opened.
function timings(r) {
  if (r.ms && Object.keys(r.ms).length) return Object.values(r.ms);
  const out = [];
  for (const it of r.items || []) for (const a of Object.values(it.answers || {})) {
    if (typeof a.t === 'number') out.push(a.t);
  }
  return out;
}

const pct = (a, b) => (b ? (a * 100) / b : 0);
function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function tally(rows) {
  const stat = {};
  for (const row of rows) {
    const d = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    const humans = (d.players || []).filter(p => !p.bot).map(p => p.pid);
    if (!humans.length) continue;
    for (const r of d.log || []) {
      const rule = TOOK_PART[r.type];
      if (!rule) continue;
      const s = stat[r.type] || (stat[r.type] = { rounds: 0, slots: 0, took: 0, ms: [], byPace: {} });
      const part = new Set(rule(r));
      s.rounds += 1;
      for (const pid of humans) { s.slots += 1; if (part.has(pid)) s.took += 1; }
      const t = timings(r);
      s.ms.push(...t);
      // Matches recorded before 2 Oct 2026 do not say which pace they were
      // played at, and a slow answer cannot be told from a tight clock without
      // it. Those rounds still count; they just cannot be attributed.
      if (d.pace) (s.byPace[d.pace] = s.byPace[d.pace] || []).push(...t);
    }
  }
  return stat;
}

function report(stat, pace, label) {
  const rows = Object.entries(stat).sort((a, b) => pct(a[1].took, a[1].slots) - pct(b[1].took, b[1].slots));
  if (!rows.length) { console.log(`\n${label}: no rounds`); return; }
  console.log(`\n${label}`);
  console.log('  type     rounds  took part  skipped   median   p90    p90 against its clock');
  for (const [type, s] of rows) {
    const ms = s.ms.slice().sort((a, b) => a - b);
    const med = quantile(ms, 0.5), p90 = quantile(ms, 0.9);
    // Against the clock those answers actually had, where the match says so;
    // otherwise against the tightest one, marked with a "?" because it is a
    // bound rather than a measurement.
    const known = Object.entries(s.byPace).sort((a, b) => b[1].length - a[1].length)[0];
    const usedPace = known ? known[0] : 'fast';
    const allowed = pace[usedPace][PHASE_FOR[type]];
    const p90pace = known ? quantile(known[1].slice().sort((a, b) => a - b), 0.9) : p90;
    const share = p90pace != null && allowed
      ? `${Math.round(pct(p90pace / 1000, allowed))}% of ${usedPace}${known ? '' : '?'}`
      : '—';
    console.log(
      `  ${type.padEnd(8)} ${String(s.rounds).padStart(5)}  ${pct(s.took, s.slots).toFixed(0).padStart(7)}%  ` +
      `${(100 - pct(s.took, s.slots)).toFixed(0).padStart(6)}%  ` +
      `${(med == null ? '—' : (med / 1000).toFixed(1) + 's').padStart(7)} ` +
      `${(p90 == null ? '—' : (p90 / 1000).toFixed(1) + 's').padStart(6)}   ${share}`
    );
  }
  const noTimes = rows.filter(([, s]) => !s.ms.length).map(([t]) => t);
  if (noTimes.length) {
    console.log(`\n  no timings yet for: ${noTimes.join(', ')}`);
    console.log('  (rounds played before 2 Oct 2026 carry none; quick rounds have always had them)');
  }
}

(async () => {
  const types = serverTypes();
  const missing = types.filter(t => !TOOK_PART[t]);
  if (missing.length) {
    // Silence here would read as "nobody plays that round", which is the exact
    // shape of the finding this tool is for.
    console.error(`round type(s) with no participation rule in this report: ${missing.join(', ')}`);
    console.error('add one to TOOK_PART, or the report will show them as never played.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: URL, ssl: !/@(localhost|127\.0\.0\.1)/.test(URL), max: 2 });
  const where = SINCE ? 'where finished_at >= $1' : '';
  const params = SINCE ? [SINCE] : [];
  const { rows } = await pool.query(
    `select data, finished_at from matches ${where} order by finished_at desc limit ${LIMIT}`, params);

  if (!rows.length) { console.log('no matches recorded'); await pool.end(); return; }
  const pace = paceTable();
  console.log(`${rows.length} matches, newest ${rows[0].finished_at.toISOString().slice(0, 16)}, ` +
              `oldest ${rows[rows.length - 1].finished_at.toISOString().slice(0, 16)}`);

  if (COMPARE) {
    const at = new Date(COMPARE);
    report(tally(rows.filter(r => r.finished_at < at)), pace, `BEFORE ${COMPARE}`);
    report(tally(rows.filter(r => r.finished_at >= at)), pace, `SINCE ${COMPARE}`);
  } else {
    report(tally(rows), pace, 'all of it');
  }
  await pool.end();
})().catch(e => { console.error('failed:', e.message); process.exit(1); });
