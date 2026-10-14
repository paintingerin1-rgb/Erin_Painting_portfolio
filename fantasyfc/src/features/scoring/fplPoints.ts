// TypeScript mirror of the fpl_points() SQL function in the S2-08b
// migration. Keep the two in lock-step - fplPoints.test.ts cross-checks
// both against real published FPL scores.
//
// football_players.position stores the full words 'Goalkeeper' / 'Defender'
// / 'Midfielder' / 'Forward' (see DraftPage.tsx POSITION_LIMITS), not the
// FPL API's short codes.

export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export interface GameweekStats {
  minutes: number;
  goalsScored: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  defensiveContribution: number;
}

const GOALS_SCORED_POINTS: Record<Position, number> = {
  Goalkeeper: 10,
  Defender: 6,
  Midfielder: 5,
  Forward: 4,
};

const CLEAN_SHEET_POINTS: Record<Position, number> = {
  Goalkeeper: 4,
  Defender: 4,
  Midfielder: 1,
  Forward: 0,
};

const DEFENSIVE_CONTRIBUTION_THRESHOLD: Partial<Record<Position, number>> = {
  Defender: 10,
  Midfielder: 12,
  Forward: 12,
};

export function fplPoints(stats: GameweekStats, position: Position): number {
  let points = 0;

  // Appearance
  points += stats.minutes >= 60 ? 2 : stats.minutes > 0 ? 1 : 0;

  // Goals
  points += stats.goalsScored * GOALS_SCORED_POINTS[position];

  // Assists
  points += stats.assists * 3;

  // Clean sheet - only counts with 60+ minutes played
  if (stats.minutes >= 60 && stats.cleanSheets > 0) {
    points += CLEAN_SHEET_POINTS[position];
  }

  // Every 3 saves: 1 pt
  points += Math.floor(stats.saves / 3);

  // Penalties
  points += stats.penaltiesSaved * 5;
  points -= stats.penaltiesMissed * 2;

  // Every 2 goals conceded: -1 pt, GK/DEF only
  if (position === "Goalkeeper" || position === "Defender") {
    points -= Math.floor(stats.goalsConceded / 2);
  }

  // Cards
  points -= stats.yellowCards * 1;
  points -= stats.redCards * 3;

  // Own goals
  points -= stats.ownGoals * 2;

  // Defensive contribution: +2, DEF at 10+ CBIT, MID/FWD at 12+ CBIRT, not GK
  const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[position];
  if (threshold !== undefined && stats.defensiveContribution >= threshold) {
    points += 2;
  }

  // Bonus, straight from the feed (already computed from BPS)
  points += stats.bonus;

  return points;
}
