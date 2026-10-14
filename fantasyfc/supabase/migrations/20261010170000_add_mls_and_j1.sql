-- ============================================================================
-- MLS and the J1 League
--
-- Two more competitions, both loaded entirely from ESPN like the PSL
-- (20261010150000): clubs, squads, fixtures, gameweeks and match stats.
-- Both run on a calendar-year season (2026).
--
-- ESPN fixture ids: the PSL's (~400,000,000) were stored as they are, but
-- MLS's are small (~760,000) and could collide with football-data.org match
-- ids. Every ESPN fixture is now stored as 1,500,000,000 + its ESPN id
-- (fromEspnFixtureId in scripts/lib/espn.ts). Any PSL fixtures loaded with
-- the old ids are deleted here; npm run ingest:espn-leagues reloads them.
-- ============================================================================

insert into public.competition (name, code, country, api_football_league_id, data_source)
values
  ('Major League Soccer', 'MLS', 'USA',    253, 'ESPN'),
  ('J1 League',           'J1',  'Japan',   98, 'ESPN')
on conflict (code) do nothing;

delete from public.fixture f
using public.competition c
where c.id = f.competition_id
  and c.code = 'PSL'
  and f.id < 1500000000;
