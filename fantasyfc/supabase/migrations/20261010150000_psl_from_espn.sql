-- ============================================================================
-- The PSL's data comes from ESPN (#45)
--
-- A free API-Football key can't read the current season, so the PSL's club
-- list was stuck on 2024/25 and it had no fixtures. ESPN's public API has the
-- current clubs, squads, fixtures and per-player match stats.
--
-- ESPN clubs and players are stored as 2,000,000,000 + their ESPN id
-- (fromEspnId in scripts/lib/espn.ts), clear of football-data.org ids and of
-- API-Football's 1,000,000,000 range. ESPN fixture ids (~400,000,000) are
-- stored as they are: they collide with neither.
-- ============================================================================

alter table public.competition drop constraint if exists competition_data_source_check;
alter table public.competition
  add constraint competition_data_source_check
  check (data_source in ('FOOTBALL_DATA', 'API_FOOTBALL', 'ESPN'));

update public.competition set data_source = 'ESPN' where code = 'PSL';
