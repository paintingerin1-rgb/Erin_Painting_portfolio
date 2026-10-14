import { describe, it, expect } from "vitest";
import {
  clockMinute,
  espnRowsForMatch,
  fromEspnFixtureId,
  fromEspnId,
  weeklyMatchdays,
  currentSeasonOnly,
  fixtureLoss,
  fixturesFromSchedules,
  minutesPlayed,
  toMatchable,
  type EspnRosterEntry,
  type EspnSummary,
} from "./espn.ts";

const sub = (clock: string) => ({ clock: { displayValue: clock }, substitution: true, redCard: false });
const red = (clock: string) => ({ clock: { displayValue: clock }, substitution: false, redCard: true });

/** A roster entry; `stats` is given as { statName: value } for brevity. */
function entry(
  overrides: Omit<Partial<EspnRosterEntry>, "stats"> & { id?: string; stats?: Record<string, number> },
): EspnRosterEntry {
  const { id = "1", stats = {}, ...rest } = overrides;
  return {
    starter: true,
    subbedIn: false,
    subbedOut: false,
    athlete: { id, displayName: `Player ${id}` },
    plays: [],
    ...rest,
    stats: Object.entries(stats).map(([name, value]) => ({ name, value })),
  };
}

describe("clockMinute", () => {
  it("reads normal and stoppage-time clocks", () => {
    expect(clockMinute("71'")).toBe(71);
    expect(clockMinute("45'+1'")).toBe(46);
    expect(clockMinute("90'+4'")).toBe(94);
    expect(clockMinute("HT")).toBeNull();
  });
});

describe("minutesPlayed", () => {
  it("gives a starter who stays on 90", () => {
    expect(minutesPlayed(entry({}))).toBe(90);
  });

  it("stops a starter's minutes when they're substituted", () => {
    expect(minutesPlayed(entry({ subbedOut: true, plays: [sub("62'")] }))).toBe(62);
  });

  it("starts a substitute's minutes when they come on", () => {
    expect(minutesPlayed(entry({ starter: false, subbedIn: true, plays: [sub("75'")] }))).toBe(15);
  });

  it("handles a substitute who is himself taken off", () => {
    expect(minutesPlayed(entry({ starter: false, subbedIn: true, subbedOut: true, plays: [sub("46'"), sub("80'")] }))).toBe(34);
  });

  it("ends a player's match at a red card", () => {
    expect(minutesPlayed(entry({ plays: [red("30'")] }))).toBe(30);
  });

  it("gives a late substitute at least 1 minute, and an unused one 0", () => {
    expect(minutesPlayed(entry({ starter: false, subbedIn: true, plays: [sub("90'+3'")] }))).toBe(1);
    expect(minutesPlayed(entry({ starter: false }))).toBe(0);
  });
});

describe("toMatchable", () => {
  it("splits the full name using ESPN's last name", () => {
    const el = toMatchable(
      { ...entry({ id: "7" }), athlete: { id: "7", displayName: "Rodri", fullName: "Rodrigo Hernández", lastName: "Hernández" } },
      83,
    );
    expect(el).toEqual({ id: 7, first_name: "Rodrigo", second_name: "Hernández", web_name: "Rodri", team: 83 });
  });
});

describe("fixturesFromSchedules", () => {
  it("keeps one copy of a match both clubs' schedules list", () => {
    const event = {
      id: "401",
      date: "2026-10-10T13:30Z",
      competitions: [
        {
          status: { type: { completed: true } },
          competitors: [
            { homeAway: "home" as const, team: { id: "3841", displayName: "Augsburg" } },
            { homeAway: "away" as const, team: { id: "132", displayName: "Bayern" } },
          ],
        },
      ],
    };
    expect(fixturesFromSchedules([{ events: [event] }, { events: [event] }])).toEqual([
      { id: 401, home: 3841, away: 132, kickoff: "2026-10-10T13:30Z", completed: true, seasonType: null },
    ]);
  });
});

describe("currentSeasonOnly", () => {
  const f = (id: number, kickoff: string, seasonType: string) =>
    ({ id, home: 1, away: 2, kickoff, completed: true, seasonType });

  it("drops stages that ended months ago (J1's spring special and its playoffs)", () => {
    const fixtures = [
      f(1, "2026-03-01T10:00Z", "spring-special"),
      f(2, "2026-05-30T10:00Z", "playoffs"),
      f(3, "2026-09-26T10:00Z", "regular"),
      f(4, "2027-03-06T10:00Z", "regular"),
    ];
    expect(currentSeasonOnly(fixtures, new Date("2026-10-10T00:00Z")).map((x) => x.id)).toEqual([3, 4]);
  });

  it("keeps the regular season, not the playoffs, once playoffs begin", () => {
    const fixtures = [
      f(1, "2026-09-20T10:00Z", "regular"),
      f(2, "2026-10-18T10:00Z", "regular"),
      f(3, "2026-10-25T10:00Z", "regular"),
      f(4, "2026-10-29T10:00Z", "playoffs"),
    ];
    expect(currentSeasonOnly(fixtures, new Date("2026-10-30T00:00Z")).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});

describe("espnRowsForMatch", () => {
  // Home (team 10) 2-1 away (team 20).
  const summary: EspnSummary = {
    header: {
      competitions: [
        {
          competitors: [
            { homeAway: "home", team: { id: "10", displayName: "Home" }, score: "2" },
            { homeAway: "away", team: { id: "20", displayName: "Away" }, score: "1" },
          ],
        },
      ],
    },
    rosters: [
      {
        team: { id: "10" },
        roster: [
          entry({ id: "1", stats: { goalsConceded: 0, saves: 4 }, subbedOut: true, plays: [sub("70'")] }),
          entry({ id: "2", stats: { totalGoals: 2, goalAssists: 1, yellowCards: 1, goalsConceded: 1 } }),
          entry({ id: "3", starter: false }),
        ],
      },
      {
        team: { id: "20" },
        roster: [
          entry({ id: "4", stats: { ownGoals: 1, redCards: 1, goalsConceded: 2 } }),
          entry({ id: "5", stats: { totalGoals: 1 } }),
        ],
      },
    ],
  };
  const { rows, unresolved } = espnRowsForMatch(summary, 305, (id) => (id === 5 ? undefined : id + 100));
  const byPlayer = new Map(rows.map((r) => [r.player_id, r]));

  it("writes a row for each player who played, tagged with the gameweek", () => {
    expect([...byPlayer.keys()].sort()).toEqual([101, 102, 104]);
    expect(rows.every((r) => r.gameweek_id === 305)).toBe(true);
  });

  it("copies goals, assists, own goals, cards and saves", () => {
    expect(byPlayer.get(102)).toMatchObject({ goals_scored: 2, assists: 1, yellow_cards: 1 });
    expect(byPlayer.get(104)).toMatchObject({ own_goals: 1, red_cards: 1 });
    expect(byPlayer.get(101)).toMatchObject({ saves: 4, minutes: 70 });
  });

  it("uses goals conceded while on the pitch for clean sheets", () => {
    // Off at 70' before the goal: a clean sheet.
    expect(byPlayer.get(101)).toMatchObject({ clean_sheets: 1, goals_conceded: 0 });
    expect(byPlayer.get(102)).toMatchObject({ clean_sheets: 0, goals_conceded: 1 });
  });

  it("falls back to the team's goals against when the stat is missing", () => {
    const noStat = espnRowsForMatch(summary, 305, (id) => (id === 5 ? 999 : undefined));
    expect(noStat.rows[0]).toMatchObject({ player_id: 999, goals_conceded: 2 });
  });

  it("reports players it couldn't place", () => {
    expect(unresolved).toEqual(["Player 5"]);
  });
});

describe("weeklyMatchdays", () => {
  it("numbers Monday-to-Sunday weeks from the season's first, skipping empty weeks", () => {
    const kickoffs = [
      "2026-08-01T13:30Z", // Sat
      "2026-08-02T13:30Z", // Sun, same week
      "2026-08-12T17:30Z", // Wed, a midweek round two weeks later
      "2026-08-15T13:30Z", // Sat, same week as that midweek round
      "2026-09-12T13:30Z", // after a break: its own week number, not the next free one
    ];
    const n = weeklyMatchdays(kickoffs);
    expect(kickoffs.map((k) => n.get(k))).toEqual([1, 1, 3, 3, 7]);
  });

  it("doesn't renumber later weeks when a match moves into an empty week", () => {
    const before = weeklyMatchdays(["2026-08-01T13:30Z", "2026-08-15T13:30Z"]);
    const after = weeklyMatchdays(["2026-08-01T13:30Z", "2026-08-08T13:30Z", "2026-08-15T13:30Z"]);
    expect(before.get("2026-08-15T13:30Z")).toBe(after.get("2026-08-15T13:30Z"));
  });

  it("splits weeks at midnight on Sunday night, South African time", () => {
    // 21:59 UTC Sunday is 23:59 SAST Sunday; 22:00 UTC is Monday in SA.
    const n = weeklyMatchdays(["2026-08-02T21:59Z", "2026-08-02T22:00Z"]);
    expect([...n.values()]).toEqual([1, 2]);
  });
});

describe("weeklyMatchdays in other time zones", () => {
  it("keeps a late West Coast Sunday kickoff in Sunday's week for MLS", () => {
    // 19:30 Sunday in Los Angeles is 02:30 UTC on Monday.
    const n = weeklyMatchdays(["2026-08-01T23:00Z", "2026-08-03T02:30Z"], -8);
    expect([...n.values()]).toEqual([1, 1]);
  });

  it("starts the J1 League's week at midnight on Monday, Japan time", () => {
    // 14:59 UTC Sunday is 23:59 JST; 15:00 UTC is Monday in Japan.
    const n = weeklyMatchdays(["2026-08-02T14:59Z", "2026-08-02T15:00Z"], 9);
    expect([...n.values()]).toEqual([1, 2]);
  });
});

describe("ESPN id offsets", () => {
  it("lifts ESPN club and player ids clear of football-data.org and API-Football ids", () => {
    expect(fromEspnId("7081")).toBe(2_000_007_081);
  });

  it("lifts ESPN fixture ids clear of football-data.org match ids, within a Postgres integer", () => {
    expect(fromEspnFixtureId(761440)).toBe(1_500_761_440);
    expect(fromEspnFixtureId(401902084)).toBeLessThan(2 ** 31);
  });
});

describe("fixtureLoss", () => {
  const stored = Array.from({ length: 100 }, (_, i) => i + 1);

  it("allows a normal reload that drops a few matches", () => {
    const incoming = new Set(stored.slice(3));
    expect(fixtureLoss(stored, incoming)).toMatchObject({ lost: [1, 2, 3], tooMany: false });
  });

  it("allows exactly a quarter, but not more", () => {
    expect(fixtureLoss(stored, new Set(stored.slice(25))).tooMany).toBe(false);
    expect(fixtureLoss(stored, new Set(stored.slice(26))).tooMany).toBe(true);
  });

  it("flags a reload that looks like a different season entirely", () => {
    const otherSeason = new Set(Array.from({ length: 100 }, (_, i) => 1000 + i));
    expect(fixtureLoss(stored, otherSeason)).toMatchObject({ share: 1, tooMany: true });
  });

  it("never blocks the first load of a league", () => {
    expect(fixtureLoss([], new Set([1, 2, 3]))).toMatchObject({ lost: [], share: 0, tooMany: false });
  });
});
