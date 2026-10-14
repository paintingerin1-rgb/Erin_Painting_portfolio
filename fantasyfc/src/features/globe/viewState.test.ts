import { describe, it, expect } from "vitest";
import { clamp, damp, easeInOutCubic, nearestLon } from "./viewState";

describe("nearestLon", () => {
  it("leaves a short move alone", () => {
    expect(nearestLon(10, 40)).toBe(40);
  });

  it("goes the short way across the date line", () => {
    // 170° to -170° is 20° east, not 340° west.
    expect(nearestLon(170, -170)).toBe(190);
  });

  it("unwinds longitude accumulated by dragging past a full turn", () => {
    // Dragged two turns east and a bit: England (-1.8°) is just behind.
    expect(nearestLon(725, -1.8)).toBeCloseTo(718.2);
  });
});

describe("clamp", () => {
  it("keeps values inside the range", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe("damp", () => {
  it("moves towards the goal without overshooting", () => {
    const next = damp(0, 10, 6, 1 / 60);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it("covers the same ground at 30 fps as at 60 fps", () => {
    const oneBigStep = damp(0, 10, 6, 1 / 30);
    const twoSmallSteps = damp(damp(0, 10, 6, 1 / 60), 10, 6, 1 / 60);
    expect(oneBigStep).toBeCloseTo(twoSmallSteps);
  });
});

describe("easeInOutCubic", () => {
  it("starts at 0, ends at 1 and passes the midpoint at half time", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});
