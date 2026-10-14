-- teams.league_id and drafted_players.team_id were created without ON DELETE
-- CASCADE in 20260917201209. The live tables predate that migration (its
-- `create table if not exists` was a no-op there) and already cascade, so
-- deleting a league or a team works on live but fails with an FK violation
-- on a fresh `supabase db reset`. Recreate both constraints to match live.
--
-- Deleting a league now removes its teams and their drafted_players, which
-- delete_league, kick_league_member and leave_league all rely on.

alter table public.teams
  drop constraint if exists teams_league_id_fkey,
  add constraint teams_league_id_fkey
    foreign key (league_id) references public.league (id) on delete cascade;

alter table public.drafted_players
  drop constraint if exists drafted_players_team_id_fkey,
  add constraint drafted_players_team_id_fkey
    foreign key (team_id) references public.teams (id) on delete cascade;
