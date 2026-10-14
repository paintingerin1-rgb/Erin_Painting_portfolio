import { describe, it, expect } from "vitest";
import { PAGE_SIZE, selectAll } from "./selectAll.ts";

// A fake table of `n` rows, served the way PostgREST does: at most PAGE_SIZE
// per request, whatever range is asked for.
function table(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null };
  };
  return { page, calls };
}

describe("selectAll", () => {
  it("reads past the 1,000-row cap", async () => {
    const { page, calls } = table(2_345);
    const rows = await selectAll(page, "players");
    expect(rows).toHaveLength(2_345);
    expect(rows.at(-1)).toEqual({ id: 2_345 });
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("makes one extra request when the total is an exact multiple of the page", async () => {
    const { page, calls } = table(1_000);
    expect(await selectAll(page, "players")).toHaveLength(1_000);
    expect(calls).toHaveLength(2);
  });

  it("returns an empty list for an empty table", async () => {
    expect(await selectAll(table(0).page, "players")).toEqual([]);
  });

  it("names the table when a page fails", async () => {
    const page = async () => ({ data: null, error: { message: "boom" } });
    await expect(selectAll(page, "football_players")).rejects.toThrow("Could not load football_players: boom");
  });
});
