create or replace function public.kick_league_member(p_league_id bigint, p_target_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role text;
  v_target_role text;
begin
  -- 1. Check if caller is commissioner
  select role into v_caller_role
  from public.league_member
  where league_id = p_league_id and user_id = auth.uid();

  if not found or v_caller_role != 'COMMISSIONER' then
    raise exception 'Only the commissioner can kick members from this league.';
  end if;

  -- 2. Check if target is in the league
  select role into v_target_role
  from public.league_member
  where league_id = p_league_id and user_id = p_target_user_id;

  if not found then
    raise exception 'User is not a member of this league.';
  end if;

  -- 3. Prevent commissioner from kicking themselves
  if p_target_user_id = auth.uid() then
    raise exception 'You cannot kick yourself. If you want to leave or delete the league, use the appropriate action.';
  end if;

  -- 4. Delete the target user's team in this league (cascades to
  --    drafted_players; see 20260926110000)
  delete from public.teams
  where league_id = p_league_id and user_id = p_target_user_id;

  -- 5. Delete the target user's league_member record
  delete from public.league_member
  where league_id = p_league_id and user_id = p_target_user_id;

end;
$$;

-- Grant execution to authenticated users only
revoke execute on function public.kick_league_member(bigint, uuid) from public;
grant execute on function public.kick_league_member(bigint, uuid) to authenticated;
