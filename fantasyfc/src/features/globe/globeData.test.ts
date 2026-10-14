import { describe, it, expect } from "vitest";
import { competitionFor, createLeagueHref, toPanelLeagues } from "./globeData";
import { LEAGUES } from "./leagues";
import type { Competition } from "../leagues/leaguesApi";

const premierLeague = LEAGUES.find((l) => l.slug === "premier-league")!;
const psl = LEAGUES.find((l) => l.slug === "betway-premiership")!;

const competitions: Competition[] = [
  { id: 1, name: "English Premier League", code: "PL", country: "England" },
  { id: 8, name: "Betway Premiership", code: "PSL", country: "South Africa" },
];

describe("competitionFor", () => {
  it("matches a globe league to its database competition by code", () => {
    expect(competitionFor(premierLeague, competitions)?.id).toBe(1);
    expect(competitionFor(psl, competitions)?.id).toBe(8);
  });

  it("is null when the competition isn't in the database", () => {
    const laLiga = LEAGUES.find((l) => l.slug === "la-liga")!;
    expect(competitionFor(laLiga, competitions)).toBeNull();
  });
});

describe("toPanelLeagues", () => {
  const publicLeagues = [
    { id: 30, name: "Newest", competitionId: 1 },
    { id: 20, name: "Mine", competitionId: 1 },
    { id: 10, name: "Oldest", competitionId: 1 },
  ];

  it("maps each public league to a row, marking the ones I'm in", () => {
    const rows = toPanelLeagues(publicLeagues, [{ id: 20 }]);
    expect(rows).toContainEqual({ id: 20, name: "Mine", joined: true });
    expect(rows).toContainEqual({ id: 30, name: "Newest", joined: false });
  });

  it("lists joinable leagues first, keeping the API's order within each group", () => {
    const rows = toPanelLeagues(publicLeagues, [{ id: 20 }]);
    expect(rows.map((r) => r.id)).toEqual([30, 10, 20]);
  });

  it("is empty when the competition has no public leagues", () => {
    expect(toPanelLeagues([], [{ id: 20 }])).toEqual([]);
  });
});

describe("createLeagueHref", () => {
  it("preselects the league's competition on the create form", () => {
    expect(createLeagueHref(premierLeague)).toBe("/leagues/create?competition=PL");
    expect(createLeagueHref(psl)).toBe("/leagues/create?competition=PSL");
  });
});

describe("LEAGUES", () => {
  it("has a unique competition code and country for every league", () => {
    expect(new Set(LEAGUES.map((l) => l.code)).size).toBe(LEAGUES.length);
    expect(new Set(LEAGUES.map((l) => l.id)).size).toBe(LEAGUES.length);
  });
});
