// Players data source - portfolio version.
//
// Same exports and signatures as production. There, listPlayers() queries
// Postgres through Supabase: case-insensitive .ilike() search on name or
// club, .eq() on position, and .range() for one page at a time, sorted by
// price with id as a tie-breaker. Here the same filtering, ordering and
// paging run over sample data, so PlayersPage is unchanged.

import { PLAYERS, later } from "../../data/sampleData";

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
  /** Restrict to one competition; omit for every league. */
  competitionId?: number;
  /** Matched against name or club, case-insensitive. */
  search?: string;
  /** Restrict to one position; omit for all positions. */
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

export async function listPlayers({
  competitionId,
  search = "",
  position,
  page = 0,
  pageSize = DEFAULT_PLAYERS_PAGE_SIZE,
}: ListPlayersParams = {}): Promise<ListPlayersResult> {
  const term = search.trim().toLowerCase();

  const matches = PLAYERS.filter(
    (p) =>
      (competitionId === undefined || p.competitionId === competitionId) &&
      (!position || p.position === position) &&
      (!term ||
        p.name.toLowerCase().includes(term) ||
        p.real_team.toLowerCase().includes(term)),
  )
    // Price first, id as a tie-breaker: many players share a price, and
    // without a unique second key paging could repeat or skip a player.
    .sort((a, b) => b.price - a.price || a.id - b.id);

  const from = page * pageSize;
  const players = matches
    .slice(from, from + pageSize)
    .map(({ id, name, position, real_team, price }) => ({ id, name, position, real_team, price }));

  return later({ players, total: matches.length });
}
