import { describe, expect, it } from "vitest";
import {
  fplBreakdown,
  fplPoints,
  type GameweekStats,
  type Position,
} from "./fplPoints";
import { GAMEWEEK_5 } from "../../data/gameweek5";

// A zeroed-out stat line. Each test overrides only the field it checks, so
// every expected value is exactly that rule's value from the scoring table,
// not that value plus some unrelated baseline.
function stats(overrides: Partial<GameweekStats> = {}): GameweekStats {
  return {
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ground truth: real players, real gameweek 5 stats, the points FPL published.
// ---------------------------------------------------------------------------
describe("real gameweek 5 players score exactly what FPL awarded", () => {
  it.each(GAMEWEEK_5)(
    "$name ($position, $club) scores $publishedPoints",
    ({ stats: line, position, publishedPoints }) => {
      expect(fplPoints(line, position)).toBe(publishedPoints);
    },
  );
});

// ---------------------------------------------------------------------------
// Rule-by-rule tests, with extra cases at every threshold - that's where
// off-by-one bugs (> instead of >=) hide.
// ---------------------------------------------------------------------------
describe("appearance", () => {
  it("scores 0 for not playing", () => {
    expect(fplPoints(stats({ minutes: 0 }), "Midfielder")).toBe(0);
  });

  it("scores 1 for playing under 60 minutes", () => {
    expect(fplPoints(stats({ minutes: 1 }), "Midfielder")).toBe(1);
  });

  it("scores 1 at 59 minutes - just below the 60-minute boundary", () => {
    expect(fplPoints(stats({ minutes: 59 }), "Midfielder")).toBe(1);
  });

  it("scores 2 at exactly 60 minutes - the boundary itself counts", () => {
    expect(fplPoints(stats({ minutes: 60 }), "Midfielder")).toBe(2);
  });

  it("scores 2 for playing more than 60 minutes", () => {
    expect(fplPoints(stats({ minutes: 90 }), "Midfielder")).toBe(2);
  });
});

describe("goals by position", () => {
  it("scores a goalkeeper's goal as 10", () => {
    expect(fplPoints(stats({ goalsScored: 1 }), "Goalkeeper")).toBe(10);
  });

  it("scores a defender's goal as 6", () => {
    expect(fplPoints(stats({ goalsScored: 1 }), "Defender")).toBe(6);
  });

  it("scores a midfielder's goal as 5", () => {
    expect(fplPoints(stats({ goalsScored: 1 }), "Midfielder")).toBe(5);
  });

  it("scores a forward's goal as 4", () => {
    expect(fplPoints(stats({ goalsScored: 1 }), "Forward")).toBe(4);
  });

  it("scales with multiple goals", () => {
    expect(fplPoints(stats({ goalsScored: 3 }), "Forward")).toBe(12);
  });
});

describe("assists", () => {
  it("scores an assist as 3, regardless of position", () => {
    expect(fplPoints(stats({ assists: 1 }), "Forward")).toBe(3);
  });
});

describe("clean sheets", () => {
  // A clean sheet needs 60+ minutes, which also earns 2 appearance points -
  // so measure the clean sheet as the difference it makes on its own.
  const cleanSheetPoints = (position: Position, minutes = 90) =>
    fplPoints(stats({ minutes, cleanSheets: 1 }), position) -
    fplPoints(stats({ minutes }), position);

  it("scores a GK clean sheet as 4", () => {
    expect(cleanSheetPoints("Goalkeeper")).toBe(4);
  });

  it("scores a DEF clean sheet as 4", () => {
    expect(cleanSheetPoints("Defender")).toBe(4);
  });

  it("scores a MID clean sheet as 1", () => {
    expect(cleanSheetPoints("Midfielder")).toBe(1);
  });

  it("scores a FWD clean sheet as 0", () => {
    expect(cleanSheetPoints("Forward")).toBe(0);
  });

  it("counts a clean sheet at exactly 60 minutes", () => {
    expect(cleanSheetPoints("Defender", 60)).toBe(4);
  });

  it("does not count a clean sheet at 59 minutes - a sub who came off early", () => {
    expect(cleanSheetPoints("Defender", 59)).toBe(0);
  });

  it("does not count a clean sheet for a player who didn't play", () => {
    expect(fplPoints(stats({ cleanSheets: 1 }), "Goalkeeper")).toBe(0);
  });
});

describe("goalkeeper saves", () => {
  it("scores 0 points for 2 saves - under the every-3 threshold", () => {
    expect(fplPoints(stats({ saves: 2 }), "Goalkeeper")).toBe(0);
  });

  it("scores 1 point for 3 saves", () => {
    expect(fplPoints(stats({ saves: 3 }), "Goalkeeper")).toBe(1);
  });

  it("scores 2 points for 6 saves", () => {
    expect(fplPoints(stats({ saves: 6 }), "Goalkeeper")).toBe(2);
  });
});

describe("penalties", () => {
  it("scores a penalty save as 5", () => {
    expect(fplPoints(stats({ penaltiesSaved: 1 }), "Goalkeeper")).toBe(5);
  });

  it("scores a penalty miss as -2", () => {
    expect(fplPoints(stats({ penaltiesMissed: 1 }), "Forward")).toBe(-2);
  });
});

describe("goals conceded", () => {
  it("penalises a DEF -1 for conceding 2", () => {
    expect(fplPoints(stats({ goalsConceded: 2 }), "Defender")).toBe(-1);
  });

  it("still penalises a DEF only -1 for conceding 3 - no partial pairs", () => {
    expect(fplPoints(stats({ goalsConceded: 3 }), "Defender")).toBe(-1);
  });

  it("penalises a GK the same way as a DEF", () => {
    expect(fplPoints(stats({ goalsConceded: 2 }), "Goalkeeper")).toBe(-1);
  });

  it("does not penalise MID/FWD for goals conceded", () => {
    expect(fplPoints(stats({ goalsConceded: 4 }), "Midfielder")).toBe(0);
    expect(fplPoints(stats({ goalsConceded: 4 }), "Forward")).toBe(0);
  });
});

describe("cards and own goals", () => {
  it("scores a yellow card as -1", () => {
    expect(fplPoints(stats({ yellowCards: 1 }), "Defender")).toBe(-1);
  });

  it("scores a red card as -3", () => {
    expect(fplPoints(stats({ redCards: 1 }), "Defender")).toBe(-3);
  });

  it("scores an own goal as -2", () => {
    expect(fplPoints(stats({ ownGoals: 1 }), "Defender")).toBe(-2);
  });
});

describe("defensive contribution", () => {
  it("does not award DEF the bonus at 9 - just below its 10 threshold", () => {
    expect(fplPoints(stats({ defensiveContribution: 9 }), "Defender")).toBe(0);
  });

  it("awards DEF +2 at exactly 10", () => {
    expect(fplPoints(stats({ defensiveContribution: 10 }), "Defender")).toBe(2);
  });

  it("does not award MID the bonus at 11 - just below its 12 threshold", () => {
    expect(fplPoints(stats({ defensiveContribution: 11 }), "Midfielder")).toBe(0);
  });

  it("awards MID +2 at exactly 12", () => {
    expect(fplPoints(stats({ defensiveContribution: 12 }), "Midfielder")).toBe(2);
  });

  it("awards FWD +2 at exactly 12 too", () => {
    expect(fplPoints(stats({ defensiveContribution: 12 }), "Forward")).toBe(2);
  });

  it("caps the bonus at +2 however high the count - it is not per-10/per-12", () => {
    expect(fplPoints(stats({ defensiveContribution: 40 }), "Defender")).toBe(2);
  });

  it("never awards a goalkeeper the defensive-contribution bonus", () => {
    expect(fplPoints(stats({ defensiveContribution: 999 }), "Goalkeeper")).toBe(0);
  });

  it("scores 0 when the value is null - a provider gap, not a real 0", () => {
    expect(fplPoints(stats({ defensiveContribution: null }), "Defender")).toBe(0);
  });
});

describe("bonus", () => {
  it("adds the bonus value from the feed as-is", () => {
    expect(fplPoints(stats({ bonus: 3 }), "Midfielder")).toBe(3);
    expect(fplPoints(stats({ bonus: 2 }), "Midfielder")).toBe(2);
    expect(fplPoints(stats({ bonus: 1 }), "Midfielder")).toBe(1);
  });

  it("scores 0 when bonus is null - a provider gap, not 'definitely no bonus'", () => {
    expect(fplPoints(stats({ bonus: null }), "Midfielder")).toBe(0);
  });
});

describe("combined stat lines", () => {
  const positions: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

  it("sums every category correctly for a full match line, per position", () => {
    // 90 mins (2) + 1 goal + 1 assist (3) + clean sheet + 1 yellow (-1) +
    // bonus 2, with defensive contribution below every threshold.
    const expected: Record<Position, number> = {
      Goalkeeper: 2 + 10 + 3 + 4 - 1 + 2,
      Defender: 2 + 6 + 3 + 4 - 1 + 2,
      Midfielder: 2 + 5 + 3 + 1 - 1 + 2,
      Forward: 2 + 4 + 3 + 0 - 1 + 2,
    };

    for (const position of positions) {
      const line = stats({
        minutes: 90,
        goalsScored: 1,
        assists: 1,
        cleanSheets: 1,
        yellowCards: 1,
        defensiveContribution: 1,
        bonus: 2,
      });
      expect(fplPoints(line, position)).toBe(expected[position]);
    }
  });

  it("a quiet defensive midfielder still scores off appearance, clean sheet and defensive work", () => {
    const line = stats({ minutes: 90, cleanSheets: 1, defensiveContribution: 14 });
    // 2 (appearance) + 1 (MID clean sheet) + 2 (defensive contribution)
    expect(fplPoints(line, "Midfielder")).toBe(5);
  });

  it("a red card can still leave a player positive if he scored first", () => {
    const line = stats({ minutes: 45, goalsScored: 1, redCards: 1 });
    // 1 (under 60) + 6 (DEF goal) - 3 (red)
    expect(fplPoints(line, "Defender")).toBe(4);
  });
});

describe("fplBreakdown", () => {
  it("always sums to fplPoints, and leaves out rules that scored nothing", () => {
    for (const { stats: line, position } of GAMEWEEK_5) {
      const breakdown = fplBreakdown(line, position);
      const sum = breakdown.reduce((total, l) => total + l.points, 0);
      expect(sum).toBe(fplPoints(line, position));
      expect(breakdown.every((l) => l.points !== 0)).toBe(true);
    }
  });
});
