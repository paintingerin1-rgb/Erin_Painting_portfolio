-- Same class of gap the team's own fix_function_privileges.sql migration
-- documented on 2026-08-16: Supabase grants EXECUTE on new public-schema
-- functions directly to anon/authenticated, not through the PUBLIC
-- pseudo-role, so a plain `revoke ... from public` doesn't remove it. That
-- migration correctly revoked anon from join_league_by_code at the time -
-- but the security advisor and a direct anon-only curl request (no
-- Authorization header) both just confirmed anon can call it again right
-- now. Re-revoking here rather than tracking down why, since the fix is
-- identical either way and this migration verifies it actually sticks.
--
-- create_league and is_public_league (added tonight) never had anon revoked
-- in the first place - same gap, closing it now rather than after a review
-- finds it first.
revoke execute on function public.join_league_by_code(text) from anon;
revoke execute on function public.create_league(text, text, smallint, smallint) from anon;
revoke execute on function public.is_public_league(bigint) from anon;
