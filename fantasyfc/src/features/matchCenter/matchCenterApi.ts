// Match Center data source: reads public.fixture (S2-07), joined to
// public.club for team names. The two foreign keys on fixture both point at
// club, so each embed is disambiguated by column name - see
// s2-07-seed-demo-live.ts for the same pattern.
//
// FixtureStatus keeps its original SCHEDULED/LIVE/FINISHED spelling (not
// fixture.status's UPCOMING/LIVE/COMPLETED) so MatchCenterPage, written
// against the pre-S2-07 mock, didn't need to change to match the DB's words.

import { supabase } from "../../lib/supabaseClient";
import { unwrapMany } from "../../lib/dataAccess";

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

type DbFixtureStatus = "UPCOMING" | "LIVE" | "COMPLETED";

const STATUS_MAP: Record<DbFixtureStatus, FixtureStatus> = {
  UPCOMING: "SCHEDULED",
  LIVE: "LIVE",
  COMPLETED: "FINISHED",
};

interface FixtureQueryRow {
  id: number;
  gameweek: { number: number } | null;
  kickoff_at: string | null;
  status: DbFixtureStatus;
  home_score: number | null;
  away_score: number | null;
  home: { name: string } | null;
  away: { name: string } | null;
}

/**
 * One competition's fixtures (#44): the current league's, or the Premier
 * League's when there is no current league.
 */
export async function getFixtures(competitionId: number | null = null): Promise<FixtureRow[]> {
  const query = supabase
    .from("fixture")
    .select(
      `
      id,
      gameweek ( number ),
      kickoff_at,
      status,
      home_score,
      away_score,
      home:club!home_club_id ( name ),
      away:club!away_club_id ( name ),
      competition!inner ( code )
      `,
    );
  const result = await (competitionId === null
    ? query.eq("competition.code", "PL")
    : query.eq("competition_id", competitionId))
    // Ascending: earliest kickoff first, whichever tab is showing - oldest
    // completed match first within Completed, soonest match first within
    // Upcoming. NULLS LAST (Postgres's default for ascending) puts any
    // not-yet-timed fixture at the end rather than the top.
    .order("kickoff_at", { ascending: true })
    // Without generated DB types, supabase-js can't tell a many-to-one embed
    // (fixture -> one club) returns a single object rather than an array -
    // same issue s2-07-seed-demo-live.ts works around with .overrideTypes().
    .overrideTypes<FixtureQueryRow[], { merge: false }>();

  const rows = unwrapMany<FixtureQueryRow>(result, "fixtures");

  return rows.map((f) => ({
    id: f.id,
    gameweek_number: f.gameweek?.number ?? null,
    kickoff_at: f.kickoff_at,
    status: STATUS_MAP[f.status],
    home_team: f.home?.name ?? "TBC",
    away_team: f.away?.name ?? "TBC",
    home_score: f.home_score,
    away_score: f.away_score,
  }));
}
