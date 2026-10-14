export type PriceSort = "desc" | "asc";

/**
 * Players by price (#39), most expensive first for "desc". Equal prices are
 * ordered by name, then id, so the list doesn't reshuffle between renders.
 * Returns a new array.
 */
export function sortByPrice<T extends { id: number; name: string; price: number }>(
  players: T[],
  direction: PriceSort,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...players].sort(
    (a, b) =>
      sign * (a.price - b.price) || a.name.localeCompare(b.name) || a.id - b.id,
  );
}

/** How many of each position a 15-player squad holds. */
export const POSITION_LIMITS: Record<string, number> = {
  Goalkeeper: 2,
  Defender: 5,
  Midfielder: 4,
  Forward: 4,
};

/** The tabs over "my picks" (#38), and the position each one shows. */
export const PICK_TABS = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
} as const;

export type PickTab = keyof typeof PICK_TABS;

/** My picks in one tab's position, in the order given. */
export function picksForTab<T extends { position: string }>(picks: T[], tab: PickTab): T[] {
  return picks.filter((p) => p.position === PICK_TABS[tab]);
}

/** A tab's label with filled/total, e.g. "DEF 3/5". */
export function pickTabLabel(picks: { position: string }[], tab: PickTab): string {
  const position = PICK_TABS[tab];
  return `${tab} ${picksForTab(picks, tab).length}/${POSITION_LIMITS[position]}`;
}
