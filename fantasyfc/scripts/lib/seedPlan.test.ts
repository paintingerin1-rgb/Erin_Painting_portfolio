import { describe, expect, it } from "vitest";
import {
  competitionArg,
  countArg,
  demoChatHistory,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  leaguesToCreate,
  makeJoinCode,
  pickDemoLeague,
  seasonDraftTime,
} from "./seedPlan.ts";

describe("makeJoinCode", () => {
  it("makes a 6 character code from the unambiguous alphabet", () => {
    const code = makeJoinCode(new Set());
    expect(code).toHaveLength(JOIN_CODE_LENGTH);
    expect([...code].every((c) => JOIN_CODE_ALPHABET.includes(c))).toBe(true);
  });

  it("leaves out the characters that get misread", () => {
    expect(JOIN_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it("records the code it hands out", () => {
    const used = new Set<string>();
    const code = makeJoinCode(used);
    expect(used.has(code)).toBe(true);
  });

  it("never repeats a code, even across thousands of calls", () => {
    const used = new Set<string>();
    const codes = Array.from({ length: 5000 }, () => makeJoinCode(used));
    expect(new Set(codes).size).toBe(5000);
  });

  it("skips a code that's already taken", () => {
    // First 6 draws are all 'A', then 'B': the taken code AAAAAA must be skipped.
    const draws = [...Array(6).fill(0), ...Array(6).fill(1 / JOIN_CODE_ALPHABET.length)];
    let i = 0;
    const rand = () => draws[i++];
    expect(makeJoinCode(new Set(["AAAAAA"]), rand)).toBe("BBBBBB");
  });

  it("can reach both ends of the alphabet", () => {
    expect(makeJoinCode(new Set(), () => 0)).toBe("AAAAAA");
    expect(makeJoinCode(new Set(), () => 0.999999)).toBe("999999");
  });
});

describe("leaguesToCreate", () => {
  it("tops each kind up to its own target", () => {
    expect(leaguesToCreate({ public: 70, private: 4 }, { public: 75, private: 10 })).toEqual({
      public: 5,
      private: 6,
    });
  });

  it("creates the whole target on a first run", () => {
    expect(leaguesToCreate({ public: 0, private: 0 }, { public: 75, private: 10 })).toEqual({
      public: 75,
      private: 10,
    });
  });

  it("creates nothing once the targets are met or passed", () => {
    expect(leaguesToCreate({ public: 80, private: 10 }, { public: 75, private: 10 })).toEqual({
      public: 0,
      private: 0,
    });
  });

  it("doesn't let one kind cover for the other", () => {
    expect(leaguesToCreate({ public: 75, private: 0 }, { public: 75, private: 10 })).toEqual({
      public: 0,
      private: 10,
    });
  });
});

describe("countArg", () => {
  it("falls back when the flag isn't given", () => {
    expect(countArg(["--teardown"], "private", 10)).toBe(10);
  });

  it("reads the number", () => {
    expect(countArg(["--private=25"], "private", 10)).toBe(25);
  });

  it("accepts 0 so private leagues can be skipped", () => {
    expect(countArg(["--private=0"], "private", 10)).toBe(0);
  });

  it("rejects anything that isn't a whole number", () => {
    for (const bad of ["--private=abc", "--private=", "--private=-3", "--private=2.5"]) {
      expect(() => countArg([bad], "private", 10)).toThrow(/whole number/);
    }
  });

  it("doesn't mistake a longer flag for the one it's looking for", () => {
    expect(countArg(["--private-extra=5"], "private", 10)).toBe(10);
  });
});

describe("competitionArg", () => {
  it("is the Premier League when the flag isn't given", () => {
    expect(competitionArg(["--private=2"])).toBe("PL");
  });

  it("reads the code, upper cased", () => {
    expect(competitionArg(["--competition=mls"])).toBe("MLS");
    expect(competitionArg(["--competition=BL1"])).toBe("BL1");
  });

  it("rejects an empty or malformed code", () => {
    for (const bad of ["--competition=", "--competition=P D", "--competition=PD,MLS"]) {
      expect(() => competitionArg([bad])).toThrow(/competition code/);
    }
  });
});

describe("seasonDraftTime", () => {
  it("is an hour before the earliest deadline", () => {
    expect(
      seasonDraftTime(["2026-09-12T10:00:00Z", "2026-08-15T10:00:00Z", "2026-08-22T10:00:00Z"]),
    ).toBe("2026-08-15T09:00:00.000Z");
  });

  it("is null before any gameweeks are loaded", () => {
    expect(seasonDraftTime([])).toBeNull();
  });
});

describe("pickDemoLeague", () => {
  const league = (id: number, memberCount: number, maxTeams: number, hasDemoUser = false) => ({
    id,
    memberCount,
    maxTeams,
    hasDemoUser,
  });

  it("keeps the league the demo account is already in", () => {
    expect(pickDemoLeague([league(1, 18, 20), league(2, 5, 8, true)])).toBe(2);
  });

  it("keeps it even when that league is now full", () => {
    expect(pickDemoLeague([league(1, 4, 20), league(2, 8, 8, true)])).toBe(2);
  });

  it("otherwise picks the fullest league that has room", () => {
    expect(pickDemoLeague([league(1, 6, 10), league(2, 9, 12), league(3, 20, 20)])).toBe(2);
  });

  it("breaks ties on the lower id, so re-runs agree", () => {
    expect(pickDemoLeague([league(7, 5, 8), league(3, 5, 8)])).toBe(3);
  });

  it("is null when every league is full", () => {
    expect(pickDemoLeague([league(1, 8, 8), league(2, 20, 20)])).toBeNull();
    expect(pickDemoLeague([])).toBeNull();
  });
});

describe("demoChatHistory", () => {
  const now = new Date("2026-10-14T18:00:00Z");

  it("makes the requested number of lines", () => {
    expect(demoChatHistory(3, now, 6)).toHaveLength(6);
  });

  it("is oldest first and entirely in the past", () => {
    const times = demoChatHistory(3, now).map((l) => Date.parse(l.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(Math.max(...times)).toBeLessThan(now.getTime());
  });

  it("shares the lines out between the authors", () => {
    const authors = demoChatHistory(2, now, 4).map((l) => l.authorIndex);
    expect(authors).toEqual([0, 1, 0, 1]);
  });

  it("only uses authors that exist", () => {
    const authors = demoChatHistory(1, now).map((l) => l.authorIndex);
    expect(authors.every((a) => a === 0)).toBe(true);
  });

  it("is empty without authors", () => {
    expect(demoChatHistory(0, now)).toEqual([]);
  });
});
