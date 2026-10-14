import { describe, expect, it } from "vitest";
import { matchFplPlayers, normalizeName, type FplElement } from "./s2-08b-match-players.ts";

const ARSENAL = 57;
const BURNLEY = 328;
// FPL team id -> club.id
const clubs = new Map([
  [1, ARSENAL],
  [2, BURNLEY],
]);

function el(id: number, first: string, second: string, team: number, web = second): FplElement {
  return { id, first_name: first, second_name: second, web_name: web, team };
}

describe("matchFplPlayers", () => {
  it("matches on full name within the player's club", () => {
    const { matched } = matchFplPlayers(
      [el(10, "Bukayo", "Saka", 1)],
      [{ id: 500, name: "Bukayo Saka", club_id: ARSENAL }],
      clubs,
    );
    expect(matched.get(10)).toBe(500);
  });

  it("falls back to web_name and ignores accents and punctuation", () => {
    const { matched } = matchFplPlayers(
      [el(11, "Gabriel", "dos Santos Magalhães", 1, "Gabriel")],
      [{ id: 501, name: "Gabriel", club_id: ARSENAL }],
      clubs,
    );
    expect(matched.get(11)).toBe(501);
  });

  it("keeps two same-named players at different clubs apart", () => {
    const { matched } = matchFplPlayers(
      [el(20, "Josh", "Brownhill", 2), el(21, "Josh", "Brownhill", 1)],
      [
        { id: 600, name: "Josh Brownhill", club_id: BURNLEY },
        { id: 601, name: "Josh Brownhill", club_id: ARSENAL },
      ],
      clubs,
    );
    expect(matched.get(20)).toBe(600);
    expect(matched.get(21)).toBe(601);
  });

  it("leaves a name shared by two players at one club unmatched", () => {
    const { matched, ambiguous } = matchFplPlayers(
      [el(30, "Ben", "White", 1)],
      [
        { id: 700, name: "Ben White", club_id: ARSENAL },
        { id: 701, name: "Ben White", club_id: ARSENAL },
      ],
      clubs,
    );
    expect(matched.has(30)).toBe(false);
    expect(ambiguous.map((e) => e.id)).toEqual([30]);
  });

  it("does not match a player at the wrong club", () => {
    const { matched, notFound } = matchFplPlayers(
      [el(40, "Bukayo", "Saka", 2)],
      [{ id: 500, name: "Bukayo Saka", club_id: ARSENAL }],
      clubs,
    );
    expect(matched.has(40)).toBe(false);
    expect(notFound.map((e) => e.id)).toEqual([40]);
  });

  it("reports players on an FPL team with no club mapping", () => {
    const { noClub } = matchFplPlayers(
      [el(50, "Chris", "Wood", 3)],
      [{ id: 800, name: "Chris Wood", club_id: 351 }],
      clubs,
    );
    expect(noClub.map((e) => e.id)).toEqual([50]);
  });

  it("skips players whose club_id has not been filled in yet", () => {
    const { matched, notFound } = matchFplPlayers(
      [el(60, "Bukayo", "Saka", 1)],
      [{ id: 500, name: "Bukayo Saka", club_id: null }],
      clubs,
    );
    expect(matched.size).toBe(0);
    expect(notFound.map((e) => e.id)).toEqual([60]);
  });

  it("matches FPL's full legal name to our common name", () => {
    const { matched } = matchFplPlayers(
      [
        el(70, "David", "Raya Martín", 1, "Raya"),
        el(71, "Gabriel", "dos Santos Magalhães", 1, "Gabriel"),
        el(72, "Dominic", "Solanke-Mitchell", 1, "Solanke"),
        el(73, "Ryan", "Giles", 1),
      ],
      [
        { id: 900, name: "David Raya", club_id: ARSENAL },
        { id: 901, name: "Gabriel Magalhães", club_id: ARSENAL },
        { id: 902, name: "Dominic Solanke", club_id: ARSENAL },
        { id: 903, name: "Ryan John Giles", club_id: ARSENAL },
      ],
      clubs,
    );
    expect(Object.fromEntries(matched)).toEqual({ 70: 900, 71: 901, 72: 902, 73: 903 });
  });

  it("matches short first names and swapped name order", () => {
    const { matched } = matchFplPlayers(
      [
        el(80, "Oli", "McBurnie", 1),
        el(81, "Micky", "van de Ven", 1, "Van de Ven"),
        el(82, "Tanaka", "Ao", 1, "Tanaka"),
      ],
      [
        { id: 910, name: "Oliver McBurnie", club_id: ARSENAL },
        { id: 911, name: "Mickey van de Ven", club_id: ARSENAL },
        { id: 912, name: "Ao Tanaka", club_id: ARSENAL },
      ],
      clubs,
    );
    expect(Object.fromEntries(matched)).toEqual({ 80: 910, 81: 911, 82: 912 });
  });

  it("falls back to a unique surname, allowing one letter of transliteration", () => {
    const { matched } = matchFplPlayers(
      [
        el(90, "Tino", "Livramento", 1),
        el(91, "Yehor", "Yarmoliuk", 1),
        el(92, "José María", "Andrés Baixauli", 1, "Andrés"),
      ],
      [
        { id: 920, name: "Valentino Livramento", club_id: ARSENAL },
        { id: 921, name: "Yegor Yarmolyuk", club_id: ARSENAL },
        { id: 922, name: "Chema Andrés", club_id: ARSENAL },
      ],
      clubs,
    );
    expect(Object.fromEntries(matched)).toEqual({ 90: 920, 91: 921, 92: 922 });
  });

  it("does not guess when a surname fits two of our players", () => {
    const { matched, ambiguous } = matchFplPlayers(
      [el(100, "Tino", "Silva", 1)],
      [
        { id: 930, name: "Bernardo Silva", club_id: ARSENAL },
        { id: 931, name: "Antonio Silva", club_id: ARSENAL },
      ],
      clubs,
    );
    expect(matched.has(100)).toBe(false);
    expect(ambiguous.map((e) => e.id)).toEqual([100]);
  });

  it("does not give one of our players to two FPL players", () => {
    const { matched, ambiguous } = matchFplPlayers(
      [el(110, "Ben", "Whiteman", 1, "White"), el(111, "Benjamin", "White", 1)],
      [{ id: 940, name: "Ben White", club_id: ARSENAL }],
      clubs,
    );
    expect(matched.size).toBe(0);
    expect(ambiguous.map((e) => e.id).sort()).toEqual([110, 111]);
  });

  it("leaves a player claimed by an exact match out of the looser passes", () => {
    const { matched, notFound } = matchFplPlayers(
      [el(120, "Ben", "White", 1), el(121, "Benjamin", "Whyte", 1)],
      [{ id: 950, name: "Ben White", club_id: ARSENAL }],
      clubs,
    );
    expect(matched.get(120)).toBe(950);
    expect(notFound.map((e) => e.id)).toEqual([121]);
  });

  it("does not match on a short surname alone", () => {
    const { matched } = matchFplPlayers(
      [el(130, "Mohamed-Ali", "Ba", 1)],
      [{ id: 960, name: "Abdoullah Ba", club_id: ARSENAL }],
      clubs,
    );
    expect(matched.size).toBe(0);
  });
});

describe("normalizeName", () => {
  it("strips accents and folds letters that aren't accented ones", () => {
    expect(normalizeName("Frederik Rønnow")).toBe("frederik ronnow");
    expect(normalizeName("Albert Grønbæk")).toBe("albert gronbaek");
    expect(normalizeName("Thomas Müller")).toBe("thomas muller");
    expect(normalizeName("Łukasz Fabiański")).toBe("lukasz fabianski");
  });
});
