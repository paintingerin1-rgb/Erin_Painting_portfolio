-- ============================================================================
-- club: one row per real club, and the crosswalk between the two providers.
--
-- football_players comes from football-data.org (S2-06); fixtures and match
-- stats come from the FPL API (S2-07, S2-08b). The two name clubs differently
-- ("Arsenal" vs "ARS") and use unrelated ids, so nothing could join a player
-- to a fixture. This table is the one place both providers resolve to.
--
-- id is football-data.org's team id, matching football_players.id, which is
-- football-data.org's player id. The player ingestion script upserts these rows
-- itself, so a newly promoted club appears on its next run rather than failing
-- the player insert.
--
-- fpl_team_id is filled by the FPL fixture ingestion, matched on short_code
-- (FPL short_name vs football-data.org tla). It stays null for a club whose
-- codes differ between providers until someone sets it by hand; that club's
-- fixtures are skipped with a logged warning in the meantime.
-- ============================================================================

create table if not exists public.club (
  id integer primary key,
  name text not null,
  short_code text not null unique,
  fpl_team_id smallint unique
);

alter table public.club enable row level security;

drop policy if exists "Anyone can see clubs" on public.club;

create policy "Anyone can see clubs"
  on public.club
  for select
  to authenticated
  using (true);

grant select on public.club to authenticated;
grant all on public.club to service_role;


-- Nullable: rows loaded before this migration have no club until the player
-- ingestion script is re-run, which fills it in (it upserts on id).
alter table public.football_players
  add column if not exists club_id integer references public.club (id);

create index if not exists football_players_club_id_idx
  on public.football_players (club_id);
