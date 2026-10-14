-- S2-20: a signed-in user cannot create or join a league on a freshly-
-- migrated database. create_league()/join_league_by_code()/is_public_league()
-- were never granted EXECUTE to authenticated in any tracked migration -
-- 20260821012400_harden_league_rpc_privileges.sql and
-- 20260821013200_revoke_public_execute_on_league_rpcs.sql only ever revoke
-- from anon/public, on the assumption (stated in the second migration's own
-- comment) that "the explicit authenticated=X grant each function already
-- has is untouched". That grant does not exist in any migration - it only
-- ever existed as manually-applied, undocumented state on the live class
-- Supabase project, which is why `supabase db reset` never caught this.
--
-- Verified with has_function_privilege() on a fresh reset before and after
-- this migration.
grant execute on function public.create_league(text, text, smallint, smallint) to authenticated;
grant execute on function public.join_league_by_code(text) to authenticated;
grant execute on function public.is_public_league(bigint) to authenticated;

-- Audit of the other security-definer functions (per this issue's AC): none
-- of handle_new_user(), handle_new_league(), check_league_member_limits()
-- need an authenticated or service_role grant. All three are pure trigger
-- functions (`create trigger ... execute procedure ...`, never called
-- directly by client code or referenced from an RLS policy) - Postgres
-- invokes a trigger function through the trigger mechanism, which does not
-- check the invoking role's EXECUTE privilege at all. They were correctly
-- locked down to no one in 20260816144747_harden_sprint1_schema.sql and
-- 20260816144902_fix_function_privileges.sql; no change needed here.
