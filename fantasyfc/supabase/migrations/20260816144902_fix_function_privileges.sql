-- Correction to harden_sprint1_schema.sql: `revoke ... from public` did not
-- actually remove anon/authenticated's ability to call these functions,
-- because Supabase grants execute on new public-schema functions directly to
-- anon/authenticated/service_role (not through the PUBLIC pseudo-role), so a
-- PUBLIC-only revoke left the real grants in place. Verified with
-- has_function_privilege() before writing this, not just re-reading the code.
-- Revoking from the named roles explicitly this time.

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.handle_new_league() from anon, authenticated;
revoke execute on function public.check_league_member_limits() from anon, authenticated;

-- join_league_by_code stays callable by authenticated (that's its purpose),
-- only anon loses access.
revoke execute on function public.join_league_by_code(text) from anon;
