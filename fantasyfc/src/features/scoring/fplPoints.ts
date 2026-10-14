// Official Fantasy Premier League scoring, as a pure function.
//
// In the production app the same rules exist twice: as the fpl_points() SQL
// function that powers the real league standings, and as this TypeScript
// mirror. Two independent implementations of one spec act as a check on
// each other - comparing them is how a clean-sheet bug at the 60-minute
// boundary was caught. Both are validated against real players' published
// FPL scores (see fplPoints.test.ts).
//
// Points are never stored. They're derived from raw match stats every time,
// so a rule change never needs a data fix.

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
  /** Null when the data provider doesn't supply it - scores 0, not an error. */
  bonus: number | null;
  /** Null when the data provider doesn't supply it - scores 0, not an error. */
  defensiveContribution: number | null;
}

export interface PointsLine {
  label: string;
  points: number;
}

// Position-dependent values live in lookup tables, so each line here maps
// to exactly one row of the official scoring table.
const GOAL_POINTS: Record<Position, number> = {
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

// Goalkeepers have no entry: they never score this category.
const DEFENSIVE_CONTRIBUTION_THRESHOLD: Partial<Record<Position, number>> = {
  Defender: 10, // clearances, blocks, interceptions, tackles
  Midfielder: 12, // ...plus recoveries
  Forward: 12,
};

/**
 * Every rule that scored for this stat line, with its points. Rules that
 * contributed 0 are left out. fplPoints() is just the sum of these, so the
 * breakdown shown in the UI can never disagree with the total.
 */
export function fplBreakdown(stats: GameweekStats, position: Position): PointsLine[] {
  const lines: PointsLine[] = [];
  const add = (label: string, points: number) => {
    if (points !== 0) lines.push({ label, points });
  };

  // Appearance: 1 for playing at all, 2 for 60 minutes or more.
  add(
    stats.minutes >= 60 ? "Played 60+ minutes" : "Played under 60 minutes",
    stats.minutes >= 60 ? 2 : stats.minutes > 0 ? 1 : 0,
  );

  add(`Goals (${stats.goalsScored})`, stats.goalsScored * GOAL_POINTS[position]);
  add(`Assists (${stats.assists})`, stats.assists * 3);

  // A clean sheet only counts with 60+ minutes played.
  if (stats.minutes >= 60 && stats.cleanSheets > 0) {
    add("Clean sheet", CLEAN_SHEET_POINTS[position]);
  }

  // 1 point per 3 saves, no partial credit.
  add(`Saves (${stats.saves})`, Math.floor(stats.saves / 3));

  add("Penalty saved", stats.penaltiesSaved * 5);
  add("Penalty missed", stats.penaltiesMissed * -2);

  // -1 per 2 goals conceded, goalkeepers and defenders only.
  if (position === "Goalkeeper" || position === "Defender") {
    add(`Goals conceded (${stats.goalsConceded})`, -Math.floor(stats.goalsConceded / 2));
  }

  add("Yellow card", stats.yellowCards * -1);
  add("Red card", stats.redCards * -3);
  add("Own goal", stats.ownGoals * -2);

  // Flat +2 once the threshold is reached - not per 10 or per 12.
  const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[position];
  if (threshold !== undefined && (stats.defensiveContribution ?? 0) >= threshold) {
    add("Defensive contribution", 2);
  }

  // Bonus arrives already decided (3/2/1) from the feed.
  add("Bonus", stats.bonus ?? 0);

  return lines;
}

/** A player's FPL points for one gameweek. */
export function fplPoints(stats: GameweekStats, position: Position): number {
  return fplBreakdown(stats, position).reduce((sum, line) => sum + line.points, 0);
}
