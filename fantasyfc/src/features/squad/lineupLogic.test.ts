import { describe, it, expect } from "vitest";
import {
  formationLabel,
  formationOf,
  formationProblem,
  lineupSlots,
  previewSlots,
  renumber,
  swapPlayers,
  toSlotsPayload,
  type LineupEntry,
  type Position,
  type SquadPlayer,
} from "./lineupLogic";

let nextId = 1;
const player = (position: Position, price = 5): SquadPlayer => ({
  id: nextId++,
  name: `${position} ${nextId}`,
  position,
  price,
  real_team: "Club",
});

/** A saved 4-3-3 with bench GK, DEF, MID, FWD, captained by FWD1. */
function lineup433(): LineupEntry[] {
  nextId = 1;
  const e = (position: Position, slotId: string, price = 5, isCaptain = false) => ({
    player: player(position, price),
    slotId,
    isCaptain,
  });
  return [
    e("Goalkeeper", "GK1"),
    e("Defender", "DEF1"), e("Defender", "DEF2"), e("Defender", "DEF3"), e("Defender", "DEF4"),
    e("Midfielder", "MID1"), e("Midfielder", "MID2"), e("Midfielder", "MID3"),
    e("Forward", "FWD1", 12, true), e("Forward", "FWD2", 9), e("Forward", "FWD3", 8),
    e("Goalkeeper", "B1"), e("Defender", "B2"), e("Midfielder", "B3"), e("Forward", "B4"),
  ];
}
const bySlot = (l: LineupEntry[], slot: string) => l.find((e) => e.slotId === slot) as LineupEntry;

describe("formation rules", () => {
  it("accepts FPL's legal formations", () => {
    for (const [d, m, f] of [[4, 3, 3], [3, 5, 2], [5, 4, 1], [5, 2, 3], [3, 4, 3]]) {
      expect(formationProblem({ Goalkeeper: 1, Defender: d, Midfielder: m, Forward: f })).toBeNull();
    }
  });

  it("rejects the rest, saying why", () => {
    expect(formationProblem({ Goalkeeper: 2, Defender: 4, Midfielder: 3, Forward: 2 })).toMatch(/one goalkeeper/);
    expect(formationProblem({ Goalkeeper: 1, Defender: 2, Midfielder: 5, Forward: 3 })).toMatch(/3 and 5 defenders/);
    expect(formationProblem({ Goalkeeper: 1, Defender: 3, Midfielder: 3, Forward: 4 })).toMatch(/1 and 3 forwards/);
    expect(formationProblem({ Goalkeeper: 1, Defender: 4, Midfielder: 3, Forward: 2 })).toMatch(/11 starters/);
  });

  it("counts and labels a lineup's formation", () => {
    const l = lineup433();
    expect(formationOf(l)).toEqual({ Goalkeeper: 1, Defender: 4, Midfielder: 3, Forward: 3 });
    expect(formationLabel(formationOf(l))).toBe("4-3-3");
  });
});

describe("swapPlayers", () => {
  it("brings a bench defender on for a forward, giving 5-3-2", () => {
    const l = lineup433();
    const result = swapPlayers(l, bySlot(l, "FWD3").player.id, bySlot(l, "B2").player.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formationLabel(formationOf(result.lineup))).toBe("5-3-2");
    // The defender lands at the end of the back line, the others keep their
    // places; the forward takes the defender's bench spot.
    expect(bySlot(result.lineup, "DEF5").player.id).toBe(bySlot(l, "B2").player.id);
    expect(bySlot(result.lineup, "DEF3").player.id).toBe(bySlot(l, "DEF3").player.id);
    expect(bySlot(result.lineup, "B2").player.position).toBe("Forward");
  });

  it("refuses a swap that breaks the formation", () => {
    const l = lineup433();
    const twoKeepers = swapPlayers(l, bySlot(l, "MID1").player.id, bySlot(l, "B1").player.id);
    expect(twoKeepers).toEqual({ ok: false, reason: expect.stringMatching(/one goalkeeper/) });
  });

  it("swaps the goalkeepers", () => {
    const l = lineup433();
    const gk = bySlot(l, "GK1").player.id;
    const result = swapPlayers(l, gk, bySlot(l, "B1").player.id);
    expect(result.ok && bySlot(result.lineup, "B1").player.id).toBe(gk);
  });

  it("reorders two bench players without changing the formation", () => {
    const l = lineup433();
    const result = swapPlayers(l, bySlot(l, "B2").player.id, bySlot(l, "B4").player.id);
    expect(result.ok && bySlot(result.lineup, "B2").player.position).toBe("Forward");
    expect(result.ok && formationLabel(formationOf(result.lineup))).toBe("4-3-3");
  });

  it("hands the armband to the most expensive starter when the captain is benched", () => {
    const l = lineup433();
    const result = swapPlayers(l, bySlot(l, "FWD1").player.id, bySlot(l, "B4").player.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const captains = result.lineup.filter((e) => e.isCaptain);
    expect(captains).toHaveLength(1);
    expect(captains[0].player.price).toBe(9); // FWD2, now the priciest starter
  });

  it("doesn't change the lineup it was given", () => {
    const l = lineup433();
    const before = JSON.stringify(l);
    swapPlayers(l, bySlot(l, "FWD3").player.id, bySlot(l, "B2").player.id);
    expect(JSON.stringify(l)).toBe(before);
  });
});

describe("renumber and payload", () => {
  it("closes gaps in a line, keeping order", () => {
    const l = lineup433().map((e) => (e.slotId === "DEF2" ? { ...e, slotId: "DEF5" } : e));
    const slots = renumber(l).filter((e) => e.player.position === "Defender" && !e.slotId.startsWith("B"));
    expect(slots.map((e) => e.slotId).sort()).toEqual(["DEF1", "DEF2", "DEF3", "DEF4"]);
  });

  it("produces what set_lineup expects", () => {
    const payload = toSlotsPayload(lineup433());
    expect(payload).toHaveLength(15);
    expect(payload[0]).toEqual({ player_id: 1, slot_id: "GK1", is_captain: false });
    expect(payload.filter((p) => p.is_captain)).toHaveLength(1);
  });
});

describe("pitch layout", () => {
  it("draws any legal formation, spreading each line evenly", () => {
    const l = lineup433();
    const result = swapPlayers(l, bySlot(l, "FWD3").player.id, bySlot(l, "B2").player.id);
    if (!result.ok) throw new Error(result.reason);
    const slots = lineupSlots(result.lineup);
    const defenders = slots.filter((s) => s.expectedRole === "Defender");
    expect(defenders.map((s) => s.left)).toEqual(["8%", "29%", "50%", "71%", "92%"]);
    // Five in a line are staggered so the cards don't overlap.
    expect(defenders.map((s) => s.top)).toEqual(["65%", "70%", "65%", "70%", "65%"]);
    // Smaller lines sit closer together, like the original 4-3-3 art.
    expect(slots.filter((s) => s.expectedRole === "Forward").map((s) => s.left)).toEqual(["39%", "61%"]);
    expect(slots.find((s) => s.expectedRole === "Goalkeeper")?.left).toBe("50%");
    expect(slots.filter((s) => s.expectedRole === "Forward")).toHaveLength(2);
    expect(slots.filter((s) => s.isBench).map((s) => s.id)).toEqual(["B1", "B2", "B3", "B4"]);
    expect(slots.find((s) => s.isCaptain)?.player?.price).toBe(12);
  });

  it("previews a part-drafted squad as a 4-3-3 with blanks", () => {
    nextId = 100;
    const slots = previewSlots([player("Forward", 9), player("Forward", 6), player("Goalkeeper"), player("Goalkeeper")]);
    expect(slots.filter((s) => !s.isBench)).toHaveLength(11);
    expect(slots.filter((s) => s.player !== null && !s.isBench)).toHaveLength(3);
    // The spare keeper goes to the bench.
    expect(slots.filter((s) => s.isBench && s.player?.position === "Goalkeeper")).toHaveLength(1);
  });
});
