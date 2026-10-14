-- Fixes "infinite recursion detected in policy for relation league_member",
-- reproduced live: joining a public league created by a different user.
--
-- The cycle: league_member's INSERT check subqueries league directly, which
-- forces evaluation of league's own SELECT policy, which subqueries
-- league_member again - Postgres detects this as a re-entrant reference back
-- into the table whose policy is still being evaluated and refuses to
-- proceed. Not a data problem, a genuine mutual RLS cross-reference between
-- these two tables' policies.
--
-- Fix: route the "is this league public" check through a security definer
-- helper instead of a direct table reference. Functions owned by postgres
-- bypass RLS (rolbypassrls=true, verified against this project), so the
-- helper's internal lookup never re-invokes league's SELECT policy - breaking
-- the cycle at its source rather than working around the symptom.
create function public.is_public_league(p_league_id bigint)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select visibility = 'PUBLIC' from public.league where id = p_league_id;
$$;

drop policy "Users can join a public league directly" on public.league_member;
create policy "Users can join a public league directly"
  on public.league_member for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'REGULAR'
    and public.is_public_league(league_id)
  );
