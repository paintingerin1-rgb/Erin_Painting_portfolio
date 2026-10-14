import { describe, expect, it } from "vitest";
import { filterPublicLeagues } from "./joinSearch";

const leagues = [
  { id: 1, name: "Thunder Derby FL", competitionId: 2 },
  { id: 2, name: "Velvet Society League", competitionId: 1 },
  { id: 3, name: "Coastal Assembly FL", competitionId: 9 },
];
const competitions = new Map([
  [1, "English Premier League"],
  [2, "LaLiga"],
  [9, "Major League Soccer"],
]);

describe("filterPublicLeagues", () => {
  it("keeps every league for an empty or blank query", () => {
    expect(filterPublicLeagues(leagues, "", competitions)).toEqual(leagues);
    expect(filterPublicLeagues(leagues, "   ", competitions)).toEqual(leagues);
  });

  it("matches part of a league name, ignoring case", () => {
    expect(filterPublicLeagues(leagues, "velv", competitions).map((l) => l.id)).toEqual([2]);
  });

  it("matches the competition name too", () => {
    expect(filterPublicLeagues(leagues, "laliga", competitions).map((l) => l.id)).toEqual([1]);
  });

  it("needs every word to match, across name and competition", () => {
    expect(filterPublicLeagues(leagues, "fl soccer", competitions).map((l) => l.id)).toEqual([3]);
    expect(filterPublicLeagues(leagues, "thunder soccer", competitions)).toEqual([]);
  });

  it("ignores accents", () => {
    const accented = [{ id: 4, name: "Atlético Legends", competitionId: 2 }];
    expect(filterPublicLeagues(accented, "atletico", competitions)).toEqual(accented);
  });
});
