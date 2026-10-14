-- Commissioners can delete their own league. Done through a security definer
-- RPC rather than a DELETE policy: authenticated has no DELETE grant on league
-- (see 20260923091000), and the check matches kick_league_member's, which
-- keys on the COMMISSIONER role rather than league.created_by.
--
-- league_member, league_message and teams (and through it drafted_players)
-- all cascade from league; see 20260926110000.
create or replace function public.delete_league(p_league_id bigint)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.league_member
    where league_id = p_league_id
      and user_id = auth.uid()
      and role = 'COMMISSIONER'
  ) then
    raise exception 'Only the commissioner can delete this league.';
  end if;

  delete from public.league where id = p_league_id;
end;
$$;

revoke execute on function public.delete_league(bigint) from public;
grant execute on function public.delete_league(bigint) to authenticated;
