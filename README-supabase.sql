-- Run this once in your Supabase project's SQL editor
-- (Project > SQL Editor > New query). Safe to re-run: it is idempotent.
--
-- One table holds the global best for every game. Which direction wins, and
-- whether a game's board resets daily, live in game_config — NOT in the client
-- — so a page cannot claim "lower is better" for a game where it isn't, or
-- write into a day it is not playing.
--
-- Direct table writes are revoked; submit_game_score() is the only write path.
--
-- This replaces the per-game tables (global_score, honeycomb_global_best) that
-- came before. Bubble Tap's existing record is carried over; Honeycomb had no
-- records to lose, because its half of the old script was never applied.
--
-- See ARCHITECTURE.md §27.


-- ============================================================
-- 1. Which games have a leaderboard, and how they are scored
-- ============================================================

create table if not exists game_config (
  game_slug       text primary key,
  -- true for moves / time / pieces-left, false for points
  lower_is_better boolean not null,
  -- true when everyone plays the same puzzle each day, so the record is
  -- scoped to that day rather than to all time
  is_daily        boolean not null default false,
  label           text not null
);

insert into game_config (game_slug, lower_is_better, is_daily, label) values
  ('bubble-tap',       false, false, 'points'),
  ('honeycomb',        true,  false, 'completion time'),
  ('slide-n-order',    true,  false, 'moves'),
  ('marble-nostalgia', true,  false, 'marbles left'),
  ('word-steps',       true,  true,  'steps')
on conflict (game_slug) do update
  set lower_is_better = excluded.lower_is_better,
      is_daily        = excluded.is_daily,
      label           = excluded.label;

-- Doodle On and Untangle are deliberately absent. Doodle On has no score by
-- design, and Untangle draws a different puzzle every run, so a global "fewest
-- moves" would only ever record whoever drew the smallest layout. Submitting
-- for either raises an exception rather than silently creating a row.

alter table game_config enable row level security;

create policy "allow read" on game_config
  for select using (true);

revoke insert, update, delete on game_config from anon, authenticated;


-- ============================================================
-- 2. The records
-- ============================================================

create table if not exists game_scores (
  game_slug  text not null references game_config (game_slug),
  -- 'all' for an all-time record, or 'YYYY-MM-DD' for a daily one. Always
  -- derived server-side.
  period     text not null,
  best_score int  not null,
  updated_at timestamptz not null default now(),
  primary key (game_slug, period)
);

alter table game_scores enable row level security;

create policy "allow read" on game_scores
  for select using (true);

revoke insert, update, delete on game_scores from anon, authenticated;

create index if not exists game_scores_slug_idx on game_scores (game_slug);


-- ============================================================
-- 3. The only write path
-- ============================================================

-- Inserts the first record for a game, or moves an existing one only in the
-- improving direction, and always returns the current best — whether it changed
-- or not, so the caller can show it either way.
--
-- p_day exists only because a daily game picks its puzzle from the player's
-- LOCAL date, while the server runs in UTC: without it, someone in UTC+13
-- playing tomorrow's puzzle would have their score filed under today and
-- compared against a different puzzle. It is clamped to one day either side of
-- the server's date, so it fixes the timezone skew without letting a client
-- write into an arbitrary day. It is ignored for non-daily games.
create or replace function submit_game_score(
  p_slug text,
  p_score int,
  p_day date default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg          game_config;
  target       text;
  current_best int;
begin
  select * into cfg from game_config where game_slug = p_slug;
  if not found then
    raise exception 'no leaderboard configured for game %', p_slug
      using errcode = 'no_data_found';
  end if;

  if cfg.is_daily then
    target := coalesce(
      case
        when p_day between current_date - 1 and current_date + 1 then p_day
        else current_date
      end,
      current_date
    )::text;
  else
    target := 'all';
  end if;

  insert into game_scores (game_slug, period, best_score)
  values (p_slug, target, p_score)
  on conflict (game_slug, period) do update
    set best_score = excluded.best_score,
        updated_at = now()
    where case
            when cfg.lower_is_better then excluded.best_score < game_scores.best_score
            else excluded.best_score > game_scores.best_score
          end;

  select best_score into current_best
    from game_scores where game_slug = p_slug and period = target;

  return current_best;
end;
$$;

grant execute on function submit_game_score(text, int, date) to anon, authenticated;


-- ============================================================
-- 4. Carry over the old records, then retire the old shape
-- ============================================================

-- Bubble Tap has a real record worth keeping.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'global_score') then
    insert into game_scores (game_slug, period, best_score)
    select 'bubble-tap', 'all', score from global_score where id = 1
    on conflict (game_slug, period) do update
      set best_score = greatest(game_scores.best_score, excluded.best_score);
  end if;
end $$;

-- Honeycomb's old table was never created, so there is nothing to migrate.
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'honeycomb_global_best') then
    insert into game_scores (game_slug, period, best_score)
    select 'honeycomb', 'all', best_ms from honeycomb_global_best
      where id = 1 and best_ms is not null
    on conflict (game_slug, period) do update
      set best_score = least(game_scores.best_score, excluded.best_score);
  end if;
end $$;

-- Retire the per-game shape. Drop these only once the site is deployed with the
-- new client; until then the old functions are what production is calling.
--
--   drop function if exists submit_score(int);
--   drop function if exists submit_honeycomb_time(int);
--   drop table if exists global_score;
--   drop table if exists honeycomb_global_best;
