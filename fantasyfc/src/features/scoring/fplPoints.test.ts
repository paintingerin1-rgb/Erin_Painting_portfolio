import { describe, expect, it } from "vitest";
import { fplPoints, type GameweekStats } from "./fplPoints";

const zeroStats: GameweekStats = {
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

// Real players, real gameweek 5 (2026-09-18) stats pulled from the FPL live
// endpoint, cross-checked against their published total_points before this
// file was written. If fplPoints ever stops matching these, the SQL mirror
// in the S2-08b migration has almost certainly drifted too.
describe("fplPoints — real gameweek 5 data", () => {
  it("Rushworth (GK, COV): clean sheet, saves, bonus", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      assists: 1,
      cleanSheets: 1,
      saves: 2,
      bonus: 2,
    };
    expect(fplPoints(stats, "Goalkeeper")).toBe(11);
  });

  it("Trafford (GK, LEE): clean sheet, more saves crossing the /3 boundary", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      cleanSheets: 1,
      saves: 5,
      bonus: 3,
    };
    expect(fplPoints(stats, "Goalkeeper")).toBe(10);
  });

  it("Dasilva (DEF, COV): goal, clean sheet, defensive contribution below threshold", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      goalsScored: 1,
      cleanSheets: 1,
      bonus: 3,
      defensiveContribution: 4,
    };
    expect(fplPoints(stats, "Defender")).toBe(15);
  });

  it("Schuster (DEF, BRE): assist, clean sheet, defensive contribution AT threshold", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      assists: 1,
      cleanSheets: 1,
      bonus: 3,
      defensiveContribution: 16,
    };
    expect(fplPoints(stats, "Defender")).toBe(14);
  });

  it("Hall (DEF, NEW): goal, no clean sheet, one conceded, defensive contribution just crosses 10", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      goalsScored: 1,
      goalsConceded: 1,
      bonus: 3,
      defensiveContribution: 10,
    };
    expect(fplPoints(stats, "Defender")).toBe(13);
  });

  it("Buendía (MID, AVL): goal, two conceded (no penalty - MID isn't GK/DEF), defensive contribution crosses 12", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      goalsScored: 1,
      goalsConceded: 2,
      bonus: 3,
      defensiveContribution: 15,
    };
    expect(fplPoints(stats, "Midfielder")).toBe(12);
  });

  it("Tielemans (MID, MUN): nothing but appearance + defensive contribution", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      goalsConceded: 1,
      defensiveContribution: 13,
    };
    expect(fplPoints(stats, "Midfielder")).toBe(4);
  });

  it("Brobbey (FWD, SUN): hat-trick, no clean-sheet points for a forward", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      goalsScored: 3,
      goalsConceded: 5,
      bonus: 3,
    };
    expect(fplPoints(stats, "Forward")).toBe(17);
  });

  it("Kostoulas (FWD, BHA): goal, assist, yellow card, sub-60 minutes still earns 1 appearance point", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 75,
      goalsScored: 1,
      assists: 1,
      cleanSheets: 1,
      yellowCards: 1,
      bonus: 2,
      defensiveContribution: 4,
    };
    expect(fplPoints(stats, "Forward")).toBe(10);
  });
});

// Synthetic edge cases for rules gameweek 5 didn't happen to exercise.
describe("fplPoints — synthetic edge cases", () => {
  it("gives 1 appearance point under 60 minutes, 0 for not playing", () => {
    expect(fplPoints({ ...zeroStats, minutes: 1 }, "Midfielder")).toBe(1);
    expect(fplPoints({ ...zeroStats, minutes: 59 }, "Midfielder")).toBe(1);
    expect(fplPoints({ ...zeroStats, minutes: 60 }, "Midfielder")).toBe(2);
    expect(fplPoints({ ...zeroStats, minutes: 0 }, "Midfielder")).toBe(0);
  });

  it("does not award clean sheet points under 60 minutes even if cleanSheets is set", () => {
    const stats: GameweekStats = { ...zeroStats, minutes: 45, cleanSheets: 1 };
    expect(fplPoints(stats, "Defender")).toBe(1);
  });

  it("awards a penalty save and penalises a penalty miss", () => {
    expect(
      fplPoints({ ...zeroStats, minutes: 90, penaltiesSaved: 1 }, "Goalkeeper"),
    ).toBe(2 + 5);
    expect(
      fplPoints({ ...zeroStats, minutes: 90, penaltiesMissed: 1 }, "Forward"),
    ).toBe(2 - 2);
  });

  it("penalises red cards more than yellow cards, and own goals", () => {
    expect(fplPoints({ ...zeroStats, minutes: 90, redCards: 1 }, "Defender")).toBe(
      2 - 3,
    );
    expect(fplPoints({ ...zeroStats, minutes: 90, yellowCards: 1 }, "Defender")).toBe(
      2 - 1,
    );
    expect(fplPoints({ ...zeroStats, minutes: 90, ownGoals: 1 }, "Defender")).toBe(
      2 - 2,
    );
  });

  it("only docks goals-conceded points for GK/DEF, never MID/FWD", () => {
    const stats: GameweekStats = { ...zeroStats, minutes: 90, goalsConceded: 4 };
    expect(fplPoints(stats, "Goalkeeper")).toBe(2 - 2);
    expect(fplPoints(stats, "Defender")).toBe(2 - 2);
    expect(fplPoints(stats, "Midfielder")).toBe(2);
    expect(fplPoints(stats, "Forward")).toBe(2);
  });

  it("never awards defensive contribution to a goalkeeper regardless of the stat value", () => {
    const stats: GameweekStats = {
      ...zeroStats,
      minutes: 90,
      defensiveContribution: 99,
    };
    expect(fplPoints(stats, "Goalkeeper")).toBe(2);
  });
});
