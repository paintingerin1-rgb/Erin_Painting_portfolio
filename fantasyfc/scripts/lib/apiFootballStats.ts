// Pure mapping logic for the API-Football stats ingest (#44), kept apart from
// the script so it can be unit tested without the network or a database.

import type { AfFixtureTeamPlayers } from "./apiFootball.ts";
import type { FplElement } from "../s2-08b-match-players.ts";

// ---------------------------------------------------------------------------
// Club crosswalk: API-Football team id -> club.id
// ---------------------------------------------------------------------------

export interface KickoffFixture {
  home: number;
  away: number;
  /** ISO 8601 kickoff time. */
  kickoff: string;
}

/**
 * Works out which of our clubs each provider team is, without comparing
 * names. Providers spell clubs very differently ("Inter" vs "FC
 * Internazionale Milano", "Sporting CP" vs "Sporting Clube de Portugal"),
 * but they agree on when each match kicks off.
 *
 * A provider fixture's candidates are our fixtures with the same kickoff,
 * minus any that contradict what is already known (a team already mapped to
 * a different club, or a club already taken by another team). When exactly
 * one candidate is left, the fixture votes: its home team is that home club,
 * its away team that away club. A team is mapped once its leading club has
 * at least two votes, strictly more than any other, and no other team claims
 * that club. Each new mapping can disambiguate shared kickoff slots (five
 * Bundesliga games at 15:30), so this repeats until nothing changes.
 * Mappings passed in `known` are kept as they are.
 */
export function crosswalkClubs(
  apiFixtures: KickoffFixture[],
  ourFixtures: KickoffFixture[],
  known: Map<number, number> = new Map(),
): Map<number, number> {
  const ourByKickoff = new Map<number, KickoffFixture[]>();
  for (const f of ourFixtures) {
    const t = Date.parse(f.kickoff);
    ourByKickoff.set(t, [...(ourByKickoff.get(t) ?? []), f]);
  }

  const result = new Map(known);
  for (;;) {
    const takenClubs = new Set(result.values());
    const fits = (team: number, club: number) =>
      result.has(team) ? result.get(team) === club : !takenClubs.has(club);

    const votes = new Map<number, Map<number, number>>();
    const vote = (team: number, club: number) => {
      if (result.has(team)) return;
      const tally = votes.get(team) ?? new Map<number, number>();
      tally.set(club, (tally.get(club) ?? 0) + 1);
      votes.set(team, tally);
    };
    for (const f of apiFixtures) {
      const candidates = (ourByKickoff.get(Date.parse(f.kickoff)) ?? []).filter(
        (c) => fits(f.home, c.home) && fits(f.away, c.away),
      );
      if (candidates.length !== 1) continue;
      vote(f.home, candidates[0].home);
      vote(f.away, candidates[0].away);
    }

    const proposals = new Map<number, number>();
    const claims = new Map<number, number>();
    for (const [team, tally] of votes) {
      const [best, second] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
      if (best[1] < 2 || (second && second[1] === best[1])) continue;
      proposals.set(team, best[0]);
      claims.set(best[0], (claims.get(best[0]) ?? 0) + 1);
    }
    let added = 0;
    for (const [team, club] of proposals) {
      if (claims.get(club) === 1) {
        result.set(team, club);
        added++;
      }
    }
    if (added === 0) return result;
  }
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/**
 * Turns an API-Football player into the shape matchFplPlayers() expects.
 * Match-sheet names are usually an initial and a surname ("T. Müller"), which
 * the matcher's "same surname, same first initial" pass resolves; full names
 * ("Vinícius Júnior") match exactly.
 */
export function toMatchable(apiPlayer: { id: number; name: string }, apiTeamId: number): FplElement {
  const name = apiPlayer.name.trim();
  const space = name.indexOf(" ");
  const first = space === -1 ? "" : name.slice(0, space).replace(/\.$/, "");
  const second = space === -1 ? name : name.slice(space + 1);
  return {
    id: apiPlayer.id,
    first_name: first,
    second_name: second,
    web_name: name,
    team: apiTeamId,
  };
}

// ---------------------------------------------------------------------------
// Stats rows
// ---------------------------------------------------------------------------

export interface StatsRow {
  player_id: number;
  gameweek_id: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  defensive_contribution: number;
}

const n = (v: number | null | undefined) => v ?? 0;

/**
 * player_gameweek_stats rows for one finished match.
 *
 * API-Football's per-match player stats cover most of what fpl_points() needs.
 * Where they don't, we approximate rather than invent:
 *  - goals_conceded is the team's goals against for the whole match (FPL
 *    counts only goals while the player was on the pitch);
 *  - clean_sheets is 1 when the team conceded none and the player played 60+
 *    minutes;
 *  - defensive_contribution is tackles + blocks + interceptions;
 *  - own_goals and bonus are 0 (not in this endpoint).
 * Players who didn't play, or whom `resolvePlayer` can't place, get no row.
 */
export function statsRowsForFixture(
  teams: AfFixtureTeamPlayers[],
  gameweekId: number,
  goalsAgainst: (apiTeamId: number) => number | null,
  resolvePlayer: (apiPlayerId: number) => number | undefined,
): { rows: StatsRow[]; unresolved: string[] } {
  const rows: StatsRow[] = [];
  const unresolved: string[] = [];
  for (const side of teams) {
    const against = goalsAgainst(side.team.id);
    for (const { player, statistics } of side.players) {
      const s = statistics[0];
      const minutes = n(s?.games.minutes);
      if (!s || minutes === 0) continue;
      const playerId = resolvePlayer(player.id);
      if (playerId === undefined) {
        unresolved.push(player.name);
        continue;
      }
      rows.push({
        player_id: playerId,
        gameweek_id: gameweekId,
        minutes,
        goals_scored: n(s.goals.total),
        assists: n(s.goals.assists),
        clean_sheets: against === 0 && minutes >= 60 ? 1 : 0,
        goals_conceded: n(against),
        own_goals: 0,
        penalties_saved: n(s.penalty.saved),
        penalties_missed: n(s.penalty.missed),
        yellow_cards: n(s.cards.yellow),
        red_cards: n(s.cards.red),
        saves: n(s.goals.saves),
        bonus: 0,
        defensive_contribution: n(s.tackles.total) + n(s.tackles.blocks) + n(s.tackles.interceptions),
      });
    }
  }
  return { rows, unresolved };
}

/**
 * Sums rows that share a player and gameweek (a team with two matches in one
 * gameweek), since player_gameweek_stats has one row per player per gameweek.
 */
export function mergeGameweekRows(rows: StatsRow[]): StatsRow[] {
  const merged = new Map<string, StatsRow>();
  for (const r of rows) {
    const key = `${r.player_id}|${r.gameweek_id}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...r });
      continue;
    }
    for (const field of Object.keys(r) as (keyof StatsRow)[]) {
      if (field === "player_id" || field === "gameweek_id") continue;
      prev[field] += r[field];
    }
  }
  return [...merged.values()];
}
