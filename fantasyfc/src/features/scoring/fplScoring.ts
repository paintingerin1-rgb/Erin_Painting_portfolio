// Pure TypeScript mirror of the database's public.fpl_points() (S2-08b).
// Field names follow player_gameweek_stats's columns, with three differences:
// goals (goals_scored), clean_sheet as a boolean (clean_sheets, 0/1) and
// defensive_contributions (defensive_contribution).

import type { PlayerPosition } from "../players/playersApi";

export interface PlayerStatLine {
  minutes: number;
  goals: number;
  assists: number;
  clean_sheet: boolean;
  goals_conceded: number;
  saves: number;
  penalties_saved: number;
  penalties_missed: number;
  own_goals: number;
  yellow_cards: number;
  red_cards: number;
  defensive_contributions: number | null; // null when the provider doesn't supply CBIT/CBIRT
  bonus: number | null; // null when the provider doesn't supply BPS-based bonus
}

const GOALS_BY_POSITION: Record<PlayerPosition, number> = {
  Goalkeeper: 10, // not 6 - GK and DEF are scored differently here
  Defender: 6,
  Midfielder: 5,
  Forward: 4,
};

const CLEAN_SHEET_BY_POSITION: Record<PlayerPosition, number> = {
  Goalkeeper: 4,
  Defender: 4,
  Midfielder: 1,
  Forward: 0,
};

// Goalkeeper has no entry - they never score this category.
const DEFENSIVE_CONTRIBUTION_THRESHOLD: Partial<
  Record<PlayerPosition, number>
> = {
  Defender: 10, // CBIT
  Midfielder: 12, // CBIRT
  Forward: 12, // CBIRT
};
const DEFENSIVE_CONTRIBUTION_POINTS = 2; // flat bonus once the threshold is met, not per-count

const GOALS_CONCEDED_PENALISED_POSITIONS: ReadonlySet<PlayerPosition> = new Set(
  ["Goalkeeper", "Defender"],
);

export function fplPoints(
  position: PlayerPosition,
  stats: PlayerStatLine,
): number {
  let points = 0;

  if (stats.minutes >= 60) points += 2;
  else if (stats.minutes > 0) points += 1; // 0 minutes played earns nothing

  points += stats.goals * GOALS_BY_POSITION[position];
  points += stats.assists * 3;

  // Only counts with 60+ minutes played, as in fpl_points() and FPL's rules.
  if (stats.clean_sheet && stats.minutes >= 60) {
    points += CLEAN_SHEET_BY_POSITION[position];
  }

  points += Math.floor(stats.saves / 3); // 1 point per 3 saves, no partial credit

  points += stats.penalties_saved * 5;
  points += stats.penalties_missed * -2;

  // -1 per 2 goals conceded, GK/DEF only (MID/FWD aren't penalised for this)
  if (GOALS_CONCEDED_PENALISED_POSITIONS.has(position)) {
    points += Math.floor(stats.goals_conceded / 2) * -1;
  }

  points += stats.yellow_cards * -1;
  points += stats.red_cards * -3;
  points += stats.own_goals * -2;

  const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[position];
  if (
    threshold !== undefined &&
    (stats.defensive_contributions ?? 0) >= threshold
  ) {
    points += DEFENSIVE_CONTRIBUTION_POINTS;
  }

  // Bonus - already computed (top 3 by BPS get 3/2/1) and stored; added
  // as-is. Null (provider gap) scores 0.
  points += stats.bonus ?? 0;

  return points;
}
