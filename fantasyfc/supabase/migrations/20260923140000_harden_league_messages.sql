-- ============================================================================
-- league_message: grants, delete-only updates, and scrubbing deleted text
-- ============================================================================

-- 20260919080000 predates 20260923091000's explicit grants and isn't covered
-- by them, so on a fresh `supabase db reset` every chat query from a
-- signed-in user failed with "permission denied for table league_message".
-- (The live project picked up the old implicit grants, which is why it worked
-- there.)
grant select, insert on public.league_message to authenticated;
grant all on public.league_message to service_role;
grant usage on all sequences in schema public to authenticated;

-- The update policy's WITH CHECK only requires is_deleted = true and
-- deleted_by = auth.uid(), so an author could rewrite content in the same
-- update as the delete. Limit UPDATE to the two columns a soft delete sets.
revoke update on public.league_message from authenticated;
grant update (is_deleted, deleted_by) on public.league_message to authenticated;

-- A soft-deleted message still sent its original text to every member's
-- browser; the tombstone only hid it on screen. Blank it when it's deleted.
create or replace function public.scrub_deleted_league_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_deleted and not old.is_deleted then
    new.content := '';
  end if;
  return new;
end;
$$;

-- Trigger function only: never called directly.
revoke execute on function public.scrub_deleted_league_message() from public, anon, authenticated;

drop trigger if exists before_league_message_update on public.league_message;

create trigger before_league_message_update
  before update on public.league_message
  for each row execute function public.scrub_deleted_league_message();

-- Messages deleted before this migration.
update public.league_message set content = '' where is_deleted and content <> '';

-- Keep a single message from flooding the feed. NOT VALID: applies to new
-- rows without failing on anything already in the live table.
alter table public.league_message
  drop constraint if exists league_message_content_length;
alter table public.league_message
  add constraint league_message_content_length
  check (char_length(content) <= 2000) not valid;
