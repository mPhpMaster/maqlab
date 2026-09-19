// Persistent store. Everything in here is optional: with no DATABASE_URL the
// game runs exactly as it always has, just without profiles/leaderboard/etc.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const URL = process.env.DATABASE_URL || '';
let pool = null;

async function init() {
  if (!URL) return false;
  // Hosted Postgres (Supabase/Neon) presents a publicly-trusted cert, so verify
  // it properly; a local dev server speaks plaintext.
  const local = /@(localhost|127\.0\.0\.1)/.test(URL);
  pool = new Pool({ connectionString: URL, ssl: !local, max: 8 });
  await pool.query(fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8'));
  return true;
}

const on = () => !!pool;
const q = (text, params) => pool.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0] || null;

// ---------------- profiles ----------------
async function touchProfile({ userId, name, avatar, isGuest = false }) {
  return one(
    `insert into profiles (user_id, name, avatar, is_guest)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update
       set name = excluded.name, avatar = excluded.avatar, last_seen_at = now()
     returning *`,
    [userId, name, JSON.stringify(avatar || {}), isGuest]
  );
}

const getProfile = userId => one('select * from profiles where user_id = $1', [userId]);

// Rank without sorting the whole table: count everyone strictly ahead of you,
// using the same tiebreak order as the leaderboard index.
async function rankOf(userId) {
  const r = await one(
    `select count(*)::int + 1 as rank from profiles me, profiles p
      where me.user_id = $1 and p.banned_at is null and p.games > 0
        and (p.total_score, p.wins, -p.games) > (me.total_score, me.wins, -me.games)`,
    [userId]
  );
  return r ? r.rank : null;
}

const recentGames = (userId, limit = 10) =>
  q(`select score, place, players, won, rounds, finished_at from game_results
      where user_id = $1 order by finished_at desc limit $2`, [userId, limit]).then(r => r.rows);

const leaderboard = (limit = 50) =>
  q(`select user_id, name, avatar, xp, games, wins, total_score, best_score, best_win_streak
       from profiles where banned_at is null and games > 0
      order by total_score desc, wins desc, games asc limit $1`, [Math.min(limit, 100)]).then(r => r.rows);

// Written once, when a game ends. Idempotent per (user, room, game_no) so a
// double-fire can't inflate anyone's lifetime totals.
async function recordGame({ userId, roomCode, gameNo, score, place, players, rounds, won, xp, stats, achievements }) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const ins = await client.query(
      `insert into game_results (user_id, room_code, game_no, score, place, players, rounds, won)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning id`,
      [userId, roomCode, gameNo, score, place, players, rounds, won]
    );
    if (!ins.rowCount) { await client.query('rollback'); return false; } // already recorded
    const s = stats || {};
    await client.query(
      `update profiles set
         games = games + 1,
         wins = wins + $2,
         rounds = rounds + $3,
         total_score = total_score + $4,
         best_score = greatest(best_score, $4),
         xp = xp + $5,
         win_streak = case when $6 then win_streak + 1 else 0 end,
         best_win_streak = greatest(best_win_streak, case when $6 then win_streak + 1 else 0 end),
         fooled = fooled + $7, correct = correct + $8, snipes = snipes + $9,
         bullseyes = bullseyes + $10, fastest = fastest + $11, high_bets = high_bets + $12,
         best_streak = greatest(best_streak, $13), famous = famous + $14,
         spy_caught = spy_caught + $15, spy_evaded = spy_evaded + $16,
         achievements = (
           select coalesce(jsonb_agg(distinct a), '[]'::jsonb)
             from jsonb_array_elements(profiles.achievements || $17::jsonb) a
         ),
         last_seen_at = now()
       where user_id = $1`,
      [userId, won ? 1 : 0, rounds, score, xp, won,
        s.fooled || 0, s.correct || 0, s.snipes || 0, s.bullseyes || 0, s.fastest || 0,
        s.highBets || 0, s.bestStreak || 0, s.famous || 0, s.spyCaught || 0, s.spyEvaded || 0,
        JSON.stringify(achievements || [])]
    );
    await client.query('commit');
    return true;
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
}

// ---------------- social ----------------
const follow = (followerId, followeeId) =>
  q(`insert into follows (follower_id, followee_id) values ($1,$2) on conflict do nothing`, [followerId, followeeId]);
const unfollow = (followerId, followeeId) =>
  q('delete from follows where follower_id = $1 and followee_id = $2', [followerId, followeeId]);
const following = userId =>
  q(`select p.user_id, p.name, p.avatar, p.last_seen_at from follows f
       join profiles p on p.user_id = f.followee_id
      where f.follower_id = $1 order by p.last_seen_at desc`, [userId]).then(r => r.rows);
const followCounts = userId =>
  one(`select (select count(*)::int from follows where followee_id = $1) as followers,
              (select count(*)::int from follows where follower_id = $1) as following`, [userId]);
const isFollowing = (followerId, followeeId) =>
  one('select 1 from follows where follower_id = $1 and followee_id = $2', [followerId, followeeId]).then(Boolean);

// ---------------- reports & suggestions ----------------
const createReport = ({ reporterId, reporterName, reportedId, reportedName, reason, details }) =>
  q(`insert into reports (reporter_id, reporter_name, reported_id, reported_name, reason, details)
     values ($1,$2,$3,$4,$5,$6) on conflict do nothing`,
    [reporterId, reporterName, reportedId, reportedName, reason, (details || '').slice(0, 1000)]);

const createSuggestion = ({ userId, name, body }) =>
  q('insert into suggestions (user_id, name, body) values ($1,$2,$3)', [userId, name, body.slice(0, 2000)]);

// ---------------- moderation ----------------
const isBanned = userId =>
  one('select ban_reason from profiles where user_id = $1 and banned_at is not null', [userId]);

const setBan = (userId, reason, by) =>
  q(`update profiles set banned_at = now(), ban_reason = $2, banned_by = $3 where user_id = $1`,
    [userId, (reason || '').slice(0, 500), by]);

const unban = userId =>
  q('update profiles set banned_at = null, ban_reason = null, banned_by = null where user_id = $1', [userId]);

// Wipes progression but keeps the account, so a cheater starts over rather
// than getting a fresh identity to cheat from again.
const resetProfile = userId =>
  q(`update profiles set xp = 0, games = 0, wins = 0, rounds = 0, total_score = 0, best_score = 0,
       win_streak = 0, best_win_streak = 0, fooled = 0, correct = 0, snipes = 0, bullseyes = 0,
       fastest = 0, high_bets = 0, best_streak = 0, famous = 0, spy_caught = 0, spy_evaded = 0,
       achievements = '[]'::jsonb
     where user_id = $1`, [userId]);

const openReports = () =>
  q('select * from reports where handled_at is null order by created_at desc limit 100').then(r => r.rows);
const openSuggestions = () =>
  q('select * from suggestions where handled_at is null order by created_at desc limit 100').then(r => r.rows);
const bannedUsers = () =>
  q(`select user_id, name, ban_reason, banned_at, banned_by from profiles
      where banned_at is not null order by banned_at desc limit 100`).then(r => r.rows);
const handleReport = (id, by) =>
  q('update reports set handled_at = now(), handled_by = $2 where id = $1', [id, by]);
const handleSuggestion = (id, by) =>
  q('update suggestions set handled_at = now(), handled_by = $2 where id = $1', [id, by]);
const searchProfiles = term =>
  q(`select user_id, name, avatar, games, total_score, banned_at from profiles
      where name ilike $1 or user_id = $2 order by total_score desc limit 25`,
    [`%${term.replace(/[%_\\]/g, m => '\\' + m)}%`, term]).then(r => r.rows);

module.exports = {
  init, on, getProfile, touchProfile, rankOf, recentGames, leaderboard, recordGame,
  follow, unfollow, following, followCounts, isFollowing,
  createReport, createSuggestion,
  isBanned, setBan, unban, resetProfile,
  openReports, openSuggestions, bannedUsers, handleReport, handleSuggestion, searchProfiles,
};
