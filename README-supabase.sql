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
