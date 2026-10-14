// src/features/scoring/fplScoring.test.ts
import { describe, it, expect } from "vitest";
import { fplPoints, type PlayerStatLine } from "./fplScoring";
import type { PlayerPosition } from "../players/playersApi";

// A zeroed-out stat line. Every test overrides only the field(s) it's
// checking, so each expected value in this file is exactly the table's row
// value for that stat, not that value plus some unrelated baseline.
function baseStats(overrides: Partial<PlayerStatLine> = {}): PlayerStatLine {
  return {
    minutes: 0,
    goals: 0,
    assists: 0,
    clean_sheet: false,
    goals_conceded: 0,
    saves: 0,
    penalties_saved: 0,
    penalties_missed: 0,
    own_goals: 0,
    yellow_cards: 0,
    red_cards: 0,
    defensive_contributions: 0,
    bonus: 0,
    ...overrides,
  };
}

describe("fplPoints - appearance", () => {
  it("scores 0 for not playing", () => {
    expect(fplPoints("Midfielder", baseStats({ minutes: 0 }))).toBe(0);
  });

  it("scores 1 for playing under 60 minutes", () => {
    expect(fplPoints("Midfielder", baseStats({ minutes: 1 }))).toBe(1);
  });

  it("scores 1 at 59 minutes - just below the 60-minute boundary", () => {
    expect(fplPoints("Midfielder", baseStats({ minutes: 59 }))).toBe(1);
  });

  it("scores 2 at exactly 60 minutes - the boundary itself counts as 'or more'", () => {
    expect(fplPoints("Midfielder", baseStats({ minutes: 60 }))).toBe(2);
  });

  it("scores 2 for playing more than 60 minutes", () => {
    expect(fplPoints("Midfielder", baseStats({ minutes: 90 }))).toBe(2);
  });
});

describe("fplPoints - goals by position", () => {
  it("scores a goalkeeper's goal as 10 - not 6, GK != DEF", () => {
    expect(fplPoints("Goalkeeper", baseStats({ goals: 1 }))).toBe(10);
  });

  it("scores a defender's goal as 6", () => {
    expect(fplPoints("Defender", baseStats({ goals: 1 }))).toBe(6);
  });

  it("scores a midfielder's goal as 5", () => {
    expect(fplPoints("Midfielder", baseStats({ goals: 1 }))).toBe(5);
  });

  it("scores a forward's goal as 4", () => {
    expect(fplPoints("Forward", baseStats({ goals: 1 }))).toBe(4);
  });

  it("scales with multiple goals", () => {
    expect(fplPoints("Forward", baseStats({ goals: 3 }))).toBe(12);
  });
});

describe("fplPoints - assists", () => {
  it("scores an assist as 3, regardless of position", () => {
    expect(fplPoints("Forward", baseStats({ assists: 1 }))).toBe(3);
  });
});

describe("fplPoints - clean sheets", () => {
  // A clean sheet needs 60+ minutes, which also earns 2 appearance points -
  // so measure the clean sheet as the difference it makes on its own.
  const cleanSheetPoints = (position: PlayerPosition, minutes = 90) =>
    fplPoints(position, baseStats({ minutes, clean_sheet: true })) -
    fplPoints(position, baseStats({ minutes }));

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
    expect(fplPoints("Goalkeeper", baseStats({ clean_sheet: true }))).toBe(0);
  });
});

describe("fplPoints - goalkeeper saves", () => {
  it("scores 0 points for 2 saves - under the every-3 threshold", () => {
    expect(fplPoints("Goalkeeper", baseStats({ saves: 2 }))).toBe(0);
  });

  it("scores 1 point for 3 saves", () => {
    expect(fplPoints("Goalkeeper", baseStats({ saves: 3 }))).toBe(1);
  });

  it("scores 2 points for 6 saves", () => {
    expect(fplPoints("Goalkeeper", baseStats({ saves: 6 }))).toBe(2);
  });
});

describe("fplPoints - penalties", () => {
  it("scores a penalty save as 5", () => {
    expect(fplPoints("Goalkeeper", baseStats({ penalties_saved: 1 }))).toBe(5);
  });

  it("scores a penalty miss as -2", () => {
    expect(fplPoints("Forward", baseStats({ penalties_missed: 1 }))).toBe(-2);
  });
});

describe("fplPoints - goals conceded", () => {
  it("penalises a DEF -1 for conceding 2 (every 2 goals conceded)", () => {
    expect(fplPoints("Defender", baseStats({ goals_conceded: 2 }))).toBe(-1);
  });

  it("still penalises a DEF only -1 for conceding 3 - the third goal hasn't completed another pair yet", () => {
    expect(fplPoints("Defender", baseStats({ goals_conceded: 3 }))).toBe(-1);
  });

  it("penalises a GK the same way as a DEF", () => {
    expect(fplPoints("Goalkeeper", baseStats({ goals_conceded: 2 }))).toBe(-1);
  });

  it("does not penalise MID/FWD for goals conceded - the table only lists GK/DEF", () => {
    expect(fplPoints("Midfielder", baseStats({ goals_conceded: 4 }))).toBe(0);
    expect(fplPoints("Forward", baseStats({ goals_conceded: 4 }))).toBe(0);
  });
});

describe("fplPoints - cards and own goals", () => {
  it("scores a yellow card as -1", () => {
    expect(fplPoints("Defender", baseStats({ yellow_cards: 1 }))).toBe(-1);
  });

  it("scores a red card as -3", () => {
    expect(fplPoints("Defender", baseStats({ red_cards: 1 }))).toBe(-3);
  });

  it("scores an own goal as -2", () => {
    expect(fplPoints("Defender", baseStats({ own_goals: 1 }))).toBe(-2);
  });
});

describe("fplPoints - defensive contribution", () => {
  it("does not award DEF the bonus at 9 CBIT - just below its 10 threshold", () => {
    expect(
      fplPoints("Defender", baseStats({ defensive_contributions: 9 })),
    ).toBe(0);
  });

  it("awards DEF +2 at exactly 10 CBIT", () => {
    expect(
      fplPoints("Defender", baseStats({ defensive_contributions: 10 })),
    ).toBe(2);
  });

  it("does not award MID the bonus at 11 CBIRT - just below its 12 threshold", () => {
    expect(
      fplPoints("Midfielder", baseStats({ defensive_contributions: 11 })),
    ).toBe(0);
  });

  it("awards MID +2 at exactly 12 CBIRT", () => {
    expect(
      fplPoints("Midfielder", baseStats({ defensive_contributions: 12 })),
    ).toBe(2);
  });

  it("awards FWD +2 at exactly 12 CBIRT too", () => {
    expect(
      fplPoints("Forward", baseStats({ defensive_contributions: 12 })),
    ).toBe(2);
  });

  it("caps the bonus at +2 even with a very high count - it is not per-10/per-12", () => {
    expect(
      fplPoints("Defender", baseStats({ defensive_contributions: 40 })),
    ).toBe(2);
  });

  it("never awards GK the defensive-contribution bonus - no row for GK in the table", () => {
    expect(
      fplPoints("Goalkeeper", baseStats({ defensive_contributions: 999 })),
    ).toBe(0);
  });

  it("scores 0 when defensive_contributions is null - a provider gap, not a real 0", () => {
    expect(
      fplPoints("Defender", baseStats({ defensive_contributions: null })),
    ).toBe(0);
  });
});

describe("fplPoints - bonus", () => {
  it("adds the stored bonus value as-is", () => {
    expect(fplPoints("Midfielder", baseStats({ bonus: 3 }))).toBe(3);
    expect(fplPoints("Midfielder", baseStats({ bonus: 2 }))).toBe(2);
    expect(fplPoints("Midfielder", baseStats({ bonus: 1 }))).toBe(1);
  });

  it("scores 0 when bonus is null - a provider gap, not 'definitely no bonus'", () => {
    expect(fplPoints("Midfielder", baseStats({ bonus: null }))).toBe(0);
  });
});

describe("fplPoints - realistic combined lines", () => {
  const positions: PlayerPosition[] = [
    "Goalkeeper",
    "Defender",
    "Midfielder",
    "Forward",
  ];

  it("sums every category correctly for a full match line, per position", () => {
    // 90 mins (2) + 1 goal (position rate) + 1 assist (3) + clean sheet
    // (position rate) + 1 yellow (-1) + bonus 2, with defensive_contributions
    // deliberately left below every position's threshold so it contributes 0
    // and isolates the categories actually under test here.
    const expected: Record<PlayerPosition, number> = {
      Goalkeeper: 2 + 10 + 3 + 4 - 1 + 2, // 20
      Defender: 2 + 6 + 3 + 4 - 1 + 2, // 16
      Midfielder: 2 + 5 + 3 + 1 - 1 + 2, // 12
      Forward: 2 + 4 + 3 + 0 - 1 + 2, // 10
    };

    for (const position of positions) {
      const stats = baseStats({
        minutes: 90,
        goals: 1,
        assists: 1,
        clean_sheet: true,
        yellow_cards: 1,
        defensive_contributions: 1,
        bonus: 2,
      });
      expect(fplPoints(position, stats)).toBe(expected[position]);
    }
  });

  it("a quiet defensive midfielder can still score well purely off defensive contribution + clean sheet + appearance", () => {
    const stats = baseStats({
      minutes: 90,
      clean_sheet: true,
      defensive_contributions: 14,
    });
    // 2 (appearance) + 1 (MID clean sheet) + 2 (defensive contribution) = 5
    expect(fplPoints("Midfielder", stats)).toBe(5);
  });

  it("a red card can still leave a player positive if they scored before being sent off", () => {
    const stats = baseStats({ minutes: 45, goals: 1, red_cards: 1 });
    // 1 (appearance, under 60) + 6 (DEF goal) - 3 (red) = 4
    expect(fplPoints("Defender", stats)).toBe(4);
  });
});
