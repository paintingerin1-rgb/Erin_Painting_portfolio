-- ============================================================================
-- league_message table for real-time chat
-- ============================================================================

create table public.league_message (
  id bigint generated always as identity primary key,
  league_id bigint not null references public.league (id) on delete cascade,
  user_id uuid not null references public.profile (id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  deleted_by uuid references public.profile (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.league_message enable row level security;

-- We want real-time updates for messages
alter publication supabase_realtime add table public.league_message;

-- ----------------------------------------------------------------------------
-- RLS policies for league_message
-- ----------------------------------------------------------------------------

-- A user can read messages if they are a member of the league.
create policy "Users can view messages in their leagues"
  on public.league_message for select
  to authenticated
  using (
    exists (
      select 1 from public.league_member
      where league_member.league_id = league_message.league_id
        and league_member.user_id = auth.uid()
    )
  );

-- A user can post messages in a league they are a member of.
create policy "Users can post messages in their leagues"
  on public.league_message for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.league_member
      where league_member.league_id = league_message.league_id
        and league_member.user_id = auth.uid()
    )
  );

-- A user can soft-delete a message if they are the author.
create policy "Users can soft-delete their own messages"
  on public.league_message for update
  to authenticated
  using (
    user_id = auth.uid()
  )
  with check (
    user_id = auth.uid()
    and is_deleted = true
    and deleted_by = auth.uid()
  );
