-- ============================================================================
-- Sprint 2: gameweek + fixture schema (S2-07)
--
-- Reference data ingested from the FPL feed (see
-- scripts/s2-07-ingest-fixtures.ts) — the same free, unauthenticated provider
-- S2-08a proved out for player stats. Both tables are read-only to clients;
-- only the ingestion script (running with the service_role key) writes here.
-- ============================================================================

create table if not exists public.gameweek (
  id smallint primary key,
  competition_id smallint not null references public.competition (id),
  -- FPL's own event id already IS the season's sequential gameweek number
  -- (1..38), so number == id for this single-competition feed. Kept as its
  -- own column per spec rather than collapsed into id, in case a second
  -- competition with its own numbering is ever added.
  number smallint not null,
  deadline_at timestamptz not null,
  is_current boolean not null default false
);

-- Enforce "exactly one gameweek is current" at the DB level rather than
-- trusting the feed to never send two.
create unique index if not exists gameweek_single_current_idx
  on public.gameweek (is_current)
  where is_current;

alter table public.gameweek enable row level security;

drop policy if exists "Anyone can see gameweeks" on public.gameweek;

create policy "Anyone can see gameweeks"
  on public.gameweek
  for select
  to authenticated
  using (true);


create or replace function public.current_gameweek()
returns public.gameweek
language sql
stable
as $$
  select * from public.gameweek where is_current limit 1;
$$;


-- home_club_id / away_club_id point at public.club, the crosswalk between
-- FPL (fixtures) and football-data.org (players), so a fixture can be joined
-- to the players in it. The ingestion script resolves FPL team ids to clubs.
create table if not exists public.fixture (
  id integer primary key,
  gameweek_id smallint references public.gameweek (id),
  home_club_id integer not null references public.club (id),
  away_club_id integer not null references public.club (id),
  kickoff_at timestamptz,
  home_score smallint,
  away_score smallint,
  status text not null check (status in ('UPCOMING', 'LIVE', 'COMPLETED'))
);

create index if not exists fixture_gameweek_id_idx
  on public.fixture (gameweek_id);

alter table public.fixture enable row level security;

drop policy if exists "Anyone can see fixtures" on public.fixture;

create policy "Anyone can see fixtures"
  on public.fixture
  for select
  to authenticated
  using (true);


-- New tables get no DML grants by default on current Supabase (see
-- 20260923091000_grant_table_privileges_to_authenticated.sql).
grant select on public.gameweek to authenticated;
grant select on public.fixture to authenticated;
grant all on public.gameweek to service_role;
grant all on public.fixture to service_role;
