-- ============================================================================
-- Sprint 2: scoring engine (S2-08b)
--
-- Raw per-player, per-gameweek stats live in player_gameweek_stats and are
-- never touched by the client (ingested by scripts/s2-08b-ingest-gameweek-stats.ts
-- with the service_role key). Points are NOT stored - they are derived on
-- read by player_gameweek_points via the immutable fpl_points() function, so
-- a scoring-rule fix never needs a backfill (preserves settled assumption A5).
--
-- football_players.position stores the full words 'Goalkeeper' / 'Defender'
-- / 'Midfielder' / 'Forward' (see DraftPage.tsx POSITION_LIMITS) - NOT the
-- FPL API's short codes. fpl_points() keys off those exact strings.
--
-- Client-mandated FPL scoring, identical across all leagues (source:
-- premierleague.com "FPL Basics: Scoring explained"). Every row below was
-- cross-checked against real gameweek-5 total_points for players across all
-- four positions before landing this file - see fplPoints.test.ts.
--   appearance 1 (<60') / 2 (60'+); goal GK 10, DEF 6, MID 5, FWD 4;
--   assist 3; clean sheet GK/DEF 4, MID 1, FWD 0 (needs 60+ mins); every 3
--   saves 1; pen save 5; pen miss -2; every 2 conceded (GK/DEF) -1;
--   yellow -1; red -3; own goal -2; defensive contribution 2 (DEF at 10+
--   CBIT, MID/FWD at 12+ CBIRT, capped +2/match); bonus straight from feed.
-- ============================================================================

create table if not exists public.player_gameweek_stats (
  player_id integer not null references public.football_players (id),
  gameweek_id smallint not null references public.gameweek (id),
  minutes smallint not null default 0,
  goals_scored smallint not null default 0,
  assists smallint not null default 0,
  clean_sheets smallint not null default 0,
  goals_conceded smallint not null default 0,
  own_goals smallint not null default 0,
  penalties_saved smallint not null default 0,
  penalties_missed smallint not null default 0,
  yellow_cards smallint not null default 0,
  red_cards smallint not null default 0,
  saves smallint not null default 0,
  bonus smallint not null default 0,
  defensive_contribution smallint not null default 0,
  primary key (player_id, gameweek_id)
);

create index if not exists player_gameweek_stats_gameweek_id_idx
  on public.player_gameweek_stats (gameweek_id);

alter table public.player_gameweek_stats enable row level security;

drop policy if exists "Anyone can see player gameweek stats"
  on public.player_gameweek_stats;

create policy "Anyone can see player gameweek stats"
  on public.player_gameweek_stats
  for select
  to authenticated
  using (true);


-- fpl_points: pure function of raw stats + position, mirrored in TypeScript
-- at src/features/scoring/fplPoints.ts (keep the two in lock-step - vitest
-- coverage cross-checks both against real published FPL scores).
-- Parameter is player_position, not position: POSITION is a reserved SQL
-- keyword (POSITION(substring IN string)), so a bare `position` parameter
-- name fails to parse in the function signature.
create or replace function public.fpl_points(
  minutes smallint,
  goals_scored smallint,
  assists smallint,
  clean_sheets smallint,
  goals_conceded smallint,
  own_goals smallint,
  penalties_saved smallint,
  penalties_missed smallint,
  yellow_cards smallint,
  red_cards smallint,
  saves smallint,
  bonus smallint,
  defensive_contribution smallint,
  player_position text
)
returns integer
language sql
immutable
as $$
  select (
    -- appearance
    case when minutes >= 60 then 2 when minutes > 0 then 1 else 0 end
    -- goals: GK 10, DEF 6, MID 5, FWD 4
    + goals_scored * case
        when player_position = 'Goalkeeper' then 10
        when player_position = 'Defender' then 6
        when player_position = 'Midfielder' then 5
        else 4
      end
    -- assists
    + assists * 3
    -- clean sheet: GK/DEF 4, MID 1, FWD 0 - only counts with 60+ minutes played
    + case when minutes >= 60 and clean_sheets > 0 then
        case
          when player_position in ('Goalkeeper', 'Defender') then 4
          when player_position = 'Midfielder' then 1
          else 0
        end
      else 0 end
    -- every 3 saves: 1 pt
    + floor(saves / 3.0)::int
    -- penalties
    + penalties_saved * 5
    - penalties_missed * 2
    -- every 2 goals conceded: -1 pt, GK/DEF only
    - case when player_position in ('Goalkeeper', 'Defender')
        then floor(goals_conceded / 2.0)::int
        else 0
      end
    -- cards
    - yellow_cards * 1
    - red_cards * 3
    -- own goals
    - own_goals * 2
    -- defensive contribution: +2, DEF at 10+ CBIT, MID/FWD at 12+ CBIRT, not GK
    + case
        when player_position = 'Defender' and defensive_contribution >= 10 then 2
        when player_position in ('Midfielder', 'Forward') and defensive_contribution >= 12 then 2
        else 0
      end
    -- bonus, straight from the feed (already computed from BPS)
    + bonus
  )::integer;
$$;


-- security_invoker: read through the caller's RLS rather than the owner's.
create or replace view public.player_gameweek_points
  with (security_invoker = true) as
select
  s.player_id,
  s.gameweek_id,
  public.fpl_points(
    s.minutes, s.goals_scored, s.assists, s.clean_sheets, s.goals_conceded,
    s.own_goals, s.penalties_saved, s.penalties_missed, s.yellow_cards,
    s.red_cards, s.saves, s.bonus, s.defensive_contribution, p.position
  ) as points
from public.player_gameweek_stats s
join public.football_players p on p.id = s.player_id;


-- New tables get no DML grants by default on current Supabase (see
-- 20260923091000_grant_table_privileges_to_authenticated.sql).
grant select on public.player_gameweek_stats to authenticated;
grant all on public.player_gameweek_stats to service_role;
grant select on public.player_gameweek_points to authenticated, service_role;
