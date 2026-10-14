-- 20260926120000 and 20260926130000 revoked execute from PUBLIC only, but
-- Supabase's default privileges also grant execute on new public functions
-- to anon directly, so signed-out callers could still invoke them. They'd be
-- refused by the commissioner check (auth.uid() is null), but close them off
-- like every other RPC in this schema.
revoke execute on function public.delete_league(bigint) from anon;
revoke execute on function public.kick_league_member(bigint, uuid) from anon;
