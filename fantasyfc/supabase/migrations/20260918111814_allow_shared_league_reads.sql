-- Allow users to see other members when they share a league.
-- The helper is SECURITY DEFINER so it can inspect league_member
-- without being blocked by league_member's own RLS policies.
create or replace function public.shares_league_with(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.league_member target_member
    join public.league_member current_member
      on current_member.league_id = target_member.league_id
    where target_member.user_id = p_user_id
      and current_member.user_id = (select auth.uid())
  );
$$;

-- Ensure the function is owned by postgres so SECURITY DEFINER
-- executes with the privileges needed to bypass league_member RLS.
alter function public.shares_league_with(uuid) owner to postgres;

-- The helper is only intended to be called internally by RLS policies.
revoke execute on function public.shares_league_with(uuid) from public;
revoke execute on function public.shares_league_with(uuid) from anon;

-- authenticated needs to be able to execute the function because
-- the RLS policies invoke it.
grant execute on function public.shares_league_with(uuid) to authenticated;

-- Check whether the current authenticated user belongs to a
-- particular league.
--
-- SECURITY DEFINER is required because this function queries
-- league_member, whose RLS policies would otherwise interfere
-- with the check.

create or replace function public.is_member_of_league(p_league_id bigint)
returns boolean
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.league_member
    where league_id = p_league_id
      and user_id = (select auth.uid())
  );
$$;

alter function public.is_member_of_league(bigint) owner to postgres;

revoke execute on function public.is_member_of_league(bigint) from public;
revoke execute on function public.is_member_of_league(bigint) from anon;
grant execute on function public.is_member_of_league(bigint) to authenticated;

-- ============================================================
-- league_member
-- ============================================================

drop policy if exists "Users can view league members in their leagues"
on public.league_member;

create policy "Users can view league members in their leagues"
on public.league_member
for select
to authenticated
using (
  public.shares_league_with(user_id)
);


-- ============================================================
-- profile
-- ============================================================

drop policy if exists "Users can view profiles in their leagues"
on public.profile;

create policy "Users can view profiles in their leagues"
on public.profile
for select
to authenticated
using (
  public.shares_league_with(id)
);


-- ============================================================
-- teams
-- ============================================================

drop policy if exists "Users can view teams in their leagues"
on public.teams;

create policy "Users can view teams in their leagues"
on public.teams
for select
to authenticated
using (
  public.shares_league_with(user_id)
);


-- ============================================================
-- drafted_players
-- ============================================================

drop policy if exists "Users can view drafted players in their leagues"
on public.drafted_players;

create policy "Users can view drafted players in their leagues"
on public.drafted_players
for select
to authenticated
using (
  exists (
    select 1
    from public.teams t
    where t.id = drafted_players.team_id
      and public.shares_league_with(t.user_id)
  )
);
