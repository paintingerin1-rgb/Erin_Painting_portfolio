import { describe, it, expect } from "vitest";
import { pickTabLabel, picksForTab, sortByPrice } from "./draftLogic";

const players = [
  { id: 1, name: "Mid", price: 6.5 },
  { id: 2, name: "Cheap", price: 4.5 },
  { id: 3, name: "Star", price: 12 },
  { id: 4, name: "Also Mid", price: 6.5 },
];

describe("sortByPrice", () => {
  it("puts the most expensive first when descending", () => {
    expect(sortByPrice(players, "desc").map((p) => p.price)).toEqual([12, 6.5, 6.5, 4.5]);
  });

  it("puts the cheapest first when ascending", () => {
    expect(sortByPrice(players, "asc").map((p) => p.price)).toEqual([4.5, 6.5, 6.5, 12]);
  });

  it("orders equal prices by name in both directions", () => {
    expect(sortByPrice(players, "desc").map((p) => p.name)).toEqual([
      "Star",
      "Also Mid",
      "Mid",
      "Cheap",
    ]);
    expect(sortByPrice(players, "asc").map((p) => p.name)).toEqual([
      "Cheap",
      "Also Mid",
      "Mid",
      "Star",
    ]);
  });

  it("leaves the input array untouched", () => {
    const before = players.map((p) => p.id);
    sortByPrice(players, "asc");
    expect(players.map((p) => p.id)).toEqual(before);
  });
});

describe("my picks tabs (#38)", () => {
  const picks = [
    { id: 1, position: "Goalkeeper" },
    { id: 2, position: "Defender" },
    { id: 3, position: "Defender" },
    { id: 4, position: "Defender" },
    { id: 5, position: "Forward" },
  ];

  it("shows only the picks in the selected tab's position", () => {
    expect(picksForTab(picks, "DEF").map((p) => p.id)).toEqual([2, 3, 4]);
    expect(picksForTab(picks, "GK").map((p) => p.id)).toEqual([1]);
    expect(picksForTab(picks, "FWD").map((p) => p.id)).toEqual([5]);
  });

  it("is empty for a position with no picks yet", () => {
    expect(picksForTab(picks, "MID")).toEqual([]);
  });

  it("labels each tab with filled/total", () => {
    expect(pickTabLabel(picks, "GK")).toBe("GK 1/2");
    expect(pickTabLabel(picks, "DEF")).toBe("DEF 3/5");
    expect(pickTabLabel(picks, "MID")).toBe("MID 0/4");
    expect(pickTabLabel(picks, "FWD")).toBe("FWD 1/4");
  });
});
