-- Run this once in your Supabase project's SQL editor (Project > SQL Editor > New query).
-- It creates a single shared row holding the all-time global high score, and a
-- function that's the only way to raise it — direct table writes are locked down.

create table if not exists global_score (
  id int primary key default 1,
  score int not null default 0,
  updated_at timestamptz not null default now()
);

insert into global_score (id, score)
values (1, 0)
on conflict (id) do nothing;

alter table global_score enable row level security;

-- anyone can read the current global best
create policy "allow read" on global_score
  for select using (true);

-- no direct inserts/updates/deletes from clients — only via submit_score() below
revoke insert, update, delete on global_score from anon, authenticated;

-- atomically raises the score only if it's higher than the current record,
-- and always returns the current best (whether it changed or not)
create or replace function submit_score(new_score int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  current_best int;
begin
  update global_score
    set score = new_score, updated_at = now()
    where id = 1 and new_score > score;

  select score into current_best from global_score where id = 1;
  return current_best;
end;
$$;

grant execute on function submit_score(int) to anon, authenticated;

-- ==== Honeycomb ====
-- Scored by completion time, not move count — lower is better, so this is a
-- "lower the record" function instead of the "raise the record" pattern above.
-- Replaces the old move-count leaderboard: run this to drop that table/function
-- and start a fresh (empty) time leaderboard.

drop function if exists submit_honeycomb_score(int);
drop table if exists honeycomb_global_score;

create table if not exists honeycomb_global_best (
  id int primary key default 1,
  best_ms int, -- null until the first completed run ever submits a time
  updated_at timestamptz not null default now()
);

insert into honeycomb_global_best (id, best_ms)
values (1, null)
on conflict (id) do nothing;

alter table honeycomb_global_best enable row level security;

create policy "allow read" on honeycomb_global_best
  for select using (true);

revoke insert, update, delete on honeycomb_global_best from anon, authenticated;

-- atomically lowers best_ms only if it's faster than the current record (or
-- there is no record yet), and always returns the current global best.
create or replace function submit_honeycomb_time(new_time_ms int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  current_best int;
begin
  update honeycomb_global_best
    set best_ms = new_time_ms, updated_at = now()
    where id = 1 and (best_ms is null or new_time_ms < best_ms);

  select best_ms into current_best from honeycomb_global_best where id = 1;
  return current_best;
end;
$$;

grant execute on function submit_honeycomb_time(int) to anon, authenticated;
