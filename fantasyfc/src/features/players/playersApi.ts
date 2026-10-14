import { supabase } from "../../lib/supabaseClient";
import { unwrapMany } from "../../lib/dataAccess";

// Matches the columns DraftPage.tsx already reads off football_players
// (id, name, position, real_team, price) - see src/features/draft/DraftPage.tsx.
export type PlayerPosition =
  | "Goalkeeper"
  | "Defender"
  | "Midfielder"
  | "Forward";

export interface Player {
  id: number;
  name: string;
  position: PlayerPosition;
  real_team: string;
  price: number;
}

export interface ListPlayersParams {
  /** Restrict to one competition (competition.id); omit for every league. */
  competitionId?: number;
  /** Matched against name or club, server-side, case-insensitive. */
  search?: string;
  /** Restrict to one position; omit/undefined for all positions. */
  position?: PlayerPosition;
  /** Zero-based page index. */
  page?: number;
  pageSize?: number;
}

export interface ListPlayersResult {
  players: Player[];
  /** Total rows matching the filters (ignoring pagination), for page counts. */
  total: number;
}

export const DEFAULT_PLAYERS_PAGE_SIZE = 24;

// ilike patterns are wrapped in %...%; strip the characters that would
// otherwise change what the pattern means: % is the ilike wildcard, and
// comma/parentheses are PostgREST's .or() syntax - a comma separates its
// conditions and parentheses group them, so either can mis-parse the
// filter (or 400) if left in untouched.
function escapeIlikeTerm(term: string): string {
  return term.replace(/[%,()]/g, "");
}

/**
 * 548-row table, so this always goes through the server: search and the
 * position filter are applied with .ilike()/.eq() rather than in the
 * browser, and results come back one page at a time via .range().
 */
export async function listPlayers({
  competitionId,
  search = "",
  position,
  page = 0,
  pageSize = DEFAULT_PLAYERS_PAGE_SIZE,
}: ListPlayersParams = {}): Promise<ListPlayersResult> {
  let query = supabase
    .from("football_players")
    .select("id, name, position, real_team, price", { count: "exact" });

  if (competitionId !== undefined) {
    query = query.eq("competition_id", competitionId);
  }

  if (position) {
    query = query.eq("position", position);
  }

  const term = escapeIlikeTerm(search.trim());
  if (term) {
    query = query.or(`name.ilike.%${term}%,real_team.ilike.%${term}%`);
  }

  const from = page * pageSize;
  const to = from + pageSize - 1;

  // Tiebreaker matters here: the pricing formula only produces 8 distinct
  // values across 548 players, so most rows tie on price. Without a second,
  // unique sort key, Postgres doesn't guarantee the same row order between
  // the page-1 and page-2 requests, so .range() can repeat or skip players.
  const result = await query
    .order("price", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  const players = unwrapMany(result, "players");
  return { players, total: result.count ?? players.length };
}
