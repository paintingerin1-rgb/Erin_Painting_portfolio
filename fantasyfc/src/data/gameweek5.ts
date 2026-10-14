import type { GameweekStats, Position } from "../features/scoring/fplPoints";

export interface RealPlayerLine {
  name: string;
  club: string;
  position: Position;
  stats: GameweekStats;
  /** What FPL actually awarded this player for gameweek 5. */
  publishedPoints: number;
}

const zero: GameweekStats = {
  minutes: 0,
  goalsScored: 0,
  assists: 0,
  cleanSheets: 0,
  goalsConceded: 0,
  ownGoals: 0,
  penaltiesSaved: 0,
  penaltiesMissed: 0,
  yellowCards: 0,
  redCards: 0,
  saves: 0,
  bonus: 0,
  defensiveContribution: 0,
};

// Real gameweek 5 stat lines from the official FPL live endpoint, with the
// points FPL published for each. Chosen to cover every position and the
// rules with thresholds (saves, defensive contribution, 60 minutes).
export const GAMEWEEK_5: RealPlayerLine[] = [
  { name: "Rushworth", club: "COV", position: "Goalkeeper", publishedPoints: 11,
    stats: { ...zero, minutes: 90, assists: 1, cleanSheets: 1, saves: 2, bonus: 2 } },
  { name: "Trafford", club: "LEE", position: "Goalkeeper", publishedPoints: 10,
    stats: { ...zero, minutes: 90, cleanSheets: 1, saves: 5, bonus: 3 } },
  { name: "Dasilva", club: "COV", position: "Defender", publishedPoints: 15,
    stats: { ...zero, minutes: 90, goalsScored: 1, cleanSheets: 1, bonus: 3, defensiveContribution: 4 } },
  { name: "Schuster", club: "BRE", position: "Defender", publishedPoints: 14,
    stats: { ...zero, minutes: 90, assists: 1, cleanSheets: 1, bonus: 3, defensiveContribution: 16 } },
  { name: "Hall", club: "NEW", position: "Defender", publishedPoints: 13,
    stats: { ...zero, minutes: 90, goalsScored: 1, goalsConceded: 1, bonus: 3, defensiveContribution: 10 } },
  { name: "Buendía", club: "AVL", position: "Midfielder", publishedPoints: 12,
    stats: { ...zero, minutes: 90, goalsScored: 1, goalsConceded: 2, bonus: 3, defensiveContribution: 15 } },
  { name: "Tielemans", club: "MUN", position: "Midfielder", publishedPoints: 4,
    stats: { ...zero, minutes: 90, goalsConceded: 1, defensiveContribution: 13 } },
  { name: "Brobbey", club: "SUN", position: "Forward", publishedPoints: 17,
    stats: { ...zero, minutes: 90, goalsScored: 3, goalsConceded: 5, bonus: 3 } },
  { name: "Kostoulas", club: "BHA", position: "Forward", publishedPoints: 10,
    stats: { ...zero, minutes: 75, goalsScored: 1, assists: 1, cleanSheets: 1, yellowCards: 1, bonus: 2, defensiveContribution: 4 } },
];
