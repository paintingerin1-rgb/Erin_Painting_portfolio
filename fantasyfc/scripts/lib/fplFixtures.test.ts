import { describe, expect, it } from "vitest";
import { fplFixtureStatus } from "./fplFixtures.ts";

// The states below are what the FPL feed returned for Gameweek 6 on
// 12 Oct 2026.
describe("fplFixtureStatus", () => {
  it("is upcoming before kickoff", () => {
    expect(fplFixtureStatus({ started: false, finished: false, finished_provisional: false })).toBe(
      "UPCOMING",
    );
  });

  it("is live while the match is being played", () => {
    expect(fplFixtureStatus({ started: true, finished: false, finished_provisional: false })).toBe(
      "LIVE",
    );
  });

  it("is completed at full time, before FPL confirms the gameweek", () => {
    expect(fplFixtureStatus({ started: true, finished: false, finished_provisional: true })).toBe(
      "COMPLETED",
    );
  });

  it("is completed once FPL confirms the gameweek", () => {
    expect(fplFixtureStatus({ started: true, finished: true, finished_provisional: true })).toBe(
      "COMPLETED",
    );
  });

  it("falls back to finished when the feed has no finished_provisional", () => {
    expect(fplFixtureStatus({ started: true, finished: true })).toBe("COMPLETED");
    expect(fplFixtureStatus({ started: true, finished: false })).toBe("LIVE");
  });
});
