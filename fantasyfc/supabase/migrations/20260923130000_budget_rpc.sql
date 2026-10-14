-- Migration: Add draft, release and lock RPCs to securely handle budget
--
-- The team row is locked (FOR UPDATE) before any check, so two drafts for the
-- same team run one after the other instead of both passing the budget and
-- squad checks against the same stale numbers.

create or replace function public.draft_player(p_team_id uuid, p_player_id int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_team_owner uuid;
    v_is_locked boolean;
    v_budget numeric;
    v_price numeric;
    v_position text;
    v_current_squad_size int;
    v_current_pos_count int;
    v_max_pos int;
begin
    -- 1. Validate team ownership and draft status
    select user_id, is_draft_complete, remaining_budget into v_team_owner, v_is_locked, v_budget
    from public.teams where id = p_team_id
    for update;

    if v_team_owner is distinct from auth.uid() then
        raise exception 'You do not own this team.';
    end if;

    if v_is_locked then
        raise exception 'Draft is complete and locked.';
    end if;

    -- 2. Validate player exists and get price/position
    select price, position into v_price, v_position
    from public.football_players where id = p_player_id;

    if not found then
        raise exception 'Player not found.';
    end if;

    if v_budget < v_price then
        raise exception 'Insufficient budget.';
    end if;

    -- 3. Check 15-player limit
    select count(*) into v_current_squad_size from public.drafted_players where team_id = p_team_id;
    if v_current_squad_size >= 15 then
        raise exception 'Squad is already full (15 players).';
    end if;

    -- 4. Check position limits (GK: 2, DEF: 5, MID: 4, FWD: 4)
    select count(dp.*) into v_current_pos_count
    from public.drafted_players dp
    join public.football_players fp on dp.player_id = fp.id
    where dp.team_id = p_team_id and fp.position = v_position;

    if v_position = 'Goalkeeper' then v_max_pos = 2;
    elsif v_position = 'Defender' then v_max_pos = 5;
    elsif v_position = 'Midfielder' then v_max_pos = 4;
    elsif v_position = 'Forward' then v_max_pos = 4;
    end if;

    -- Anything else (e.g. 'Unknown' from the ingestion) has no limit to check
    -- against, so it can't be drafted.
    if v_max_pos is null then
        raise exception 'Player has no draftable position (%).', v_position;
    end if;

    if v_current_pos_count >= v_max_pos then
        raise exception 'Positional limit reached for %.', v_position;
    end if;

    -- 5. Execute Draft
    insert into public.drafted_players (team_id, player_id, draft_price) values (p_team_id, p_player_id, v_price);
    update public.teams set remaining_budget = remaining_budget - v_price where id = p_team_id;
end;
$$;

create or replace function public.release_player(p_team_id uuid, p_player_id int)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_team_owner uuid;
    v_is_locked boolean;
    v_refund_price numeric;
begin
    -- 1. Validate team ownership and draft status
    select user_id, is_draft_complete into v_team_owner, v_is_locked
    from public.teams where id = p_team_id
    for update;

    if v_team_owner is distinct from auth.uid() then
        raise exception 'You do not own this team.';
    end if;

    if v_is_locked then
        raise exception 'Draft is complete and locked.';
    end if;

    -- 2. Get original draft price
    select draft_price into v_refund_price
    from public.drafted_players
    where team_id = p_team_id and player_id = p_player_id;

    if not found then
        raise exception 'Player is not in your squad.';
    end if;

    -- 3. Execute Release
    delete from public.drafted_players where team_id = p_team_id and player_id = p_player_id;
    update public.teams set remaining_budget = remaining_budget + v_refund_price where id = p_team_id;
end;
$$;

-- Locking is one-way: users can set is_draft_complete to true through this
-- RPC but have no UPDATE on the column, so they can't unlock and redraft.
create or replace function public.lock_draft(p_team_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_team_owner uuid;
    v_squad_size int;
begin
    select user_id into v_team_owner
    from public.teams where id = p_team_id
    for update;

    if v_team_owner is distinct from auth.uid() then
        raise exception 'You do not own this team.';
    end if;

    select count(*) into v_squad_size from public.drafted_players where team_id = p_team_id;
    if v_squad_size < 15 then
        raise exception 'Draft all 15 players before completing your draft.';
    end if;

    update public.teams set is_draft_complete = true where id = p_team_id;
end;
$$;

revoke all on function public.draft_player from public, anon;
revoke all on function public.release_player from public, anon;
revoke all on function public.lock_draft from public, anon;
grant execute on function public.draft_player to authenticated;
grant execute on function public.release_player to authenticated;
grant execute on function public.lock_draft to authenticated;

-- The RPCs above are now the only way to change a squad, its budget or its
-- lock. Without these revokes a user could skip them: insert a player with
-- no budget charged, or write remaining_budget directly.
revoke update on public.teams from authenticated, anon;
grant update (team_name) on public.teams to authenticated;
revoke insert, delete on public.drafted_players from authenticated, anon;
