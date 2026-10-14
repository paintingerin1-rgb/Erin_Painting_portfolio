-- Client-side `insert().select()` on league fails RLS for PRIVATE leagues:
-- the row isn't visible under the league SELECT policy until the
-- after_league_insert trigger's league_member row exists, and PostgREST's
-- return-the-new-row step is itself subject to that same SELECT policy -
-- reported to the client as a generic "violates row-level security policy"
-- error even though the insert itself succeeds. Verified directly against
-- this project: the same insert succeeds with `Prefer: return=minimal` and
-- fails with `Prefer: return=representation`.
--
-- Same fix shape as join_league_by_code: wrap the write in a security
-- definer function so the return value isn't subject to the caller's own
-- SELECT policy on the way out. Also moves join-code generation/retry
-- server-side, which is more robust than doing it over several client round
-- trips.
create function public.create_league(
  p_name text,
  p_visibility text,
  p_max_teams smallint,
  p_competition_id smallint
)
returns table(id bigint, join_code text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_join_code text;
  v_league_id bigint;
  v_attempt int := 0;
begin
  if p_visibility = 'PRIVATE' then
    loop
      v_attempt := v_attempt + 1;
      v_join_code := (
        select string_agg(
          substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 32)::int + 1, 1),
          ''
        )
        from generate_series(1, 6)
      );
      begin
        insert into public.league (name, competition_id, visibility, join_code, max_teams, created_by)
        values (p_name, p_competition_id, p_visibility, v_join_code, p_max_teams, auth.uid())
        returning league.id into v_league_id;
        exit;
      exception when unique_violation then
        if v_attempt >= 5 then
          raise exception 'Could not generate a unique join code.';
        end if;
      end;
    end loop;
  else
    v_join_code := null;
    insert into public.league (name, competition_id, visibility, join_code, max_teams, created_by)
    values (p_name, p_competition_id, p_visibility, v_join_code, p_max_teams, auth.uid())
    returning league.id into v_league_id;
  end if;

  return query select v_league_id, v_join_code;
end;
$$;

-- Same privilege pattern as join_league_by_code: callable by signed-in
-- users only, not anon.
revoke execute on function public.create_league(text, text, smallint, smallint) from anon;
