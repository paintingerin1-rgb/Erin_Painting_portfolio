// Standings data source - portfolio version.
//
// In production, getLeagueStandings() calls the league_standings database
// function, which sums fpl_points() over each team's starting XI for every
// gameweek after the player was drafted. Points are never stored; they're
// derived from raw match stats on read. This version returns a demo league
// with the same StandingRow shape, so StandingsPage is unchanged.

import { DEMO_LEAGUE, STANDINGS, later } from "../../data/sampleData";

export interface StandingRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  teamName: string | null;
  isDraftComplete: boolean;
  gameweekPoints: number;
  totalPoints: number;
  rank: number;
  previousRank: number | null;
}

export interface CurrentGameweek {
  number: number;
  deadlineAt: string;
}

/** Full table for one league, already sorted by rank. */
export async function getLeagueStandings(leagueId: number): Promise<StandingRow[]> {
  if (leagueId !== DEMO_LEAGUE.id) throw new Error("League not found, or you're not a member of it.");
  const rows = [...STANDINGS]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .map((r, i) => ({ ...r, avatarUrl: null, rank: i + 1 }));
  return later(rows);
}

/** A league's name. */
export async function getLeagueName(leagueId: number): Promise<string> {
  if (leagueId !== DEMO_LEAGUE.id) throw new Error("League not found, or you're not a member of it.");
  return later(DEMO_LEAGUE.name, 120);
}

export async function getCurrentGameweek(
  _competitionId: number | null = null,
): Promise<CurrentGameweek | null> {
  void _competitionId;
  return later({ number: 6, deadlineAt: new Date(Date.now() - 2 * 3600_000).toISOString() }, 120);
}

export async function getUpcomingGameweek(
  _competitionId: number | null = null,
): Promise<CurrentGameweek | null> {
  void _competitionId;
  return later({ number: 7, deadlineAt: new Date(Date.now() + 160 * 3600_000).toISOString() }, 120);
}

/**
 * Places gained (+) or lost (-) this gameweek. Null when there is nothing to
 * compare against. A lower rank number is better, so it's previous - current.
 */
export function rankMovement(
  rank: number,
  previousRank: number | null,
): number | null {
  return previousRank === null ? null : previousRank - rank;
}
