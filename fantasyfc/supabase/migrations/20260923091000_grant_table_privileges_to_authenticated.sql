-- Current Supabase no longer grants SELECT/INSERT/UPDATE/DELETE on new public
-- tables to anon/authenticated by default (pg_default_acl for postgres now
-- carries only Dxtm). The live project predates that change, so its tables
-- picked up the old blanket grants implicitly - but on a fresh
-- `supabase db reset` every query from a signed-in user fails with
-- "permission denied for table competition", before RLS is even consulted.
--
-- Grant explicitly. RLS is enabled on every one of these tables and every
-- policy is scoped `to authenticated`, so the policies remain the actual
-- access control; this only lets requests reach them. anon gets nothing.
grant select on public.competition to authenticated;
grant select, update on public.profile to authenticated;
grant select, insert, update on public.league to authenticated;
grant select, insert on public.league_member to authenticated;
grant select, insert, update on public.teams to authenticated;
grant select on public.football_players to authenticated;
grant select, insert, delete on public.drafted_players to authenticated;

grant usage on all sequences in schema public to authenticated;

-- service_role bypasses RLS but still needs table privileges; the player
-- ingestion and seed scripts write with it.
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
