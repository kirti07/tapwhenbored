-- Run this once in your Supabase project's SQL editor
-- (Project > SQL Editor > New query). Safe to re-run: it is idempotent.
--
-- Two things live here. The pre-arcade shape, unchanged: one aggregate record
-- per game, which the homepage wall reads. And the arcade boards: ten named
-- rows per game across Today / This week / All-time, which need a player.
--
-- Which direction wins, and whether a game's board resets daily, live in
-- game_config — NOT in the client — so a page cannot claim "lower is better"
-- for a game where it isn't, or write into a day it is not playing.
--
-- Direct table writes are revoked everywhere; the security-definer functions
-- in sections 7-10 are the only write paths.
--
-- Identity is deliberately weak and deliberately optional: a player_id the
-- browser generates for itself, an optional 12-character name, an optional
-- email. There is no account, no password and no sign-in. Names are NOT
-- unique — a player_id is. "Boards are for fun — scores aren't verified."
--
-- No email is readable by the browser. See section 3.
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
  -- Descriptive only: what the number means, for whoever is reading a row in
  -- the SQL editor. No code reads it, in the client or in the functions below.
  -- The registry's matching `unit` field was deleted for exactly that reason
  -- (ARCHITECTURE.md §10); this one stays because dropping a not-null column
  -- from a live table is a migration with nothing to gain.
  label           text not null
);

insert into game_config (game_slug, lower_is_better, is_daily, label) values
  ('bubble-tap',       false, false, 'points'),
  ('honeycomb',        true,  false, 'completion time'),
  ('slide-n-order',    true,  false, 'moves'),
  ('marble-nostalgia', true,  false, 'marbles left'),
  ('word-steps',       true,  true,  'steps'),
  ('flip-it',          true,  false, 'perfect time')
on conflict (game_slug) do update
  set lower_is_better = excluded.lower_is_better,
      is_daily        = excluded.is_daily,
      label           = excluded.label;

-- Doodle On and Untangle are deliberately absent. Doodle On has no score by
-- design, and Untangle draws a different puzzle every run, so a global "fewest
-- moves" would only ever record whoever drew the smallest layout. Submitting
-- for either raises an exception rather than silently creating a row.
--
-- Both still show a personal best on the account page. That number never
-- leaves the browser, which is why they need no row here.

-- Do NOT add columns to the INSERT above. scripts/validate-games.js parses it
-- with a regex that matches exactly four positional values ending in
-- `'label' )`; a fifth makes it match zero rows and fails `npm run validate`,
-- which gates `npm run build`, which is the Vercel build command. New columns
-- go in by ALTER plus a separate UPDATE, below.

-- Plausibility clamps, checked by submit_game_run(). These exist because the
-- anon key is public and the update rule only ever moves a record the
-- improving way: without a clamp, one POST of 2147483647 owns a board forever
-- with no revert path. They are deliberately loose — they reject the
-- impossible, not the improbable, so a genuinely brilliant run still counts.
-- Nullable, so the four-column INSERT above keeps working for a new game.
alter table game_config add column if not exists min_score int;
alter table game_config add column if not exists max_score int;

update game_config c
   set min_score = v.lo, max_score = v.hi
  from (values
    -- points, higher wins: the cap is the only side that matters here
    ('bubble-tap',          0,  10000000),
    -- milliseconds
    ('honeycomb',        1000,   3600000),
    ('flip-it',           500,   3600000),
    -- counts
    ('slide-n-order',       1,    100000),
    ('word-steps',          1,       200),
    -- 32 marbles on the board, and a perfect game leaves 1
    ('marble-nostalgia',    1,        32)
  ) as v(slug, lo, hi)
 where c.game_slug = v.slug;

alter table game_config enable row level security;

-- `create policy` has no `if not exists` before PG15, so every policy in this
-- file is dropped first. Without this the file claims to be re-runnable and
-- then fails on its second run.
drop policy if exists "allow read" on game_config;
create policy "allow read" on game_config
  for select using (true);

revoke insert, update, delete on game_config from anon, authenticated;


-- ============================================================
-- 2. Players
-- ============================================================

-- A player is a UUID the browser made up for itself and kept in
-- localStorage. That is the whole identity model: no account, no password, no
-- magic link, no sign-in.
--
-- `name` is NOT unique. Enforcing that would make "name taken" the first
-- thing a player sees at the exact moment they finally cared about the board,
-- and the research is blunt about it being the most demoralising error in
-- this flow. Uniqueness that matters is enforced somewhere useful instead:
-- one player_id per player, and one run_id per finished run (section 5).
--
-- `name` is nullable because the score is written BEFORE the name exists —
-- the end card shows your row already ranked, with a cursor blinking in the
-- name column.
create table if not exists players (
  player_id        uuid primary key,
  -- player_id is public: it is on every board row, so it cannot also be the
  -- thing that authorises a rename. This second UUID, generated by the same
  -- browser and never readable back, is what stops anyone renaming or
  -- deleting anyone else.
  write_token      uuid not null,
  name             text,
  email            text,
  notify_displaced boolean not null default true,
  notify_streak    boolean not null default false,
  tz               text,
  -- Moderation: with this set, save_player() refuses to write a name. Clear
  -- the name to remove it from every board at once without touching a score.
  blocked          boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint players_name_shape check (
    name is null or (
      char_length(name) between 1 and 12
      and name = btrim(name)
      and name ~ '^[[:alnum:] _''-]+$'
    )
  ),
  constraint players_email_shape check (
    email is null or (
      char_length(email) <= 254
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    )
  ),
  constraint players_tz_shape check (tz is null or char_length(tz) <= 64)
);

alter table players enable row level security;

drop policy if exists "allow read" on players;
create policy "allow read" on players
  for select using (true);

-- This is what makes storing an email safe next to a public anon key: the
-- column is not merely policy-protected, it is not granted. `select=email`
-- is a 403 and `select=*` cannot return it, for every browser, always.
-- Same for the notification preferences, the timezone and the write token.
revoke all on players from anon, authenticated;
grant select (player_id, name, created_at) on players to anon, authenticated;


-- ============================================================
-- 3. The boards
-- ============================================================

-- One row per player per board — NOT one row per run.
--
-- This is the load-bearing decision in the whole file. It means replaying a
-- game cannot fill a board with one name, it makes "ties are broken by
-- whoever posted first" a property of the surviving row, and it bounds this
-- table at players x games x 3 instead of growing with every submission. An
-- append-only run log is the one shape here that would let anyone inflate the
-- database for the price of a POST, and nothing in the design needs it: "out
-- of 214" is a count over the board.
--
-- period_kind is the same three boards for every game, including word-steps.
create table if not exists game_leaders (
  game_slug   text not null references game_config (game_slug) on delete cascade,
  period_kind text not null check (period_kind in ('day', 'week', 'all')),
  -- 'YYYY-MM-DD' for a day, ISO 'IYYY-Www' for a week, 'all' for all time.
  -- Always derived server-side, by period_keys().
  period_key  text not null,
  player_id   uuid not null references players (player_id) on delete cascade,
  -- Per-game bounds cannot be a table CHECK (no subqueries), so they are
  -- enforced in submit_game_run(). This closes the negative-score hole
  -- structurally, which is the one that wins every lower-is-better game.
  best_score  int  not null check (best_score >= 0),
  achieved_at timestamptz not null default now(),
  primary key (game_slug, period_kind, period_key, player_id)
);

alter table game_leaders enable row level security;

drop policy if exists "allow read" on game_leaders;
create policy "allow read" on game_leaders
  for select using (true);

revoke insert, update, delete on game_leaders from anon, authenticated;
grant select on game_leaders to anon, authenticated;

-- Serves the board read, the rank count and the prune, in both directions: a
-- btree scans backwards, so higher-is-better needs no second index.
create index if not exists game_leaders_board_idx
  on game_leaders (game_slug, period_kind, period_key, best_score, achieved_at);

-- For the cascade when a player deletes their data.
create index if not exists game_leaders_player_idx
  on game_leaders (player_id);


-- ============================================================
-- 4. The game-wide record
-- ============================================================

-- Unchanged from the pre-arcade shape, on purpose: this is what the homepage
-- wall and fetchAllBests() read, and `period` keeps exactly the semantics it
-- had ('all', or the day for a daily game). The arcade boards live in
-- game_leaders; this stays the one-line-per-game record.
--
-- Both are maintained by submit_game_run() in the same transaction, so they
-- cannot disagree.
create table if not exists game_scores (
  game_slug  text not null references game_config (game_slug),
  period     text not null,
  best_score int  not null,
  updated_at timestamptz not null default now(),
  primary key (game_slug, period)
);

-- Additive and nullable, so the deployed
-- `select=game_slug,best_score,period,updated_at` keeps working untouched and
-- the wall can name the holder whenever the client is ready.
alter table game_scores
  add column if not exists player_id uuid references players (player_id) on delete set null;

alter table game_scores enable row level security;

drop policy if exists "allow read" on game_scores;
create policy "allow read" on game_scores
  for select using (true);

revoke insert, update, delete on game_scores from anon, authenticated;

create index if not exists game_scores_slug_idx on game_scores (game_slug);


-- ============================================================
-- 5. Throttling and submission idempotency
-- ============================================================

-- Token buckets, keyed by hashed IP and by player_id. Not readable by anyone.
create table if not exists submit_limits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 1
);

alter table submit_limits enable row level security;
-- RLS on with no policy at all: deny by default. The security-definer
-- functions below run as the owner and bypass it.
revoke all on submit_limits from anon, authenticated;

-- One row per finished run, so the same run cannot be counted twice.
--
-- This is not paranoia: submitScore() posts with `keepalive` at game over,
-- and the design's own error copy promises a retry ("your score is safe on
-- this device and will go up next time"), so a duplicate arrival is the
-- normal case, not the exceptional one. Without this, one run could spend
-- another player's rate budget and inflate every "out of N" count.
--
-- run_id is generated by the browser once per finished run. Pruned after a
-- week, so this stays bounded by the rate limits, not by traffic.
create table if not exists submitted_runs (
  run_id     uuid primary key,
  created_at timestamptz not null default now()
);

alter table submitted_runs enable row level security;
revoke all on submitted_runs from anon, authenticated;

create index if not exists submitted_runs_created_idx on submitted_runs (created_at);


-- ============================================================
-- 6. Internal helpers
-- ============================================================

-- The caller's IP, hashed. Salted because an unsalted md5 of an IPv4 address
-- is a 4-billion-entry rainbow table, i.e. not a hash at all.
--
-- Set the salt once per project, outside this file:
--   alter database postgres set app.ip_salt = '<a long random string>';
-- It must NOT be named SUPABASE_*_SECRET / _SERVICE / _JWT / _PASSWORD or
-- POSTGRES_*: vite.config.js hard-fails the build if any of those appear in
-- the build environment (ARCHITECTURE.md §35).
create or replace function client_ip_hash()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select md5(
    coalesce(
      split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
      'unknown'
    ) || coalesce(current_setting('app.ip_salt', true), 'unsalted')
  );
$$;

-- A token bucket in one statement, so concurrent callers cannot race past it.
create or replace function rate_ok(p_bucket text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits int;
begin
  insert into submit_limits (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    set hits = case
                 when submit_limits.window_start < now() - p_window then 1
                 else submit_limits.hits + 1
               end,
        window_start = case
                         when submit_limits.window_start < now() - p_window then now()
                         else submit_limits.window_start
                       end
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- The three boards a single run belongs to.
--
-- "Today resets at midnight in your timezone. This week resets Monday." The
-- day comes from the player's local date (clamped by the caller); ISO weeks
-- start Monday by definition, so `IYYY-Www` needs no timezone of its own.
create or replace function period_keys(p_day date)
returns table (period_kind text, period_key text)
language sql
stable
as $$
  select 'day'::text,  to_char(p_day, 'YYYY-MM-DD')::text
  union all
  select 'week'::text, to_char(p_day, 'IYYY-"W"IW')::text
  union all
  select 'all'::text,  'all'::text;
$$;

revoke execute on function client_ip_hash() from public;
revoke execute on function rate_ok(text, int, interval) from public;
revoke execute on function period_keys(date) from public;


-- ============================================================
-- 7. Reading a player's standing
-- ============================================================

-- Rank, the size of the board, your score, and the score immediately ahead.
-- The one read that cannot be a plain PostgREST query, because rank and count
-- are not columns.
--
-- The boards themselves ARE a plain query — game_leaders has a public read
-- policy and a foreign key to players, so
--   /rest/v1/game_leaders?game_slug=eq.flip-it&period_kind=eq.day
--     &period_key=eq.2026-09-07&select=best_score,achieved_at,players(name)
--     &order=best_score.asc,achieved_at.asc&limit=10
-- is the top ten with names, and needs no function here.
create or replace function my_standing(
  p_slug        text,
  p_period_kind text,
  p_day         date default null,
  p_player_id   uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cfg     game_config;
  v_key   text;
  v_total int;
  v_your  int;
  v_at    timestamptz;
  v_rank  int;
  v_above int;
begin
  select * into cfg from game_config where game_slug = p_slug;
  if not found or p_period_kind not in ('day', 'week', 'all') then
    return null;
  end if;

  select k.period_key into v_key
    from period_keys(coalesce(p_day, current_date)) k
   where k.period_kind = p_period_kind;

  select count(*) into v_total
    from game_leaders
   where game_slug = p_slug and period_kind = p_period_kind and period_key = v_key;

  if p_player_id is not null then
    select best_score, achieved_at into v_your, v_at
      from game_leaders
     where game_slug = p_slug and period_kind = p_period_kind
       and period_key = v_key and player_id = p_player_id;
  end if;

  if v_your is null then
    return json_build_object(
      'period_key', v_key, 'total', v_total,
      'your_best', null, 'rank', null, 'above', null);
  end if;

  -- Rank is "how many rows beat you, plus one". Ties go to whoever posted
  -- first, in both directions — that is a house rule, not a side effect.
  select count(*) + 1 into v_rank
    from game_leaders g
   where g.game_slug = p_slug and g.period_kind = p_period_kind
     and g.period_key = v_key
     and (
       case when cfg.lower_is_better
            then g.best_score < v_your
            else g.best_score > v_your
       end
       or (g.best_score = v_your and g.achieved_at < v_at)
     );

  -- The score one place ahead, for "Nanna June is 3 seconds ahead."
  if v_rank > 1 then
    if cfg.lower_is_better then
      select best_score into v_above from game_leaders
       where game_slug = p_slug and period_kind = p_period_kind and period_key = v_key
       order by best_score asc, achieved_at asc
       offset v_rank - 2 limit 1;
    else
      select best_score into v_above from game_leaders
       where game_slug = p_slug and period_kind = p_period_kind and period_key = v_key
       order by best_score desc, achieved_at asc
       offset v_rank - 2 limit 1;
    end if;
  end if;

  return json_build_object(
    'period_key', v_key, 'total', v_total,
    'your_best', v_your, 'rank', v_rank, 'above', v_above);
end;
$$;


-- ============================================================
-- 8. The only write path for a score
-- ============================================================

-- Records a finished run: it updates the game-wide record, and — when the
-- browser sent a player_id — its owner's row on all three boards, each moving
-- only in the improving direction.
--
-- p_day exists only because a daily game picks its puzzle from the player's
-- LOCAL date, while the server runs in UTC: without it, someone in UTC+13
-- playing tomorrow's puzzle would have their score filed under today and
-- compared against a different puzzle. It is clamped to one day either side of
-- the server's date, so it fixes the timezone skew without letting a client
-- write into an arbitrary day.
--
-- A duplicate, a throttled caller and an implausible number are all treated
-- the same way: nothing is written, and the current numbers are returned
-- anyway. This function must not raise for them. Both call sites use a bare
-- .then() inside their game-over handler, so an error here would cost the
-- player their overlay, share button and replay control (ARCHITECTURE.md §27).
-- A game with no game_config row still raises, because that is a wiring
-- mistake and should be loud.
create or replace function submit_game_run(
  p_slug        text,
  p_score       int,
  p_day         date default null,
  p_player_id   uuid default null,
  p_write_token uuid default null,
  p_run_id      uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg      game_config;
  v_day    date;
  v_period text;
  v_rows   int;
  v_ok     boolean := true;
  v_best   int;
  v_stand  json;
begin
  select * into cfg from game_config where game_slug = p_slug;
  if not found then
    raise exception 'no leaderboard configured for game %', p_slug
      using errcode = 'no_data_found';
  end if;

  v_day := coalesce(
    case
      when p_day between current_date - 1 and current_date + 1 then p_day
      else current_date
    end,
    current_date
  );

  -- The order of these three checks is the whole point, so do not reshuffle
  -- them: each one must be cheaper than the one after it, and nothing may
  -- write to a table before the throttle has had its say.

  -- 1. Plausibility. Free, and no writes. `p_score is null` is checked here
  --    rather than left to the NOT NULL column, because a null would compare
  --    as null, fall through every guard below, and raise on insert.
  if p_score is null
     or p_score < coalesce(cfg.min_score, 0)
     or p_score > coalesce(cfg.max_score, 2147483647) then
    v_ok := false;
  end if;

  -- 2. Throttle, before touching any table. The IP bucket is checked first so
  --    a throttled caller does not also burn the per-player bucket.
  if v_ok and not rate_ok('ip:' || client_ip_hash(), 30, interval '1 minute') then
    v_ok := false;
  end if;

  if v_ok and p_player_id is not null
     and not rate_ok('pid:' || p_player_id::text, 20, interval '1 minute') then
    v_ok := false;
  end if;

  -- 3. Only now deduplicate. Doing this first reads better — a resend would
  --    cost one index probe — but it would mean an unthrottled INSERT: every
  --    request carrying a fresh run_id would add a row before anything
  --    checked whether it was allowed to, which is an append-only table
  --    growing at request rate. submit_limits has bounded cardinality (one
  --    row per IP per window); submitted_runs does not.
  if v_ok and p_run_id is not null then
    insert into submitted_runs (run_id) values (p_run_id)
      on conflict (run_id) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      v_ok := false;
    end if;
  end if;

  if v_ok then
    -- The player row comes first: the record below carries a foreign key to
    -- it, so writing the record first fails on a player's very first run.
    --
    -- The token is the browser's own, so the same browser can rename itself
    -- later. Inventing one here would create a row nobody can ever claim.
    if p_player_id is not null then
      insert into players (player_id, write_token)
      values (p_player_id, coalesce(p_write_token, gen_random_uuid()))
      on conflict (player_id) do nothing;
    end if;

    -- The game-wide record. Period semantics unchanged from the pre-arcade
    -- shape, because the deployed homepage still reads this table.
    v_period := case when cfg.is_daily then v_day::text else 'all' end;

    insert into game_scores (game_slug, period, best_score, player_id)
    values (p_slug, v_period, p_score, p_player_id)
    on conflict (game_slug, period) do update
      set best_score = excluded.best_score,
          player_id  = excluded.player_id,
          updated_at = now()
      where case
              when cfg.lower_is_better then excluded.best_score < game_scores.best_score
              else excluded.best_score > game_scores.best_score
            end;

    -- The boards. No player_id means a pre-arcade client, which still moves
    -- the record and simply does not appear on a board.
    if p_player_id is not null then
      insert into game_leaders (game_slug, period_kind, period_key, player_id, best_score)
      select p_slug, k.period_kind, k.period_key, p_player_id, p_score
        from period_keys(v_day) k
      on conflict (game_slug, period_kind, period_key, player_id) do update
        set best_score  = excluded.best_score,
            achieved_at = now()
        where case
                when cfg.lower_is_better then excluded.best_score < game_leaders.best_score
                else excluded.best_score > game_leaders.best_score
              end;
    end if;
  end if;

  select best_score into v_best from game_scores
   where game_slug = p_slug
     and period = case when cfg.is_daily then v_day::text else 'all' end;

  v_stand := my_standing(p_slug, 'day', v_day, p_player_id);

  return json_build_object(
    'best',      v_best,
    'accepted',  v_ok,
    'your_best', v_stand -> 'your_best',
    'rank',      v_stand -> 'rank',
    'total',     v_stand -> 'total',
    'above',     v_stand -> 'above'
  );
end;
$$;

-- The pre-arcade signature, kept so the currently deployed client keeps
-- working through the rollout: it still takes three arguments and still
-- returns a bare number. Delete it once no deployed page calls it.
create or replace function submit_game_score(
  p_slug  text,
  p_score int,
  p_day   date default null
)
returns int
language sql
security definer
set search_path = public
as $$
  select (submit_game_run(p_slug, p_score, p_day, null, null, null) ->> 'best')::int;
$$;


-- ============================================================
-- 9. Name, email and preferences
-- ============================================================

-- Everything the player can choose about themselves, in one call. Every field
-- is optional; a null argument leaves that field alone, and '' clears a name.
--
-- Returns false rather than raising on a bad name, a bad email, a wrong token
-- or a throttled caller: this is called from an end card, and a rejected
-- rename must not take the overlay down with it.
create or replace function save_player(
  p_player_id        uuid,
  p_write_token      uuid,
  p_name             text default null,
  p_email            text default null,
  p_notify_displaced boolean default null,
  p_notify_streak    boolean default null,
  p_tz               text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    players;
  v_name   text;
  v_email  text;
begin
  if p_player_id is null or p_write_token is null then
    return false;
  end if;
  if not rate_ok('save:' || client_ip_hash(), 20, interval '1 minute') then
    return false;
  end if;

  select * into v_row from players where player_id = p_player_id;

  if not found then
    insert into players (player_id, write_token)
    values (p_player_id, p_write_token)
    on conflict (player_id) do nothing;
    select * into v_row from players where player_id = p_player_id;
  end if;

  -- Fail closed. A missing row leaves write_token null, and `null <> x` is
  -- null, which IF treats as false — i.e. it would fall straight through.
  if v_row.player_id is null or v_row.write_token is distinct from p_write_token then
    return false;
  end if;

  if p_name is not null then
    if v_row.blocked then
      return false;
    end if;
    v_name := nullif(btrim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
    if v_name is not null
       and (char_length(v_name) > 12 or v_name !~ '^[[:alnum:] _''-]+$') then
      return false;
    end if;
    update players set name = v_name where player_id = p_player_id;
  end if;

  if p_email is not null then
    v_email := nullif(btrim(lower(p_email)), '');
    if v_email is not null
       and (char_length(v_email) > 254
            or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
      return false;
    end if;
    update players set email = v_email where player_id = p_player_id;
  end if;

  update players
     set notify_displaced = coalesce(p_notify_displaced, notify_displaced),
         notify_streak    = coalesce(p_notify_streak, notify_streak),
         tz               = coalesce(nullif(btrim(p_tz), ''), tz)
   where player_id = p_player_id;

  return true;
end;
$$;

-- "Delete my data". Removes the player and, by cascade, every board row they
-- hold. A game-wide record they happen to own survives as a number with no
-- holder, which is the honest outcome: the score was real, the name is gone.
create or replace function delete_player(
  p_player_id   uuid,
  p_write_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if p_player_id is null or p_write_token is null then
    return false;
  end if;
  if not rate_ok('del:' || client_ip_hash(), 10, interval '1 minute') then
    return false;
  end if;

  select write_token into v_token from players where player_id = p_player_id;
  if v_token is null or v_token <> p_write_token then
    return false;
  end if;

  delete from players where player_id = p_player_id;
  return true;
end;
$$;


-- ============================================================
-- 10. Grants
-- ============================================================

revoke execute on function submit_game_run(text, int, date, uuid, uuid, uuid) from public;
revoke execute on function submit_game_score(text, int, date) from public;
revoke execute on function my_standing(text, text, date, uuid) from public;
revoke execute on function save_player(uuid, uuid, text, text, boolean, boolean, text) from public;
revoke execute on function delete_player(uuid, uuid) from public;

grant execute on function submit_game_run(text, int, date, uuid, uuid, uuid) to anon, authenticated;
grant execute on function submit_game_score(text, int, date) to anon, authenticated;
grant execute on function my_standing(text, text, date, uuid) to anon, authenticated;
grant execute on function save_player(uuid, uuid, text, text, boolean, boolean, text) to anon, authenticated;
grant execute on function delete_player(uuid, uuid) to anon, authenticated;

-- A read that takes three seconds is either a mistake or an attack; either
-- way the browser gave up on it after four (leaderboard.js TIMEOUT_MS).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter role anon set statement_timeout = ''3s''';
  end if;
end $$;


-- ============================================================
-- 11. Keeping it bounded
-- ============================================================

-- The boards grow with players, not submissions, but "players" is still
-- unbounded over years and a day board from last April is dead weight.
create or replace function prune_leaderboards()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from submit_limits where window_start < now() - interval '1 day';
  delete from submitted_runs where created_at < now() - interval '7 days';

  -- Day boards older than 90 days. period_key is 'YYYY-MM-DD' here.
  delete from game_leaders
   where period_kind = 'day'
     and period_key < to_char(current_date - 90, 'YYYY-MM-DD');

  -- Week boards older than a year. 'IYYY-Www' is fixed-width and zero-padded,
  -- so a text comparison is a date comparison.
  delete from game_leaders
   where period_kind = 'week'
     and period_key < to_char(current_date - 365, 'IYYY-"W"IW');

  -- Nobody reads past the top 200 of any board, and keeping the tail is what
  -- would let a crowd of one-run players grow this table without limit.
  delete from game_leaders g
   using (
     select l.game_slug, l.period_kind, l.period_key, l.player_id,
            row_number() over (
              partition by l.game_slug, l.period_kind, l.period_key
              order by
                case when c.lower_is_better then l.best_score end asc,
                case when not c.lower_is_better then l.best_score end desc,
                l.achieved_at asc
            ) as rn
       from game_leaders l
       join game_config c on c.game_slug = l.game_slug
   ) r
   where r.rn > 200
     and g.game_slug = r.game_slug
     and g.period_kind = r.period_kind
     and g.period_key = r.period_key
     and g.player_id = r.player_id;

  -- Players who hold no board row and left no email are just a UUID.
  delete from players p
   where p.email is null
     and p.created_at < now() - interval '30 days'
     and not exists (select 1 from game_leaders g where g.player_id = p.player_id);
end;
$$;

revoke execute on function prune_leaderboards() from public;

-- pg_cron is not enabled in every project, and this file must still run where
-- it is not. Enable it under Database > Extensions, then re-run.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('prune-leaderboards')
      where exists (select 1 from cron.job where jobname = 'prune-leaderboards');
    perform cron.schedule('prune-leaderboards', '17 4 * * *',
                          'select prune_leaderboards()');
  else
    raise notice 'pg_cron is not enabled: prune_leaderboards() will not run on a schedule.';
  end if;
end $$;


-- ============================================================
-- 12. Carry over the old records, then retire the old shape
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
