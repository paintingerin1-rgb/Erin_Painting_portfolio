-- Sprint 1 schema: login -> create/join a league.
-- Source of truth for design intent: PROJECT_LOCKER/Sprint_Plan.md and Schema.md.
-- Nothing here covers drafting, squads, scoring, or messaging (Sprint 2/3).

-- ============================================================================
-- competition
-- ============================================================================

create table public.competition (
  id smallint generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.competition enable row level security;

create policy "Authenticated users can read competitions"
  on public.competition for select
  to authenticated
  using (true);

-- One row at launch, per the client: start with the English Premier League.
insert into public.competition (name) values ('English Premier League');

-- ============================================================================
-- profile (extends auth.users; Supabase Auth owns Google/Apple OAuth itself)
-- ============================================================================

create table public.profile (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profile enable row level security;

create policy "Users can read their own profile"
  on public.profile for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profile for update
  to authenticated
  using (auth.uid() = id);

-- OAuth login doubles as registration: every new auth.users row (first-time
-- Google/Apple sign-in) gets a profile row created automatically. There is no
-- separate sign-up screen or step - see Sprint_Plan.md's note on this.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profile (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- league
-- ============================================================================

create table public.league (
  id bigint generated always as identity primary key,
  name text not null,
  competition_id smallint not null references public.competition (id),
  visibility text not null check (visibility in ('PUBLIC', 'PRIVATE')),
  join_code text unique,
  max_teams smallint not null default 20 check (max_teams > 0 and max_teams <= 20),
  created_by uuid not null references public.profile (id),
  created_at timestamptz not null default now(),
  constraint join_code_required_for_private
    check (visibility = 'PUBLIC' or join_code is not null)
);

alter table public.league enable row level security;

-- ============================================================================
-- league_member
-- ============================================================================

create table public.league_member (
  league_id bigint not null references public.league (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  role text not null check (role in ('COMMISSIONER', 'REGULAR')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

alter table public.league_member enable row level security;

-- ----------------------------------------------------------------------------
-- Business rules (client Q&A): a user may belong to at most 5 leagues; a
-- league may have at most `max_teams` members. Enforced as a trigger, not a
-- simple CHECK, because both rules are aggregate (count existing rows) and
-- must hold no matter which path added the row (direct join, code-based join,
-- or the auto-join-as-commissioner on league creation below).
-- security definer so the counts are true counts, not filtered by the calling
-- user's own RLS visibility.
-- ----------------------------------------------------------------------------
create function public.check_league_member_limits()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_league_count int;
  v_league_member_count int;
  v_max_teams smallint;
begin
  select count(*) into v_user_league_count
  from public.league_member
  where user_id = new.user_id;

  if v_user_league_count >= 5 then
    raise exception 'You are already in the maximum of 5 leagues.';
  end if;

  select max_teams into v_max_teams
  from public.league
  where id = new.league_id;

  select count(*) into v_league_member_count
  from public.league_member
  where league_id = new.league_id;

  if v_league_member_count >= v_max_teams then
    raise exception 'This league is full (max % teams).', v_max_teams;
  end if;

  return new;
end;
$$;

create trigger before_league_member_insert
  before insert on public.league_member
  for each row execute procedure public.check_league_member_limits();

-- League creation auto-joins the creator as commissioner - not a separate
-- user action, and not blocked by the "PUBLIC only" direct-insert policy
-- below because this trigger runs as its owner (security definer).
create function public.handle_new_league()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.league_member (league_id, user_id, role)
  values (new.id, new.created_by, 'COMMISSIONER');
  return new;
end;
$$;

create trigger after_league_insert
  after insert on public.league
  for each row execute procedure public.handle_new_league();

-- Private-league joining goes through this function rather than a direct
-- client insert, so a join code can be resolved without a general "browse
-- private leagues" read policy existing. security definer bypasses RLS for
-- the lookup; the membership-limit trigger above still fires regardless.
create function public.join_league_by_code(p_join_code text)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_league_id bigint;
begin
  select id into v_league_id
  from public.league
  where join_code = p_join_code and visibility = 'PRIVATE';

  if v_league_id is null then
    raise exception 'Invalid join code.';
  end if;

  insert into public.league_member (league_id, user_id, role)
  values (v_league_id, auth.uid(), 'REGULAR');

  return v_league_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS policies for league (defined after league_member exists, since the
-- select policy below needs to reference it)
-- ----------------------------------------------------------------------------

create policy "Public leagues are visible to everyone, private leagues only to members"
  on public.league for select
  to authenticated
  using (
    visibility = 'PUBLIC'
    or exists (
      select 1 from public.league_member
      where league_member.league_id = league.id
        and league_member.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create a league"
  on public.league for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Only the creator can update a league"
  on public.league for update
  to authenticated
  using (created_by = auth.uid());

-- ----------------------------------------------------------------------------
-- RLS policies for league_member
-- ----------------------------------------------------------------------------

create policy "Users can read their own memberships"
  on public.league_member for select
  to authenticated
  using (user_id = auth.uid());

-- Direct inserts only cover the public-league join path, as REGULAR only -
-- a client cannot self-appoint as commissioner or join a private league
-- without going through join_league_by_code().
create policy "Users can join a public league directly"
  on public.league_member for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'REGULAR'
    and exists (
      select 1 from public.league
      where league.id = league_member.league_id
        and league.visibility = 'PUBLIC'
    )
  );
