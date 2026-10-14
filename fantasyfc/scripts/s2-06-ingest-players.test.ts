import { describe, it, expect } from "vitest";
import { calculatePrice, getPositionEnum } from "./s2-06-ingest-players.js";

describe("Player Pricing Logic", () => {
  it("should ensure the 15 most expensive legal picks exceed the 100M budget cap", () => {
    // The most expensive players play for a Top 6 club (e.g., Arsenal FC)
    const topClub = "Arsenal FC";

    const gkPrice = calculatePrice("Goalkeeper", topClub);
    const defPrice = calculatePrice("Defender", topClub);
    const midPrice = calculatePrice("Midfielder", topClub);
    const fwdPrice = calculatePrice("Forward", topClub);

    // A legal 15-man squad has exactly: 2 GK, 5 DEF, 4 MID, 4 FWD
    const totalMaxPrice =
      gkPrice * 2 +
      defPrice * 5 +
      midPrice * 4 +
      fwdPrice * 4;

    // Verify it exceeds the 100M cap
    expect(totalMaxPrice).toBeGreaterThan(100);
    expect(totalMaxPrice).toBe(111); // 14 + 35 + 30 + 32
  });

  it("should ensure a squad of non-premium players stays well under the 100M cap", () => {
    // A non-premium club
    const bottomClub = "Burnley FC";

    const gkPrice = calculatePrice("Goalkeeper", bottomClub);
    const defPrice = calculatePrice("Defender", bottomClub);
    const midPrice = calculatePrice("Midfielder", bottomClub);
    const fwdPrice = calculatePrice("Forward", bottomClub);

    const totalMinPrice =
      gkPrice * 2 +
      defPrice * 5 +
      midPrice * 4 +
      fwdPrice * 4;

    // Verify it easily fits under the cap
    expect(totalMinPrice).toBeLessThan(100);
    expect(totalMinPrice).toBe(73.5); // 9 + 22.5 + 20 + 22
  });
});

describe("getPositionEnum", () => {
  it("understands both providers' position names", () => {
    expect(["Goalkeeper", "Defence", "Midfield", "Offence"].map(getPositionEnum)).toEqual([
      "Goalkeeper", "Defender", "Midfielder", "Forward",
    ]);
    expect(["Defender", "Midfielder", "Attacker"].map(getPositionEnum)).toEqual([
      "Defender", "Midfielder", "Forward",
    ]);
    expect(getPositionEnum(null)).toBe("Unknown");
  });
});
