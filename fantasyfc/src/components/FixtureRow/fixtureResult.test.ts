import { describe, it, expect } from "vitest";
import { hasScore, scoreLine, teamResult, type FixtureLike } from "./fixtureResult";

function fixture(over: Partial<FixtureLike> = {}): FixtureLike {
  return {
    status: "FINISHED",
    home_team: "Fulham",
    away_team: "Man United",
    home_score: 1,
    away_score: 1,
    ...over,
  };
}

describe("scoreLine", () => {
  it("reads like a result once the match has a score", () => {
    expect(scoreLine(fixture())).toBe("Fulham 1 – 1 Man United");
    expect(scoreLine(fixture({ status: "LIVE", home_score: 2, away_score: 0 }))).toBe(
      "Fulham 2 – 0 Man United",
    );
  });

  it("uses vs before kickoff", () => {
    expect(
      scoreLine(fixture({ status: "SCHEDULED", home_score: null, away_score: null })),
    ).toBe("Fulham vs Man United");
  });

  it("falls back to vs when a finished match is missing a score", () => {
    expect(scoreLine(fixture({ away_score: null }))).toBe("Fulham vs Man United");
    expect(hasScore(fixture({ home_score: null }))).toBe(false);
  });
});

describe("teamResult", () => {
  it("is won for the winner and lost for the loser", () => {
    const homeWin = fixture({ home_score: 3, away_score: 1 });
    expect(teamResult(homeWin, "home")).toBe("won");
    expect(teamResult(homeWin, "away")).toBe("lost");

    const awayWin = fixture({ home_score: 0, away_score: 2 });
    expect(teamResult(awayWin, "home")).toBe("lost");
    expect(teamResult(awayWin, "away")).toBe("won");
  });

  it("is drawn for both sides of a draw", () => {
    expect(teamResult(fixture(), "home")).toBe("drawn");
    expect(teamResult(fixture(), "away")).toBe("drawn");
  });

  it("is null until the match is finished, or when a score is missing", () => {
    expect(teamResult(fixture({ status: "LIVE", home_score: 1, away_score: 0 }), "home")).toBeNull();
    expect(
      teamResult(fixture({ status: "SCHEDULED", home_score: null, away_score: null }), "away"),
    ).toBeNull();
    expect(teamResult(fixture({ home_score: null }), "home")).toBeNull();
  });
});
