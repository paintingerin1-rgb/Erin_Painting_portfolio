-- ============================================================================
-- Score the starting XI, captain doubled (#18, S2-10)
--
-- Until now league_standings counted all 15 drafted players. With lineups
-- stored (20261011150000_lineup_slot.sql) a team now scores the FPL way: only
-- its 11 starters count, and the captain's points are doubled.
--
-- Which lineup counts for a gameweek, in order:
--   1. the one saved for that gameweek (set_lineup locks it at the deadline)
--   2. else the latest earlier one, carried forward as in FPL
--   3. else the default 4-3-3 by price that ensure_lineup would have built.
--      Squads drafted before lineups existed, and seeded teams, have no
--      saved lineup for the gameweeks already played.
--
-- Unchanged: a player only scores from the first gameweek whose deadline
-- falls after they were drafted, and only once that deadline has passed.
-- No automatic substitutions and no vice-captain yet: a starter who didn't
-- play scores 0, and so does a captain who didn't.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- default_lineups: every team's default lineup, the rule ensure_lineup used
-- (moved here so scoring can use it without writing rows): a 4-3-3 of the
-- most expensive players in each position, captained by the most expensive
-- starter; the spare goalkeeper first on the bench, then outfielders by
-- price. Every window is partitioned by team, so a filter on team_id is
-- applied before the ranking rather than after it.
-- ----------------------------------------------------------------------------

create or replace view public.default_lineups as
with ranked as (
  select dp.team_id, p.id, p.position, p.price,
         row_number() over (partition by dp.team_id, p.position order by p.price desc, p.id) as pos_rank
  from public.drafted_players dp
  join public.football_players p on p.id = dp.player_id
),
marked as (
  select r.*,
         r.pos_rank <= case r.position
           when 'Goalkeeper' then 1 when 'Defender' then 4
           when 'Midfielder' then 3 when 'Forward' then 3 else 0 end as starting
  from ranked r
),
slotted as (
  select m.*,
         case when m.starting then
           case m.position when 'Goalkeeper' then 'GK' when 'Defender' then 'DEF'
                           when 'Midfielder' then 'MID' else 'FWD' end || m.pos_rank
         else
           'B' || row_number() over (
             partition by m.team_id, m.starting
             order by (m.position = 'Goalkeeper') desc, m.price desc, m.id)
         end as slot_id,
         row_number() over (partition by m.team_id, m.starting order by m.price desc, m.id) as start_rank
  from marked m
)
select s.team_id, s.id as player_id, s.slot_id, s.starting as is_starting,
       s.starting and s.start_rank = 1 as is_captain
from slotted s;

create or replace function public.ensure_lineup(p_team_id uuid, p_gameweek_id smallint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_previous smallint;
begin
  if p_gameweek_id is null
     or exists (select 1 from public.lineup_slot where team_id = p_team_id and gameweek_id = p_gameweek_id)
     or (select count(*) from public.drafted_players where team_id = p_team_id) <> 15 then
    return;
  end if;

  -- Carry forward the latest earlier lineup, if it's still this squad.
  select ls.gameweek_id into v_previous
  from public.lineup_slot ls
  join public.gameweek g on g.id = ls.gameweek_id
  where ls.team_id = p_team_id
    and g.deadline_at < (select deadline_at from public.gameweek where id = p_gameweek_id)
  group by ls.gameweek_id, g.deadline_at
  having count(*) = 15
     and count(*) filter (where ls.player_id in (select player_id from public.drafted_players where team_id = p_team_id)) = 15
  order by g.deadline_at desc
  limit 1;

  if v_previous is not null then
    insert into public.lineup_slot (team_id, gameweek_id, player_id, slot_id, is_starting, is_captain)
    select p_team_id, p_gameweek_id, player_id, slot_id, is_starting, is_captain
    from public.lineup_slot
    where team_id = p_team_id and gameweek_id = v_previous;
    return;
  end if;

  insert into public.lineup_slot (team_id, gameweek_id, player_id, slot_id, is_starting, is_captain)
  select p_team_id, p_gameweek_id, d.player_id, d.slot_id, d.is_starting, d.is_captain
  from public.default_lineups d
  where d.team_id = p_team_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- gameweek_lineups: the lineup that counts for each team in each gameweek
-- that has passed (see the header for the order).
-- ----------------------------------------------------------------------------

create or replace view public.gameweek_lineups as
select
  t.league_id,
  t.id as team_id,
  g.id as gameweek_id,
  lu.player_id,
  lu.is_starting,
  lu.is_captain
from public.teams t
join public.league l on l.id = t.league_id
join public.gameweek g
  on g.competition_id = l.competition_id
 and g.deadline_at <= now()
-- "Earlier" by deadline, not by id: ids are only ordered within one
-- competition's load.
left join lateral (
  select ls.gameweek_id
  from public.lineup_slot ls
  join public.gameweek sg on sg.id = ls.gameweek_id
  where ls.team_id = t.id and sg.deadline_at <= g.deadline_at
  order by sg.deadline_at desc
  limit 1
) saved on true
cross join lateral (
  select ls.player_id, ls.is_starting, ls.is_captain
  from public.lineup_slot ls
  where saved.gameweek_id is not null
    and ls.team_id = t.id and ls.gameweek_id = saved.gameweek_id
  union all
  select d.player_id, d.is_starting, d.is_captain
  from public.default_lineups d
  where saved.gameweek_id is null and d.team_id = t.id
) lu;

-- ----------------------------------------------------------------------------
-- team_gameweek_points: one row per team per gameweek it scored in. Filter
-- on league_id (not a join to teams) so only that league is computed.
-- ----------------------------------------------------------------------------

create or replace view public.team_gameweek_points as
select
  gl.league_id,
  gl.team_id,
  gl.gameweek_id,
  sum(pgp.points * case when gl.is_captain then 2 else 1 end)::integer as points
from public.gameweek_lineups gl
join public.gameweek g on g.id = gl.gameweek_id
join public.drafted_players dp
  on dp.team_id = gl.team_id
 and dp.player_id = gl.player_id
 and g.deadline_at > dp.drafted_at
join public.player_gameweek_points pgp
  on pgp.player_id = gl.player_id
 and pgp.gameweek_id = gl.gameweek_id
where gl.is_starting
group by gl.league_id, gl.team_id, gl.gameweek_id;

-- ----------------------------------------------------------------------------
-- Standings: points now come from team_gameweek_points. Otherwise unchanged
-- from 20261010120000_multi_competition.sql.
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
    select tgp.team_id, tgp.gameweek_id, tgp.points
    from public.team_gameweek_points tgp
    where tgp.league_id = p_league_id
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

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------

-- The views run as their owner and see every team's lineup, so the app only
-- reaches them through league_standings, which checks membership first.
revoke all on public.default_lineups, public.gameweek_lineups, public.team_gameweek_points
  from public, anon, authenticated;
grant select on public.default_lineups, public.gameweek_lineups, public.team_gameweek_points
  to service_role;

revoke execute on function public.ensure_lineup(uuid, smallint) from public, anon, authenticated;

revoke execute on function public.league_standings(bigint) from public, anon;
grant execute on function public.league_standings(bigint) to authenticated;
