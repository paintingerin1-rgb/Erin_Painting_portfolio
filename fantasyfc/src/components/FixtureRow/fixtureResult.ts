// Pure helpers behind FixtureRow (#32), kept out of the component so they can
// be unit tested without rendering.

import type { FixtureRow } from "../../features/matchCenter/matchCenterApi";

export type FixtureLike = Pick<
  FixtureRow,
  "status" | "home_team" | "away_team" | "home_score" | "away_score"
>;

export type TeamResult = "won" | "drawn" | "lost";

/** A finished or live fixture has a score to show; a scheduled one doesn't. */
export function hasScore(f: FixtureLike): boolean {
  return (f.status === "FINISHED" || f.status === "LIVE") && f.home_score != null && f.away_score != null;
}

/** "Fulham 1 – 1 Man United" once there's a score, else "Fulham vs Man United". */
export function scoreLine(f: FixtureLike): string {
  return hasScore(f)
    ? `${f.home_team} ${f.home_score} – ${f.away_score} ${f.away_team}`
    : `${f.home_team} vs ${f.away_team}`;
}

/**
 * How one side did, for its result dot. Only for finished matches: a live
 * score isn't a result yet, and a match with a missing score has none.
 */
export function teamResult(f: FixtureLike, side: "home" | "away"): TeamResult | null {
  if (f.status !== "FINISHED" || f.home_score == null || f.away_score == null) return null;
  const mine = side === "home" ? f.home_score : f.away_score;
  const theirs = side === "home" ? f.away_score : f.home_score;
  if (mine > theirs) return "won";
  if (mine < theirs) return "lost";
  return "drawn";
}
