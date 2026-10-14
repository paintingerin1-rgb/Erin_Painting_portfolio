-- ============================================================================
-- Sprint 2: drafting / squads
--
-- These tables were originally created manually in the live Supabase project.
-- This migration makes them reproducible in a fresh database and hardens the
-- existing RLS policies.
--
-- The migration is intentionally idempotent:
--   - CREATE TABLE IF NOT EXISTS
--   - DROP POLICY IF EXISTS before every CREATE POLICY
--   - CREATE INDEX IF NOT EXISTS
--   - constraints are checked before being added
-- ============================================================================


-- ============================================================================
-- teams
-- ============================================================================

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  league_id bigint references public.league (id),
  user_id uuid references public.profile (id),
  team_name text not null,
  remaining_budget numeric not null default 100.00,
  created_at timestamptz default timezone('utc'::text, now()),
  is_draft_complete boolean default false
);

-- The live table already exists with id as its primary key. Ensure the
-- expected defaults/column constraints are present without recreating it.
alter table public.teams
  alter column id set default gen_random_uuid();

alter table public.teams
  alter column team_name set not null;

alter table public.teams
  alter column remaining_budget set default 100.00;

alter table public.teams
  alter column remaining_budget set not null;

alter table public.teams
  alter column created_at set default timezone('utc'::text, now());

alter table public.teams
  alter column is_draft_complete set default false;

-- A user can have at most one team in a league.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.teams'::regclass
      and contype = 'u'
      and (
        conkey = array[
          (select attnum
           from pg_attribute
           where attrelid = 'public.teams'::regclass
             and attname = 'league_id'),
          (select attnum
           from pg_attribute
           where attrelid = 'public.teams'::regclass
             and attname = 'user_id')
        ]::smallint[]
      )
  ) then
    alter table public.teams
      add constraint teams_league_id_user_id_key
      unique (league_id, user_id);
  end if;
end
$$;

alter table public.teams enable row level security;


-- ============================================================================
-- football_players
-- ============================================================================

create table if not exists public.football_players (
  id integer primary key,
  name text not null,
  position text,
  real_team text,
  price numeric not null default 5.00
);

alter table public.football_players
  alter column name set not null;

alter table public.football_players
  alter column price set default 5.00;

alter table public.football_players
  alter column price set not null;

alter table public.football_players enable row level security;


-- ============================================================================
-- drafted_players
-- ============================================================================

create table if not exists public.drafted_players (
  id uuid not null default gen_random_uuid(),
  team_id uuid references public.teams (id),
  player_id integer references public.football_players (id),
  draft_price numeric not null,
  drafted_at timestamptz default timezone('utc'::text, now())
);

alter table public.drafted_players
  alter column id set default gen_random_uuid();

alter table public.drafted_players
  alter column draft_price set not null;

alter table public.drafted_players
  alter column drafted_at set default timezone('utc'::text, now());


-- The live table currently has id as its primary key. Replace that with the
-- required composite primary key (team_id, player_id).
--
-- A primary key requires both columns to be NOT NULL.
alter table public.drafted_players
  alter column team_id set not null;

alter table public.drafted_players
  alter column player_id set not null;

do $$
declare
  pk_name text;
begin
  select conname
    into pk_name
  from pg_constraint
  where conrelid = 'public.drafted_players'::regclass
    and contype = 'p';

  if pk_name is not null then
    execute format(
      'alter table public.drafted_players drop constraint %I',
      pk_name
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.drafted_players'::regclass
      and contype = 'p'
      and conkey = array[
        (select attnum
         from pg_attribute
         where attrelid = 'public.drafted_players'::regclass
           and attname = 'team_id'),
        (select attnum
         from pg_attribute
         where attrelid = 'public.drafted_players'::regclass
           and attname = 'player_id')
      ]::smallint[]
  ) then
    alter table public.drafted_players
      add constraint drafted_players_pkey
      primary key (team_id, player_id);
  end if;
end
$$;

alter table public.drafted_players enable row level security;


-- ============================================================================
-- Indexes
-- ============================================================================

create index if not exists drafted_players_team_id_idx
  on public.drafted_players (team_id);

create index if not exists teams_league_id_idx
  on public.teams (league_id);


-- ============================================================================
-- RLS policies: teams
-- ============================================================================

drop policy if exists "Anyone can see teams"
  on public.teams;

create policy "Anyone can see teams"
  on public.teams
  for select
  to authenticated
  using (true);


drop policy if exists "Users can create their own team"
  on public.teams;

create policy "Users can create their own team"
  on public.teams
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
  );


drop policy if exists "Users can update their own team"
  on public.teams;

create policy "Users can update their own team"
  on public.teams
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
  )
  with check (
    user_id = (select auth.uid())
  );


-- ============================================================================
-- RLS policies: football_players
-- ============================================================================

drop policy if exists "Anyone can see players"
  on public.football_players;

create policy "Anyone can see players"
  on public.football_players
  for select
  to authenticated
  using (true);


-- ============================================================================
-- RLS policies: drafted_players
-- ============================================================================

drop policy if exists "Anyone can see drafted players"
  on public.drafted_players;

create policy "Anyone can see drafted players"
  on public.drafted_players
  for select
  to authenticated
  using (true);


drop policy if exists "Users can draft players for their own team"
  on public.drafted_players;

create policy "Users can draft players for their own team"
  on public.drafted_players
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.teams t
      where t.id = drafted_players.team_id
        and t.user_id = (select auth.uid())
    )
  );


drop policy if exists "Enable delete for users"
  on public.drafted_players;

drop policy if exists "Users can delete players from their own team"
  on public.drafted_players;

create policy "Users can delete players from their own team"
  on public.drafted_players
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.teams t
      where t.id = drafted_players.team_id
        and t.user_id = (select auth.uid())
    )
  );
