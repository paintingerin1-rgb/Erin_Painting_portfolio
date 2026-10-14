-- Every league member needs a fantasy team (A9: exactly one per user per
-- league) before the Draft and Squad pages have anything to show. Client-side
-- creation was removed in 395f7bd, which left nothing on master creating a
-- teams row at all - every signed-in user saw "You need to Create or Join a
-- league first!" on /draft, even after joining.
--
-- A trigger on league_member covers every join path at once: the commissioner
-- row that handle_new_league() inserts (create_league RPC), join_league_by_code,
-- and the direct public-league insert. It relies on
-- teams_league_id_user_id_key (20260922140000) for ON CONFLICT.

create function public.handle_new_league_member()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.teams (league_id, user_id, team_name)
  select new.league_id, new.user_id, p.username || '''s XI'
  from public.profile p
  where p.id = new.user_id
  on conflict (league_id, user_id) do nothing;
  return new;
end;
$$;

-- Trigger function only: never called directly, so nobody needs EXECUTE.
revoke execute on function public.handle_new_league_member() from public, anon, authenticated;

create trigger after_league_member_insert
  after insert on public.league_member
  for each row execute procedure public.handle_new_league_member();

-- Backfill members who joined while nothing was creating teams.
insert into public.teams (league_id, user_id, team_name)
select lm.league_id, lm.user_id, p.username || '''s XI'
from public.league_member lm
join public.profile p on p.id = lm.user_id
on conflict (league_id, user_id) do nothing;
