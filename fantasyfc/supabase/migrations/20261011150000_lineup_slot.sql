-- ============================================================================
-- Persisted lineups and the gameweek lock (#17, S2-09)
--
-- Until now the My Squad swap only changed React state, so a reload threw the
-- lineup away. This stores each team's starting XI, bench order and captain
-- per gameweek, the FPL model: the squad is fixed once the draft is complete,
-- and the lineup for the next gameweek can be changed until its deadline.
--
-- Slot ids: starters are a position code and an index (GK1, DEF1..DEF5,
-- MID1..MID5, FWD1..FWD3); the bench is B1..B4 in substitution order. The
-- pitch layout is drawn from the formation in the app; slot ids only fix
-- the order within each line and on the bench.
--
-- Legal formation (FPL): exactly 1 GK and 11 starters, with 3-5 DEF,
-- 2-5 MID and 1-3 FWD.
--
-- Scoring is unchanged for now: league_standings still counts all 15
-- drafted players. Restricting it to starters (and doubling the captain)
-- is the follow-up this table makes possible.
-- ============================================================================

create table if not exists public.lineup_slot (
  team_id uuid not null references public.teams (id) on delete cascade,
  gameweek_id smallint not null references public.gameweek (id) on delete cascade,
  player_id integer not null references public.football_players (id) on delete cascade,
  slot_id text not null check (slot_id ~ '^(GK1|DEF[1-5]|MID[1-5]|FWD[1-3]|B[1-4])$'),
  is_starting boolean not null,
  is_captain boolean not null default false,
  primary key (team_id, gameweek_id, player_id),
  unique (team_id, gameweek_id, slot_id),
  check (is_starting = (slot_id !~ '^B')),
  check (not is_captain or is_starting)
);

create index if not exists lineup_slot_gameweek_id_idx on public.lineup_slot (gameweek_id);

-- At most one captain per team per gameweek...
create unique index if not exists lineup_slot_one_captain_idx
  on public.lineup_slot (team_id, gameweek_id)
  where is_captain;

-- ...and at least one, checked at commit so a lineup can be rewritten in one
-- transaction (delete, then insert) without tripping it halfway.
create or replace function public.check_lineup_has_captain()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_team uuid := coalesce(new.team_id, old.team_id);
  v_gameweek smallint := coalesce(new.gameweek_id, old.gameweek_id);
begin
  if exists (select 1 from public.lineup_slot where team_id = v_team and gameweek_id = v_gameweek)
     and (select count(*) from public.lineup_slot
          where team_id = v_team and gameweek_id = v_gameweek and is_captain) <> 1 then
    raise exception 'A lineup needs exactly one captain.';
  end if;
  return null;
end;
$$;

drop trigger if exists lineup_slot_one_captain on public.lineup_slot;
create constraint trigger lineup_slot_one_captain
  after insert or update or delete on public.lineup_slot
  deferrable initially deferred
  for each row execute function public.check_lineup_has_captain();

alter table public.lineup_slot enable row level security;

drop policy if exists "Owners can see their lineups" on public.lineup_slot;
create policy "Owners can see their lineups"
  on public.lineup_slot
  for select
  to authenticated
  using (exists (select 1 from public.teams t where t.id = team_id and t.user_id = auth.uid()));

-- Writes only go through set_lineup() / the default-lineup builder below.
grant select on public.lineup_slot to authenticated;
grant all on public.lineup_slot to service_role;

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

/** The gameweek a team's lineup is being picked for: the next deadline. */
create or replace function public.next_gameweek_for_team(p_team_id uuid)
returns public.gameweek
language sql
stable
security definer set search_path = public
as $$
  select g.*
  from public.teams t
  join public.league l on l.id = t.league_id
  join public.gameweek g on g.competition_id = l.competition_id
  where t.id = p_team_id and g.deadline_at > now()
  order by g.deadline_at
  limit 1;
$$;

create or replace function public.is_legal_formation(p_gk int, p_def int, p_mid int, p_fwd int)
returns boolean
language sql
immutable
as $$
  select p_gk = 1
     and p_def between 3 and 5
     and p_mid between 2 and 5
     and p_fwd between 1 and 3
     and p_gk + p_def + p_mid + p_fwd = 11;
$$;

/**
 * Makes sure a complete squad has a lineup for a gameweek: last gameweek's
 * lineup carried forward (as in FPL), or else a default 4-3-3 of the most
 * expensive players in each position, captained by the most expensive
 * starter. Does nothing if a lineup exists or the squad isn't 15.
 */
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

  -- Default 4-3-3: rank each position by price, start the top 1/4/3/3.
  with ranked as (
    select p.id, p.position, p.price,
           row_number() over (partition by p.position order by p.price desc, p.id) as pos_rank
    from public.drafted_players dp
    join public.football_players p on p.id = dp.player_id
    where dp.team_id = p_team_id
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
             -- Bench: the spare goalkeeper first, then outfielders by price.
             'B' || row_number() over (
               partition by m.starting
               order by (m.position = 'Goalkeeper') desc, m.price desc, m.id)
           end as slot_id,
           row_number() over (partition by m.starting order by m.price desc, m.id) as start_rank
    from marked m
  )
  insert into public.lineup_slot (team_id, gameweek_id, player_id, slot_id, is_starting, is_captain)
  select p_team_id, p_gameweek_id, s.id, s.slot_id, s.starting, s.starting and s.start_rank = 1
  from slotted s;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPCs for the app
-- ----------------------------------------------------------------------------

/**
 * The caller's lineup for their next gameweek, created on first read if it
 * doesn't exist yet. Empty when the draft isn't complete or the season has
 * no gameweek left.
 */
create or replace function public.get_lineup(p_team_id uuid)
returns table (
  gameweek_id smallint,
  gameweek_number smallint,
  deadline_at timestamptz,
  player_id integer,
  slot_id text,
  is_starting boolean,
  is_captain boolean
)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_gw public.gameweek;
begin
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.user_id = auth.uid()) then
    raise exception 'You do not own this team.';
  end if;
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.is_draft_complete) then
    return;
  end if;

  v_gw := public.next_gameweek_for_team(p_team_id);
  if v_gw.id is null then
    return;
  end if;

  perform public.ensure_lineup(p_team_id, v_gw.id);

  return query
  select v_gw.id, v_gw.number, v_gw.deadline_at, ls.player_id, ls.slot_id, ls.is_starting, ls.is_captain
  from public.lineup_slot ls
  where ls.team_id = p_team_id and ls.gameweek_id = v_gw.id
  order by ls.slot_id;
end;
$$;

/**
 * Saves the caller's lineup for a gameweek. p_slots is an array of
 * { player_id, slot_id, is_captain }; is_starting follows from the slot id.
 * Rejected once the gameweek's deadline has passed, unless it's exactly
 * the 15 drafted players, 11 starters in a legal formation, and one captain
 * who starts.
 */
create or replace function public.set_lineup(p_team_id uuid, p_gameweek_id smallint, p_slots jsonb)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_complete boolean;
  v_competition smallint;
  v_gw public.gameweek;
  v_gk int; v_def int; v_mid int; v_fwd int;
begin
  -- Lock the team row so two saves for one team run one after the other.
  select t.user_id, t.is_draft_complete, l.competition_id
    into v_owner, v_complete, v_competition
  from public.teams t
  join public.league l on l.id = t.league_id
  where t.id = p_team_id
  for update of t;

  if v_owner is distinct from auth.uid() then
    raise exception 'You do not own this team.';
  end if;
  if not coalesce(v_complete, false) then
    raise exception 'Complete your draft before picking a lineup.';
  end if;

  select * into v_gw from public.gameweek where id = p_gameweek_id;
  if v_gw.id is null or v_gw.competition_id <> v_competition then
    raise exception 'That gameweek is not in this league''s competition.';
  end if;
  if now() >= v_gw.deadline_at then
    raise exception 'Locked — GW % kicked off.', v_gw.number;
  end if;

  drop table if exists pg_temp._slots;
  create temp table _slots on commit drop as
  select (s->>'player_id')::int as player_id,
         s->>'slot_id' as slot_id,
         (s->>'slot_id') !~ '^B' as is_starting,
         coalesce((s->>'is_captain')::boolean, false) as is_captain
  from jsonb_array_elements(p_slots) s;

  if (select count(*) from _slots) <> 15
     or (select count(distinct player_id) from _slots) <> 15
     or (select count(distinct slot_id) from _slots) <> 15 then
    raise exception 'A lineup is 15 different players in 15 different slots.';
  end if;

  if exists (
    select player_id from _slots
    except
    select player_id from public.drafted_players where team_id = p_team_id
  ) then
    raise exception 'Every player in the lineup must be in your squad.';
  end if;

  select count(*) filter (where p.position = 'Goalkeeper'),
         count(*) filter (where p.position = 'Defender'),
         count(*) filter (where p.position = 'Midfielder'),
         count(*) filter (where p.position = 'Forward')
    into v_gk, v_def, v_mid, v_fwd
  from _slots s join public.football_players p on p.id = s.player_id
  where s.is_starting;

  if not public.is_legal_formation(v_gk, v_def, v_mid, v_fwd) then
    raise exception 'Not a legal formation (%-%-%, % GK). Start 1 GK, 3-5 DEF, 2-5 MID and 1-3 FWD.',
      v_def, v_mid, v_fwd, v_gk;
  end if;

  if (select count(*) from _slots where is_captain) <> 1
     or exists (select 1 from _slots where is_captain and not is_starting) then
    raise exception 'Pick exactly one captain from your starting XI.';
  end if;

  delete from public.lineup_slot where team_id = p_team_id and gameweek_id = p_gameweek_id;
  insert into public.lineup_slot (team_id, gameweek_id, player_id, slot_id, is_starting, is_captain)
  select p_team_id, p_gameweek_id, player_id, slot_id, is_starting, is_captain from _slots;
end;
$$;

-- ----------------------------------------------------------------------------
-- Every completed squad gets a lineup straight away.
-- ----------------------------------------------------------------------------

create or replace function public.lineup_on_draft_complete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.ensure_lineup(new.id, (public.next_gameweek_for_team(new.id)).id);
  return null;
end;
$$;

drop trigger if exists teams_lineup_on_draft_complete on public.teams;
create trigger teams_lineup_on_draft_complete
  after update of is_draft_complete on public.teams
  for each row
  when (new.is_draft_complete and not coalesce(old.is_draft_complete, false))
  execute function public.lineup_on_draft_complete();

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------

revoke execute on function public.next_gameweek_for_team(uuid) from public, anon, authenticated;
revoke execute on function public.ensure_lineup(uuid, smallint) from public, anon, authenticated;
revoke execute on function public.lineup_on_draft_complete() from public, anon, authenticated;
revoke execute on function public.check_lineup_has_captain() from public, anon, authenticated;

revoke execute on function public.get_lineup(uuid) from public, anon;
revoke execute on function public.set_lineup(uuid, smallint, jsonb) from public, anon;
grant execute on function public.get_lineup(uuid) to authenticated;
grant execute on function public.set_lineup(uuid, smallint, jsonb) to authenticated;
grant execute on function public.is_legal_formation(int, int, int, int) to authenticated;
