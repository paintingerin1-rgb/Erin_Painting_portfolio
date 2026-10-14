// Lineup rules and pitch layout for My Squad (#17). Pure functions, so the
// formation rules can be tested without a database. The same rules are
// enforced server-side by set_lineup() (migration 20261011150000).

export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export interface SquadPlayer {
  id: number;
  name: string;
  position: Position;
  price: number;
  real_team: string;
}

export interface LineupEntry {
  player: SquadPlayer;
  /** GK1, DEF1..DEF5, MID1..MID5, FWD1..FWD3 for starters; B1..B4 bench. */
  slotId: string;
  isCaptain: boolean;
}

export type Formation = Record<Position, number>;

const CODE: Record<Position, string> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Forward: "FWD",
};

const ORDER: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

export const isBenchSlot = (slotId: string) => slotId.startsWith("B");
const slotIndex = (slotId: string) => Number(slotId.replace(/^\D+/, ""));

export function formationOf(lineup: LineupEntry[]): Formation {
  const f: Formation = { Goalkeeper: 0, Defender: 0, Midfielder: 0, Forward: 0 };
  for (const e of lineup) if (!isBenchSlot(e.slotId)) f[e.player.position]++;
  return f;
}

/** FPL's rule: 11 starters, exactly 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD. */
export function formationProblem(f: Formation): string | null {
  const total = f.Goalkeeper + f.Defender + f.Midfielder + f.Forward;
  if (total !== 11) return `You need 11 starters, not ${total}.`;
  if (f.Goalkeeper !== 1) return "Start exactly one goalkeeper.";
  if (f.Defender < 3 || f.Defender > 5) return "Start between 3 and 5 defenders.";
  if (f.Midfielder < 2 || f.Midfielder > 5) return "Start between 2 and 5 midfielders.";
  if (f.Forward < 1 || f.Forward > 3) return "Start between 1 and 3 forwards.";
  return null;
}

/** "4-3-3" style label (outfield lines only). */
export const formationLabel = (f: Formation) => `${f.Defender}-${f.Midfielder}-${f.Forward}`;

/**
 * Renumbers starters so each line runs 1..n in its current order (a swap can
 * leave gaps or move a player into another line). Bench order is kept.
 */
export function renumber(lineup: LineupEntry[]): LineupEntry[] {
  const next = lineup.map((e) => ({ ...e }));
  for (const pos of ORDER) {
    // A player who just came from another line or the bench (their slot id
    // still names it, e.g. a defender in "FWD3") joins the end of the line.
    const order = (e: LineupEntry) =>
      (e.slotId.startsWith(CODE[pos]) ? 0 : 100) + slotIndex(e.slotId);
    next
      .filter((e) => !isBenchSlot(e.slotId) && e.player.position === pos)
      .sort((a, b) => order(a) - order(b) || a.player.id - b.player.id)
      .forEach((e, i) => {
        e.slotId = `${CODE[pos]}${i + 1}`;
      });
  }
  return next;
}

export type SwapResult = { ok: true; lineup: LineupEntry[] } | { ok: false; reason: string };

/**
 * Swaps two players' places. A starter and a bench player trade places
 * (which can change the formation); two starters or two bench players swap
 * order. A benched captain hands the armband to the most expensive starter.
 */
export function swapPlayers(lineup: LineupEntry[], playerA: number, playerB: number): SwapResult {
  const a = lineup.find((e) => e.player.id === playerA);
  const b = lineup.find((e) => e.player.id === playerB);
  if (!a || !b || a === b) return { ok: false, reason: "Pick two different players." };

  const swapped = lineup.map((e) => {
    if (e === a) return { ...e, slotId: b.slotId };
    if (e === b) return { ...e, slotId: a.slotId };
    return { ...e };
  });

  const problem = formationProblem(formationOf(swapped));
  if (problem) return { ok: false, reason: `That swap isn't allowed. ${problem}` };

  const benchedCaptain = swapped.find((e) => e.isCaptain && isBenchSlot(e.slotId));
  if (benchedCaptain) {
    benchedCaptain.isCaptain = false;
    const starters = swapped.filter((e) => !isBenchSlot(e.slotId));
    starters.sort((x, y) => y.player.price - x.player.price || x.player.id - y.player.id)[0].isCaptain = true;
  }
  return { ok: true, lineup: renumber(swapped) };
}

/** What set_lineup() expects. */
export const toSlotsPayload = (lineup: LineupEntry[]) =>
  lineup.map((e) => ({ player_id: e.player.id, slot_id: e.slotId, is_captain: e.isCaptain }));

// ---------------------------------------------------------------------------
// Pitch layout
// ---------------------------------------------------------------------------

export interface PitchSlot {
  /** A starter's slot id, or B1..B4. */
  id: string;
  isBench: boolean;
  /** The line this slot is drawn in (or "Any" on the bench). */
  expectedRole: Position | "Any";
  top?: string;
  left?: string;
  player: SquadPlayer | null;
  isCaptain: boolean;
}

/** Vertical position of each line on the pitch, goalkeeper at the bottom. */
const LINE_TOP: Record<Position, number> = {
  Goalkeeper: 88,
  Defender: 65,
  Midfielder: 40,
  Forward: 15,
};

/**
 * Where the i-th of n players in a line sits. The line widens with its size
 * (2 players span 22% of the pitch, 5 span 84%), as in the original 4-3-3
 * art, and a line of five is staggered so neighbouring cards don't overlap
 * on the narrow pitch.
 */
export function linePosition(lineTop: number, i: number, n: number): { top: number; left: number } {
  if (n <= 1) return { top: lineTop, left: 50 };
  const span = Math.min(84, 22 * (n - 1));
  const left = 50 - span / 2 + (i * span) / (n - 1);
  const top = n >= 5 && i % 2 === 1 ? lineTop + 5 : lineTop;
  return { top, left: Math.round(left * 10) / 10 };
}

/**
 * Places a formation on the pitch: one line per position, players spread
 * evenly across it, so any legal formation (3-5-2, 5-4-1, ...) fits.
 * `lines` gives each line's slots in order; empty slots stay blank.
 */
export function pitchLayout(
  lines: Record<Position, (LineupEntry | null)[]>,
  bench: (LineupEntry | null)[],
): PitchSlot[] {
  const slots: PitchSlot[] = [];
  for (const pos of ORDER) {
    const line = lines[pos];
    line.forEach((entry, i) => {
      const { top, left } = linePosition(LINE_TOP[pos], i, line.length);
      slots.push({
        id: entry?.slotId ?? `${CODE[pos]}${i + 1}`,
        isBench: false,
        expectedRole: pos,
        top: `${top}%`,
        left: `${left}%`,
        player: entry?.player ?? null,
        isCaptain: entry?.isCaptain ?? false,
      });
    });
  }
  bench.forEach((entry, i) => {
    slots.push({
      id: entry?.slotId ?? `B${i + 1}`,
      isBench: true,
      expectedRole: "Any",
      player: entry?.player ?? null,
      isCaptain: false,
    });
  });
  return slots;
}

/** The pitch for a saved lineup. */
export function lineupSlots(lineup: LineupEntry[]): PitchSlot[] {
  const byIndex = (a: LineupEntry, b: LineupEntry) => slotIndex(a.slotId) - slotIndex(b.slotId);
  const lines = Object.fromEntries(
    ORDER.map((pos) => [
      pos,
      lineup.filter((e) => !isBenchSlot(e.slotId) && e.player.position === pos).sort(byIndex),
    ]),
  ) as Record<Position, LineupEntry[]>;
  return pitchLayout(lines, lineup.filter((e) => isBenchSlot(e.slotId)).sort(byIndex));
}

/**
 * The pitch while still drafting (no saved lineup yet): a 4-3-3 of the most
 * expensive players per position, the rest on the bench, blanks for picks
 * still to make. Mirrors the default lineup ensure_lineup() saves.
 */
export function previewSlots(players: SquadPlayer[]): PitchSlot[] {
  const STARTING: Formation = { Goalkeeper: 1, Defender: 4, Midfielder: 3, Forward: 3 };
  const lines = {} as Record<Position, (LineupEntry | null)[]>;
  const bench: LineupEntry[] = [];
  for (const pos of ORDER) {
    const ranked = players
      .filter((p) => p.position === pos)
      .sort((a, b) => b.price - a.price || a.id - b.id)
      .map((player) => ({ player, slotId: "", isCaptain: false }));
    lines[pos] = Array.from({ length: STARTING[pos] }, (_, i) => ranked[i] ?? null);
    bench.push(...ranked.slice(STARTING[pos]));
  }
  const benchSlots = Array.from({ length: 4 }, (_, i) => bench[i] ?? null);
  return pitchLayout(lines, benchSlots);
}
