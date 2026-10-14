-- 20260920214121_relax_profile_select.sql (messaging branch) was pushed to the
-- live project and later reverted in git, but the live policy stayed: any
-- signed-in user could read every profile. Remove it and restore own-row
-- reads; league-mates remain visible through "Users can view profiles in their
-- leagues" (20260918111814), which is what chat needs for names.
drop policy if exists "Users can read all profiles" on public.profile;

drop policy if exists "Users can read their own profile" on public.profile;
create policy "Users can read their own profile"
  on public.profile for select
  to authenticated
  using ((select auth.uid()) = id);
