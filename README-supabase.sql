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
-- Same pattern as above, in its own table/function so it never collides with
-- bubble-tap's global_score row.

create table if not exists honeycomb_global_score (
  id int primary key default 1,
  score int not null default 0,
  updated_at timestamptz not null default now()
);

insert into honeycomb_global_score (id, score)
values (1, 0)
on conflict (id) do nothing;

alter table honeycomb_global_score enable row level security;

create policy "allow read" on honeycomb_global_score
  for select using (true);

revoke insert, update, delete on honeycomb_global_score from anon, authenticated;

create or replace function submit_honeycomb_score(new_score int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  current_best int;
begin
  update honeycomb_global_score
    set score = new_score, updated_at = now()
    where id = 1 and new_score > score;

  select score into current_best from honeycomb_global_score where id = 1;
  return current_best;
end;
$$;

grant execute on function submit_honeycomb_score(int) to anon, authenticated;
