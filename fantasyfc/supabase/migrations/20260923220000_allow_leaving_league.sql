-- ============================================================================
-- RPC to safely leave a league (Sprint 3)
-- ============================================================================

-- Safely leaves a league, handling cleanup of the user's team and enforcing
-- that commissioners cannot leave (they must delete the league or transfer it).
create or replace function public.leave_league(p_league_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
begin
  -- 1. Check if the user is actually in the league and get their role
  select role into v_role
  from public.league_member
  where league_id = p_league_id and user_id = auth.uid();

  if not found then
    raise exception 'You are not a member of this league.';
  end if;

  -- 2. Prevent commissioner from leaving
  if v_role = 'COMMISSIONER' then
    raise exception 'Commissioners cannot leave a league. You must delete the league instead.';
  end if;

  -- 3. Delete the user's team in this league (this will cascade to drafted_players if set up)
  delete from public.teams
  where league_id = p_league_id and user_id = auth.uid();

  -- 4. Delete the user's league_member record
  delete from public.league_member
  where league_id = p_league_id and user_id = auth.uid();

end;
$$;

-- Grant execution to authenticated users
grant execute on function public.leave_league(bigint) to authenticated;
