import { describe, it, expect } from "vitest";
import { buildGameweeks, currentSeason, fromApiFootballId, gameweekId, selectCompetitions, type Competition } from "./competitions.ts";
import { fixtureStatus, roundNumber, shortCodes } from "./apiFootball.ts";

const PL = { id: 1, code: "PL" };
const LALIGA = { id: 2, code: "PD" };

describe("gameweekId", () => {
  it("keeps the Premier League's FPL numbering", () => {
    expect(gameweekId(PL, 1)).toBe(1);
    expect(gameweekId(PL, 38)).toBe(38);
  });

  it("puts other competitions in their own hundred, so gameweek 1s don't collide", () => {
    expect(gameweekId(LALIGA, 1)).toBe(201);
    expect(gameweekId({ id: 8, code: "PSL" }, 30)).toBe(830);
  });

  it("rejects numbers that would spill into the next competition's range", () => {
    expect(() => gameweekId(LALIGA, 100)).toThrow();
    expect(() => gameweekId(LALIGA, 0)).toThrow();
  });
});

describe("fromApiFootballId", () => {
  it("lifts API-Football ids clear of football-data.org's", () => {
    expect(fromApiFootballId(2696)).toBe(1_000_002_696);
  });
});

describe("currentSeason", () => {
  it("is the year the season started in", () => {
    expect(currentSeason(new Date("2026-10-10T00:00:00Z"))).toBe(2026);
    expect(currentSeason(new Date("2027-03-01T00:00:00Z"))).toBe(2026);
    expect(currentSeason(new Date("2027-07-01T00:00:00Z"))).toBe(2027);
  });
});

describe("buildGameweeks", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const fixtures = [
    { matchday: 1, kickoff: "2026-08-16T19:00:00Z" },
    { matchday: 1, kickoff: "2026-08-15T17:00:00Z" },
    { matchday: 2, kickoff: "2026-10-10T13:00:00Z" },
    { matchday: 3, kickoff: "2026-10-17T14:00:00Z" },
    { matchday: 4, kickoff: null },
    { matchday: null, kickoff: "2026-11-01T14:00:00Z" },
  ];

  it("sets each deadline 90 minutes before the matchday's first kickoff", () => {
    const [gw1] = buildGameweeks(LALIGA, fixtures, now);
    expect(gw1).toMatchObject({ id: 201, competition_id: 2, number: 1, deadline_at: "2026-08-15T15:30:00.000Z" });
  });

  it("marks the latest gameweek whose deadline has passed as current", () => {
    const rows = buildGameweeks(LALIGA, fixtures, now);
    expect(rows.filter((r) => r.is_current).map((r) => r.number)).toEqual([2]);
  });

  it("leaves out matchdays with no kickoff time and fixtures with no matchday", () => {
    expect(buildGameweeks(LALIGA, fixtures, now).map((r) => r.number)).toEqual([1, 2, 3]);
  });

  it("has no current gameweek before the season starts", () => {
    const rows = buildGameweeks(LALIGA, fixtures, new Date("2026-08-01T00:00:00Z"));
    expect(rows.some((r) => r.is_current)).toBe(false);
  });
});

describe("selectCompetitions", () => {
  const all = [
    { id: 1, code: "PL" },
    { id: 2, code: "PD" },
    { id: 8, code: "PSL" },
  ] as Competition[];

  it("--all means every competition but the Premier League", () => {
    expect(selectCompetitions(all, ["--all"]).map((c) => c.code)).toEqual(["PD", "PSL"]);
  });

  it("accepts codes in any case", () => {
    expect(selectCompetitions(all, ["psl", "--gameweek=3"]).map((c) => c.code)).toEqual(["PSL"]);
  });

  it("refuses an unknown code or no selection at all", () => {
    expect(() => selectCompetitions(all, ["XYZ"])).toThrow(/Unknown competition/);
    expect(() => selectCompetitions(all, [])).toThrow(/--all/);
  });
});

describe("API-Football helpers", () => {
  it("reads the matchday out of a round name", () => {
    expect(roundNumber("Regular Season - 7")).toBe(7);
    expect(roundNumber("Final")).toBeNull();
  });

  it("maps fixture status codes", () => {
    expect(fixtureStatus("FT")).toBe("COMPLETED");
    expect(fixtureStatus("PEN")).toBe("COMPLETED");
    expect(fixtureStatus("HT")).toBe("LIVE");
    expect(fixtureStatus("NS")).toBe("UPCOMING");
    expect(fixtureStatus("PST")).toBe("UPCOMING");
  });

  it("gives every club a unique three-letter code", () => {
    const codes = shortCodes([
      { id: 1, name: "Orlando Pirates", code: "ORL" },
      { id: 2, name: "Orbit College", code: null },
      { id: 3, name: "Kaizer Chiefs", code: "KAI" },
      { id: 4, name: "Orlando Something", code: "ORL" },
    ]);
    expect(codes.get(1)).toBe("ORL");
    expect(codes.get(2)).toBe("ORB");
    expect(codes.get(4)).toBe("OR2");
    expect(new Set(codes.values()).size).toBe(4);
  });
});
