import { describe, it, expect } from "vitest";
import { clubForm, priceAtRank, priceByStatus, type PricedPlayer, type Position } from "./pricing.ts";

const TEMPLATE = [4.0, 4.0, 4.5, 5.0, 5.5, 6.5, 8.0, 10.0, 12.5];
const templates: Record<Position, number[]> = {
  Goalkeeper: TEMPLATE,
  Defender: TEMPLATE,
  Midfielder: TEMPLATE,
  Forward: TEMPLATE,
};

function player(id: number, points: number, over: Partial<PricedPlayer> = {}): PricedPlayer {
  return { id, competitionId: 2, position: "Forward", clubId: 1, points, ...over };
}

describe("clubForm", () => {
  it("is each club's points per game", () => {
    const form = clubForm([
      { home_club_id: 1, away_club_id: 2, home_score: 2, away_score: 0 },
      { home_club_id: 2, away_club_id: 1, home_score: 1, away_score: 1 },
      { home_club_id: 3, away_club_id: 1, home_score: null, away_score: null },
    ]);
    expect(form.get(1)).toBe(2); // win + draw over 2 games
    expect(form.get(2)).toBe(0.5); // loss + draw
    expect(form.has(3)).toBe(false); // no completed games
  });
});

describe("priceAtRank", () => {
  it("gives the best player the top price and the last the bottom one", () => {
    expect(priceAtRank(TEMPLATE, 0, 5)).toBe(12.5);
    expect(priceAtRank(TEMPLATE, 4, 5)).toBe(4.0);
    expect(priceAtRank(TEMPLATE, 2, 5)).toBe(5.5);
  });

  it("gives a lone player the top price", () => {
    expect(priceAtRank(TEMPLATE, 0, 1)).toBe(12.5);
  });
});

describe("priceByStatus", () => {
  it("ranks a player without a fixed price against the fixed-price ones too", () => {
    // Player 3 isn't listed by FPL; with only fixed-price players above it,
    // it must not get the top price just for being the best of the unlisted.
    const prices = priceByStatus(
      [player(1, 90), player(2, 70), player(3, 20)],
      new Map(),
      templates,
      new Map([
        [1, 15.6],
        [2, 9.0],
      ]),
    );
    expect(prices.get(3)).toBe(4.0);
  });

  it("prices players with more points higher", () => {
    const prices = priceByStatus(
      [player(1, 60), player(2, 30), player(3, 5)],
      new Map([[1, 1.5]]),
      templates,
    );
    expect(prices.get(1)).toBeGreaterThan(prices.get(2)!);
    expect(prices.get(2)).toBeGreaterThan(prices.get(3)!);
  });

  it("uses club form to separate players with equal points", () => {
    const prices = priceByStatus(
      [player(1, 0, { clubId: 10 }), player(2, 0, { clubId: 20 })],
      new Map([
        [10, 0.5],
        [20, 2.8],
      ]),
      templates,
    );
    expect(prices.get(2)).toBeGreaterThan(prices.get(1)!);
  });

  it("ranks within each competition and position separately", () => {
    const prices = priceByStatus(
      [
        player(1, 80, { competitionId: 2 }),
        player(2, 10, { competitionId: 3 }),
        player(3, 10, { competitionId: 2, position: "Defender" }),
      ],
      new Map(),
      templates,
    );
    // Each is the best (only) player in its group.
    expect([prices.get(1), prices.get(2), prices.get(3)]).toEqual([12.5, 12.5, 12.5]);
  });

  it("gives a league real variety instead of a handful of prices", () => {
    const squad = Array.from({ length: 40 }, (_, i) => player(i + 1, i * 2));
    const prices = priceByStatus(squad, new Map([[1, 1.5]]), templates);
    expect(new Set(prices.values()).size).toBe(new Set(TEMPLATE).size);
  });

  it("keeps fixed prices (FPL's) and skips unknown positions", () => {
    const prices = priceByStatus(
      [player(1, 0), player(2, 99), player(3, 50, { position: "Unknown" })],
      new Map(),
      templates,
      new Map([[1, 15.6]]),
    );
    expect(prices.get(1)).toBe(15.6);
    expect(prices.get(2)).toBe(12.5);
    expect(prices.has(3)).toBe(false);
  });
});
