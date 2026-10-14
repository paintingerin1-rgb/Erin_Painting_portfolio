-- ============================================================================
-- League standings
--
-- A team's points for a gameweek are the summed fpl_points (via
-- player_gameweek_points, 20260926140000) of every player in its squad that
-- it had drafted before that gameweek's deadline - a player picked after the
-- deadline only starts scoring from the next gameweek, the same way an FPL
-- transfer does. Only gameweeks whose deadline has passed count.
--
-- All 15 drafted players score: there is no persisted starting XI yet (the
-- Squad page's bench is client-side only). Once lineups are stored, this is
-- the one place to restrict scoring to starters.
--
-- Points are derived on read, never stored (assumption A5), so a scoring fix
-- or a late stats correction shows up in the table immediately.
--
-- Both functions are security definer so a member can see every team's
-- points in their league without widening RLS on teams / drafted_players;
-- each checks league membership itself.
-- ============================================================================

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
  where g.is_current;

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
    -- Rank before the current gameweek's points, for the movement arrow.
    -- Null when there is no current gameweek to compare against.
    case when v_current_gameweek is null then null
      else (rank() over (order by tt.total_points - tt.gameweek_points desc))::integer
    end
  from totals tt
  order by tt.total_points desc, tt.gameweek_points desc, tt.username;
end;
$$;


-- One row per league the caller belongs to: their own position in it. Feeds
-- the Standings overview so it doesn't need a round trip per league.
create or replace function public.my_league_standings()
returns table (
  league_id bigint,
  league_name text,
  member_count integer,
  rank integer,
  previous_rank integer,
  gameweek_points integer,
  total_points integer
)
language sql
stable
security definer set search_path = public
as $$
  select
    l.id,
    l.name,
    (select count(*) from public.league_member c where c.league_id = l.id)::integer,
    s.rank,
    s.previous_rank,
    s.gameweek_points,
    s.total_points
  from public.league_member lm
  join public.league l on l.id = lm.league_id
  cross join lateral public.league_standings(l.id) s
  where lm.user_id = auth.uid()
    and s.user_id = auth.uid()
  order by l.name;
$$;

revoke execute on function public.league_standings(bigint) from public, anon;
revoke execute on function public.my_league_standings() from public, anon;
grant execute on function public.league_standings(bigint) to authenticated;
grant execute on function public.my_league_standings() to authenticated;
