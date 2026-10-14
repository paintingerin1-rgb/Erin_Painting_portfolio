import { describe, it, expect } from "vitest";
import { crosswalkClubs, mergeGameweekRows, statsRowsForFixture, toMatchable, type StatsRow } from "./apiFootballStats.ts";
import type { AfFixturePlayerStats, AfFixtureTeamPlayers } from "./apiFootball.ts";
import { matchFplPlayers } from "../s2-08b-match-players.ts";

describe("crosswalkClubs", () => {
  // Our clubs 1-4 (football-data ids), their teams 101-104 (API-Football ids).
  const ours = [
    { home: 1, away: 2, kickoff: "2026-08-15T13:00:00Z" },
    { home: 3, away: 4, kickoff: "2026-08-15T15:00:00Z" },
    { home: 2, away: 3, kickoff: "2026-08-22T13:00:00Z" },
    { home: 4, away: 1, kickoff: "2026-08-22T15:00:00Z" },
  ];
  const theirs = [
    { home: 101, away: 102, kickoff: "2026-08-15T13:00:00+00:00" },
    { home: 103, away: 104, kickoff: "2026-08-15T15:00:00+00:00" },
    { home: 102, away: 103, kickoff: "2026-08-22T13:00:00+00:00" },
    { home: 104, away: 101, kickoff: "2026-08-22T15:00:00+00:00" },
  ];

  it("maps teams by kickoff time, without comparing names", () => {
    expect(crosswalkClubs(theirs, ours)).toEqual(
      new Map([
        [101, 1],
        [102, 2],
        [103, 3],
        [104, 4],
      ]),
    );
  });

  it("ignores kickoffs shared by two matches, and needs two votes to map a team", () => {
    const sameTime = ours.map((f) => ({ ...f, kickoff: "2026-08-15T13:00:00Z" }));
    expect(crosswalkClubs(theirs, sameTime).size).toBe(0);
    // Only the first weekend: one vote each.
    expect(crosswalkClubs(theirs.slice(0, 2), ours.slice(0, 2)).size).toBe(0);
  });

  it("keeps mappings already stored and doesn't hand their club to anyone else", () => {
    const known = new Map([[999, 1]]);
    const result = crosswalkClubs(theirs, ours, known);
    expect(result.get(999)).toBe(1);
    expect(result.has(101)).toBe(false);
    // 103's two matches don't involve club 1, so it is still placed.
    expect(result.get(103)).toBe(3);
  });

  it("uses clubs it has placed to untangle matches that share a kickoff", () => {
    // 101 v 102 is the only match at T3 and T4, so those two are placed
    // first. 105 and 106 only ever play alongside them, at T1 and T2.
    const T = (h: number) => `2026-09-0${h}T13:00:00Z`;
    const ourSlots = [
      { home: 1, away: 2, kickoff: T(1) },
      { home: 5, away: 6, kickoff: T(1) },
      { home: 2, away: 1, kickoff: T(2) },
      { home: 6, away: 5, kickoff: T(2) },
      { home: 1, away: 2, kickoff: T(3) },
      { home: 2, away: 1, kickoff: T(4) },
    ];
    const theirSlots = ourSlots.map((f) => ({ ...f, home: f.home + 100, away: f.away + 100 }));
    expect(crosswalkClubs(theirSlots, ourSlots)).toEqual(
      new Map([
        [101, 1],
        [102, 2],
        [105, 5],
        [106, 6],
      ]),
    );
  });
});

describe("toMatchable + the S2-08b matcher", () => {
  const players = [
    { id: 10, name: "Thomas Müller", club_id: 5 },
    { id: 11, name: "Vinícius Júnior", club_id: 6 },
    { id: 12, name: "Jamal Musiala", club_id: 5 },
  ];
  const clubs = new Map([
    [205, 5],
    [206, 6],
  ]);

  it("matches an initial-and-surname match sheet name within the club", () => {
    const el = toMatchable({ id: 1, name: "T. Müller" }, 205);
    expect(el).toMatchObject({ first_name: "T", second_name: "Müller" });
    expect(matchFplPlayers([el], players, clubs).matched.get(1)).toBe(10);
  });

  it("matches full names exactly", () => {
    const el = toMatchable({ id: 2, name: "Vinícius Júnior" }, 206);
    expect(matchFplPlayers([el], players, clubs).matched.get(2)).toBe(11);
  });

  it("doesn't match a player at the wrong club", () => {
    const el = toMatchable({ id: 3, name: "J. Musiala" }, 206);
    expect(matchFplPlayers([el], players, clubs).matched.has(3)).toBe(false);
  });
});

function stats(overrides: Partial<{
  minutes: number; goals: number; assists: number; saves: number; yellow: number; red: number;
  penSaved: number; penMissed: number; tackles: number; blocks: number; interceptions: number;
}> = {}): AfFixturePlayerStats {
  const o = { minutes: 90, goals: 0, assists: 0, saves: 0, yellow: 0, red: 0, penSaved: 0, penMissed: 0, tackles: 0, blocks: 0, interceptions: 0, ...overrides };
  return {
    games: { minutes: o.minutes, position: "D", substitute: false },
    goals: { total: o.goals || null, conceded: 0, assists: o.assists || null, saves: o.saves || null },
    cards: { yellow: o.yellow, red: o.red },
    penalty: { saved: o.penSaved || null, missed: o.penMissed },
    tackles: { total: o.tackles || null, blocks: o.blocks || null, interceptions: o.interceptions || null },
  };
}

describe("statsRowsForFixture", () => {
  // Home (API team 1) won 2-0 against away (API team 2).
  const teams: AfFixtureTeamPlayers[] = [
    {
      team: { id: 1, name: "Home", code: null },
      players: [
        { player: { id: 100, name: "A. Keeper" }, statistics: [stats({ saves: 4 })] },
        { player: { id: 101, name: "B. Striker" }, statistics: [stats({ minutes: 70, goals: 2, yellow: 1, tackles: 1, blocks: 2, interceptions: 3 })] },
        { player: { id: 102, name: "C. Sub" }, statistics: [stats({ minutes: 20 })] },
        { player: { id: 103, name: "D. Bench" }, statistics: [stats({ minutes: 0 })] },
      ],
    },
    {
      team: { id: 2, name: "Away", code: null },
      players: [
        { player: { id: 200, name: "E. Defender" }, statistics: [stats({ red: 1, penMissed: 1 })] },
        { player: { id: 201, name: "F. Unknown" }, statistics: [stats()] },
      ],
    },
  ];
  const goalsAgainst = (team: number) => (team === 1 ? 0 : 2);
  const resolve = (id: number) => (id === 201 ? undefined : id + 5000);
  const { rows, unresolved } = statsRowsForFixture(teams, 207, goalsAgainst, resolve);
  const byPlayer = new Map(rows.map((r) => [r.player_id, r]));

  it("writes a row per player who played, tagged with the gameweek", () => {
    expect([...byPlayer.keys()].sort()).toEqual([5100, 5101, 5102, 5200]);
    expect(rows.every((r) => r.gameweek_id === 207)).toBe(true);
  });

  it("copies goals, saves, cards and penalties, treating nulls as zero", () => {
    expect(byPlayer.get(5101)).toMatchObject({ goals_scored: 2, yellow_cards: 1, assists: 0 });
    expect(byPlayer.get(5100)).toMatchObject({ saves: 4, goals_scored: 0 });
    expect(byPlayer.get(5200)).toMatchObject({ red_cards: 1, penalties_missed: 1 });
  });

  it("gives a clean sheet only to 60+ minute players on a side that conceded none", () => {
    expect(byPlayer.get(5100)?.clean_sheets).toBe(1);
    expect(byPlayer.get(5101)?.clean_sheets).toBe(1);
    expect(byPlayer.get(5102)?.clean_sheets).toBe(0);
    expect(byPlayer.get(5200)).toMatchObject({ clean_sheets: 0, goals_conceded: 2 });
  });

  it("counts tackles, blocks and interceptions as defensive contribution", () => {
    expect(byPlayer.get(5101)?.defensive_contribution).toBe(6);
  });

  it("reports players it couldn't place instead of guessing", () => {
    expect(unresolved).toEqual(["F. Unknown"]);
  });
});

describe("mergeGameweekRows", () => {
  const base: StatsRow = {
    player_id: 1, gameweek_id: 201, minutes: 90, goals_scored: 1, assists: 0, clean_sheets: 1,
    goals_conceded: 0, own_goals: 0, penalties_saved: 0, penalties_missed: 0, yellow_cards: 0,
    red_cards: 0, saves: 0, bonus: 0, defensive_contribution: 3,
  };

  it("sums a player's two matches in one gameweek", () => {
    const merged = mergeGameweekRows([base, { ...base, goals_scored: 2, clean_sheets: 0, goals_conceded: 1 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ minutes: 180, goals_scored: 3, clean_sheets: 1, goals_conceded: 1, defensive_contribution: 6 });
  });

  it("keeps different gameweeks apart", () => {
    expect(mergeGameweekRows([base, { ...base, gameweek_id: 202 }])).toHaveLength(2);
  });
});
