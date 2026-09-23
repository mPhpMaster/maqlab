-- MAQLAB persistent store.
-- Live game state (rooms, rounds, votes) stays in memory in server.js on
-- purpose — only things that must outlive a restart live here.
-- This file is applied on every boot, so every statement must be idempotent.

create table if not exists profiles (
  user_id      text primary key,          -- Discord id, or guest-<random>
  name         text not null,
  avatar       jsonb not null default '{}'::jsonb,
  is_guest     boolean not null default false,

  xp           integer not null default 0,
  games        integer not null default 0,
  wins         integer not null default 0,
  rounds       integer not null default 0,
  total_score  bigint  not null default 0,
  best_score   integer not null default 0,

  win_streak      integer not null default 0,
  best_win_streak integer not null default 0,

  -- lifetime totals of the per-game counters server.js already tracks
  fooled      integer not null default 0,
  correct     integer not null default 0,
  snipes      integer not null default 0,
  bullseyes   integer not null default 0,
  fastest     integer not null default 0,
  high_bets   integer not null default 0,
  best_streak integer not null default 0,
  famous      integer not null default 0,
  spy_caught  integer not null default 0,
  spy_evaded  integer not null default 0,

  achievements jsonb not null default '[]'::jsonb,

  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  banned_at  timestamptz,
  ban_reason text,
  banned_by  text
);

-- the leaderboard's exact sort order, so ranking never does a full sort
create index if not exists profiles_board_idx
  on profiles (total_score desc, wins desc, games asc)
  where banned_at is null and games > 0;

-- One row per player per finished game. Drives match history, the score
-- trend chart and win streaks, and is the only reason those survive a restart.
create table if not exists game_results (
  id          bigserial primary key,
  user_id     text not null references profiles(user_id) on delete cascade,
  room_code   text not null,
  game_no     integer not null,
  score       integer not null,
  place       integer not null,
  players     integer not null,
  rounds      integer not null,
  won         boolean not null,
  finished_at timestamptz not null default now(),
  -- a room that replays keeps its code, so game_no is what makes a game unique
  unique (user_id, room_code, game_no)
);
create index if not exists game_results_user_idx on game_results (user_id, finished_at desc);

-- One shared id per finished game, so every player's row points at the same
-- match and a link to it can be handed to someone who was not in the room.
-- Added after the table shipped, hence the ALTER rather than a column above.
alter table game_results add column if not exists match_id uuid;
create index if not exists game_results_match_idx on game_results (match_id);

create table if not exists follows (
  follower_id text not null references profiles(user_id) on delete cascade,
  followee_id text not null references profiles(user_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists follows_followee_idx on follows (followee_id);

create table if not exists reports (
  id            bigserial primary key,
  reporter_id   text not null,
  reporter_name text not null,
  reported_id   text not null,
  reported_name text not null,
  reason        text not null,
  details       text not null default '',
  created_at    timestamptz not null default now(),
  handled_at    timestamptz,
  handled_by    text
);
-- one *open* report per pair; reporting again is allowed once it's resolved
create unique index if not exists reports_open_idx
  on reports (reporter_id, reported_id) where handled_at is null;

create table if not exists suggestions (
  id         bigserial primary key,
  user_id    text not null,
  name       text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  handled_by text,
  check (char_length(body) between 3 and 2000)
);

-- The full record of one finished game: every question, every answer players
-- typed, every vote. game_results keeps the score; this keeps the match, and
-- it is what /match/<id> replays. Guests and bots are in here too, because a
-- round whose winning lie was written by a guest is unreadable without them.
create table if not exists matches (
  id          uuid primary key,
  room_code   text not null,
  game_no     integer not null,
  lang        text not null default 'en',
  rounds      integer not null,
  data        jsonb not null,
  finished_at timestamptz not null default now()
);
