-- ============================================================================
-- Multi-league data (#44)
--
-- Until now every table assumed one competition, the Premier League:
--   - gameweek.id is the FPL event number (1-38), so gameweek 1 of a second
--     league would collide with the Premier League's;
--   - gameweek_single_current_idx allows one current gameweek in the whole DB;
--   - club.short_code is unique across every league, but codes clash between
--     leagues (FCB is Barcelona and Bayern, AJA is Auxerre and Ajax);
--   - club, football_players and fixture carry no competition at all.
--
-- This migration adds seven competitions next to the Premier League and makes
-- the competition explicit everywhere the app needs to filter by it.
--
-- Gameweek ids: the Premier League keeps 1-38 (no live data has to move).
-- Every other competition uses competition_id * 100 + number, e.g. LaLiga's
-- gameweek 3 is 203 when LaLiga is competition 2. See gameweekId() in
-- scripts/lib/competitions.ts, which every ingest script goes through.
--
-- Provider ids: clubs, players and fixtures from football-data.org keep their
-- football-data id as before. Rows that come from API-Football (all PSL data)
-- are stored as 1,000,000,000 + the API-Football id, so the two providers'
-- id spaces can never collide. Same helper module.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- competition
-- ----------------------------------------------------------------------------

alter table public.competition
  add column if not exists code text unique,
  add column if not exists country text,
  -- API-Football's league id: match stats for every competition except the
  -- Premier League, and squads + fixtures for the PSL.
  add column if not exists api_football_league_id integer unique,
  -- Where squads and fixtures come from. Stats come from the FPL API for the
  -- Premier League and from API-Football for everything else.
  add column if not exists data_source text not null default 'FOOTBALL_DATA'
    check (data_source in ('FOOTBALL_DATA', 'API_FOOTBALL'));

update public.competition
set code = 'PL', country = 'England', api_football_league_id = 39
where name = 'English Premier League' and code is null;

alter table public.competition alter column code set not null;

-- The `code` is football-data.org's competition code where it has one.
insert into public.competition (name, code, country, api_football_league_id, data_source)
values
  ('LaLiga',                'PD',  'Spain',        140, 'FOOTBALL_DATA'),
  ('Bundesliga',            'BL1', 'Germany',       78, 'FOOTBALL_DATA'),
  ('Serie A',               'SA',  'Italy',        135, 'FOOTBALL_DATA'),
  ('Ligue 1',               'FL1', 'France',        61, 'FOOTBALL_DATA'),
  ('Eredivisie',            'DED', 'Netherlands',   88, 'FOOTBALL_DATA'),
  ('Primeira Liga',         'PPL', 'Portugal',      94, 'FOOTBALL_DATA'),
  ('Betway Premiership',    'PSL', 'South Africa', 288, 'API_FOOTBALL')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- club
-- ----------------------------------------------------------------------------

alter table public.club
  add column if not exists competition_id smallint references public.competition (id),
  -- Filled by the API-Football stats ingest, the same way fpl_team_id is
  -- filled by the FPL fixture ingest.
  add column if not exists api_football_team_id integer unique;

update public.club
set competition_id = (select id from public.competition where code = 'PL')
where competition_id is null;

alter table public.club alter column competition_id set not null;

alter table public.club drop constraint if exists club_short_code_key;
alter table public.club drop constraint if exists club_competition_short_code_key;
alter table public.club
  add constraint club_competition_short_code_key unique (competition_id, short_code);

create index if not exists club_competition_id_idx on public.club (competition_id);

-- ----------------------------------------------------------------------------
-- football_players
-- ----------------------------------------------------------------------------

-- Denormalised from club so the draft room and Players page can filter with a
-- plain .eq(), and so a player with no club_id still belongs somewhere.
alter table public.football_players
  add column if not exists competition_id smallint references public.competition (id);

update public.football_players p
set competition_id = coalesce(
  (select c.competition_id from public.club c where c.id = p.club_id),
  (select id from public.competition where code = 'PL')
)
where p.competition_id is null;

alter table public.football_players alter column competition_id set not null;

create index if not exists football_players_competition_id_idx
  on public.football_players (competition_id);

-- ----------------------------------------------------------------------------
-- fixture
-- ----------------------------------------------------------------------------

alter table public.fixture
  add column if not exists competition_id smallint references public.competition (id);

update public.fixture
set competition_id = (select id from public.competition where code = 'PL')
where competition_id is null;

alter table public.fixture alter column competition_id set not null;

create index if not exists fixture_competition_id_idx on public.fixture (competition_id);

-- ----------------------------------------------------------------------------
-- gameweek
-- ----------------------------------------------------------------------------

alter table public.gameweek drop constraint if exists gameweek_competition_number_key;
alter table public.gameweek
  add constraint gameweek_competition_number_key unique (competition_id, number);

-- One current gameweek per competition, not one for the whole database.
drop index if exists public.gameweek_single_current_idx;
create unique index if not exists gameweek_current_per_competition_idx
  on public.gameweek (competition_id)
  where is_current;

-- current_gameweek() had no callers; it now needs to know which competition.
drop function if exists public.current_gameweek();

create or replace function public.current_gameweek(p_competition_id smallint)
returns public.gameweek
language sql
stable
as $$
  select * from public.gameweek
  where competition_id = p_competition_id and is_current
  limit 1;
$$;

revoke execute on function public.current_gameweek(smallint) from public, anon;
grant execute on function public.current_gameweek(smallint) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Drafting: a team can only draft players from its league's competition.
--
-- A trigger rather than another check inside draft_player(), so the rule also
-- holds for any future path that inserts into drafted_players.
-- ----------------------------------------------------------------------------

create or replace function public.check_drafted_player_competition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.teams t
    join public.league l on l.id = t.league_id
    join public.football_players p on p.id = new.player_id
    where t.id = new.team_id
      and p.competition_id = l.competition_id
  ) then
    raise exception 'That player does not play in this league''s competition.';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_drafted_player_competition() from public, anon, authenticated;

drop trigger if exists drafted_players_same_competition on public.drafted_players;
create trigger drafted_players_same_competition
  before insert on public.drafted_players
  for each row execute function public.check_drafted_player_competition();

-- ----------------------------------------------------------------------------
-- Standings: "this gameweek" is the current gameweek of the league's own
-- competition. Otherwise unchanged from 20260926150000.
-- ----------------------------------------------------------------------------

create or replace function public.league_standings(p_league_id bigint)
returns table (
  user_id uuid,
  username text,
  avatar_url text,
  team_name text,
  is_draft_complete boolean,
  gameweek_points integer,
  total_points integer,
  rank integer,
  previous_rank integer
)
language plpgsql
stable
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_current_gameweek smallint;
begin
  if not exists (
    select 1 from public.league_member lm
    where lm.league_id = p_league_id and lm.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this league.';
  end if;

  select g.id into v_current_gameweek
  from public.gameweek g
  join public.league l on l.competition_id = g.competition_id
  where l.id = p_league_id and g.is_current;

  return query
  with team_gameweek as (
    select dp.team_id, g.id as gameweek_id, sum(pgp.points)::integer as points
    from public.teams t
    join public.drafted_players dp on dp.team_id = t.id
    join public.player_gameweek_points pgp on pgp.player_id = dp.player_id
    join public.gameweek g
      on g.id = pgp.gameweek_id
     and g.deadline_at > dp.drafted_at
     and g.deadline_at <= now()
    where t.league_id = p_league_id
    group by dp.team_id, g.id
  ),
  totals as (
    select
      lm.user_id,
      p.username,
      p.avatar_url,
      t.team_name,
      coalesce(t.is_draft_complete, false) as is_draft_complete,
      coalesce(sum(tg.points) filter (where tg.gameweek_id = v_current_gameweek), 0)::integer
        as gameweek_points,
      coalesce(sum(tg.points), 0)::integer as total_points
    from public.league_member lm
    join public.profile p on p.id = lm.user_id
    left join public.teams t
      on t.league_id = lm.league_id and t.user_id = lm.user_id
    left join team_gameweek tg on tg.team_id = t.id
    where lm.league_id = p_league_id
    group by lm.user_id, p.username, p.avatar_url, t.team_name, t.is_draft_complete
  )
  select
    tt.user_id,
    tt.username,
    tt.avatar_url,
    tt.team_name,
    tt.is_draft_complete,
    tt.gameweek_points,
    tt.total_points,
    (rank() over (order by tt.total_points desc))::integer,
    case when v_current_gameweek is null then null
      else (rank() over (order by tt.total_points - tt.gameweek_points desc))::integer
    end
  from totals tt
  order by tt.total_points desc, tt.gameweek_points desc, tt.username;
end;
$$;
