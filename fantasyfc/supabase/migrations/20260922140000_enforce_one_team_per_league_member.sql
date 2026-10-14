-- S2-16: seed-leagues.ts upserts into public.teams with
-- ON CONFLICT (league_id, user_id) - required for A9 (one fantasy team per
-- user per league) regardless. Verified directly against the live project
-- (2026-09-22): the upsert fails with "there is no unique or exclusion
-- constraint matching the ON CONFLICT specification", so the constraint
-- does not actually exist there, even though
-- 20260917201209_create_drafting_schema.sql already claims to add it.
--
-- That migration's own idempotency check compares pg_constraint's conkey
-- against pg_attribute.attnum for league_id/user_id, looked up by name -
-- correct for a table this migration created itself, but this table
-- pre-dates that migration (see its own comment: "the live table already
-- exists"). If the live table's columns don't have the same attnum order
-- a fresh `create table` would produce, that check can conclude a matching
-- constraint already exists when it doesn't, and silently skip adding it.
-- No duplicate (league_id, user_id) rows were found live, so this isn't
-- blocked by dirty data - just skip the fragile introspection and rely on
-- Postgres's own "already exists" error instead.
do $$
begin
  alter table public.teams
    add constraint teams_league_id_user_id_key
    unique (league_id, user_id);
exception
  -- A unique constraint's backing index is itself a relation, so Postgres
  -- raises duplicate_table (42P07) here, not duplicate_object (42710).
  when duplicate_table then
    null;
end
$$;
