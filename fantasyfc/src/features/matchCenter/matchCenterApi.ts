// Match Center data source - portfolio version.
//
// In production, fixtures are ingested from the official FPL API into a
// `fixture` table (joined to `club` for team names) and read here through
// Supabase. This version builds the same FixtureRow shape from sample data,
// with kickoff times relative to now so there are always finished, live and
// upcoming matches to show.

import { FIXTURES, later } from "../../data/sampleData";

export type FixtureStatus = "SCHEDULED" | "LIVE" | "FINISHED";

export interface FixtureRow {
  id: number;
  /** Season gameweek number (1..38), or null for a fixture not yet assigned
   *  to a gameweek (e.g. postponed). */
  gameweek_number: number | null;
  /** ISO 8601 timestamp, or null - a fixture can lack a confirmed kickoff time. */
  kickoff_at: string | null;
  status: FixtureStatus;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
}

const HOUR = 60 * 60 * 1000;

/** One competition's fixtures; the Premier League's when none is given. */
export async function getFixtures(competitionId: number | null = null): Promise<FixtureRow[]> {
  const now = Date.now();
  const id = competitionId ?? 1;

  const rows = FIXTURES.filter((f) => f.competitionId === id)
    .map((f) => ({
      id: f.id,
      gameweek_number: f.gameweek,
      kickoff_at:
        f.kickoffOffsetHours === null
          ? null
          : new Date(now + f.kickoffOffsetHours * HOUR).toISOString(),
      status: f.status,
      home_team: f.home,
      away_team: f.away,
      home_score: f.homeScore,
      away_score: f.awayScore,
    }))
    // Earliest kickoff first; fixtures with no kickoff time go last
    // (Postgres's NULLS LAST for an ascending sort).
    .sort((a, b) => {
      if (a.kickoff_at === b.kickoff_at) return 0;
      if (a.kickoff_at === null) return 1;
      if (b.kickoff_at === null) return -1;
      return a.kickoff_at < b.kickoff_at ? -1 : 1;
    });

  return later(rows);
}
