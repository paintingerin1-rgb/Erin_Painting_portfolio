-- Fixes for findings from Supabase's security/performance advisors, run
-- immediately after create_sprint1_schema.sql. See that migration for design
-- intent; this one only tightens what it already built.

-- ============================================================================
-- Security: trigger functions must not be directly callable as RPCs.
-- Postgres already blocks calling a `returns trigger` function outside of a
-- trigger context, but the advisor is right that leaving default PUBLIC
-- execute on them is sloppy - revoke it explicitly.
-- ============================================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_league() from public;
revoke execute on function public.check_league_member_limits() from public;

-- join_league_by_code is a legitimate RPC, but only for signed-in users -
-- auth.uid() is null for anon, which would fail the not-null constraint on
-- league_member.user_id anyway, but this closes the door explicitly instead
-- of relying on that side effect.
revoke execute on function public.join_league_by_code(text) from anon;

-- ============================================================================
-- Performance: index FK columns that will be queried/joined on directly -
-- "leagues this user created", "which leagues is this user a member of".
-- ============================================================================

create index league_competition_id_idx on public.league (competition_id);
create index league_created_by_idx on public.league (created_by);
create index league_member_user_id_idx on public.league_member (user_id);

-- ============================================================================
-- Performance: wrap auth.uid() as (select auth.uid()) in RLS policies so
-- Postgres evaluates it once per query instead of once per row.
-- ============================================================================

drop policy "Users can read their own profile" on public.profile;
create policy "Users can read their own profile"
  on public.profile for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy "Users can update their own profile" on public.profile;
create policy "Users can update their own profile"
  on public.profile for update
  to authenticated
  using ((select auth.uid()) = id);

drop policy "Public leagues are visible to everyone, private leagues only to members" on public.league;
create policy "Public leagues are visible to everyone, private leagues only to members"
  on public.league for select
  to authenticated
  using (
    visibility = 'PUBLIC'
    or exists (
      select 1 from public.league_member
      where league_member.league_id = league.id
        and league_member.user_id = (select auth.uid())
    )
  );

drop policy "Authenticated users can create a league" on public.league;
create policy "Authenticated users can create a league"
  on public.league for insert
  to authenticated
  with check (created_by = (select auth.uid()));

drop policy "Only the creator can update a league" on public.league;
create policy "Only the creator can update a league"
  on public.league for update
  to authenticated
  using (created_by = (select auth.uid()));

drop policy "Users can read their own memberships" on public.league_member;
create policy "Users can read their own memberships"
  on public.league_member for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy "Users can join a public league directly" on public.league_member;
create policy "Users can join a public league directly"
  on public.league_member for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'REGULAR'
    and exists (
      select 1 from public.league
      where league.id = league_member.league_id
        and league.visibility = 'PUBLIC'
    )
  );
