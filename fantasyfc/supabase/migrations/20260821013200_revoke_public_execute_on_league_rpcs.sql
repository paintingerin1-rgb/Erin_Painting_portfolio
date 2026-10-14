-- The previous migration (harden_league_rpc_privileges) revoked EXECUTE
-- from anon on these three functions and it did not actually close
-- anything - verified directly with has_function_privilege() and a raw
-- anon-only curl request (no Authorization header) both still succeeding
-- immediately after that migration applied.
--
-- Root cause, found by inspecting the raw ACL (pg_proc.proacl): all three
-- carried a "=X/postgres" entry - Postgres's shorthand for PUBLIC, meaning
-- literally every role. CREATE FUNCTION grants EXECUTE to PUBLIC by default,
-- and no revoke targeted at a specific role (anon) removes access that PUBLIC
-- already grants unconditionally. handle_new_user's ACL has no such entry,
-- because the original harden_sprint1_schema.sql migration revoked from
-- PUBLIC *and* anon for the trigger functions - that two-step was correct.
-- join_league_by_code only ever got the anon half (in
-- fix_function_privileges.sql), never the public half. Tonight's two new
-- functions repeated the same incomplete fix.
--
-- Revoking from PUBLIC removes the blanket default; the explicit
-- authenticated=X grant each function already has is untouched, so the app
-- keeps working exactly as before for signed-in users.
revoke execute on function public.join_league_by_code(text) from public;
revoke execute on function public.create_league(text, text, smallint, smallint) from public;
revoke execute on function public.is_public_league(bigint) from public;
