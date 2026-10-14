// Shared helpers for the multi-league ingest scripts (#44).
//
// See supabase/migrations/20261010120000_multi_competition.sql for why
// gameweek ids and API-Football ids are shaped the way they are.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Competition {
  id: number;
  name: string;
  code: string;
  country: string | null;
  api_football_league_id: number | null;
  data_source: "FOOTBALL_DATA" | "API_FOOTBALL" | "ESPN";
}

/**
 * Clubs, players and fixtures that come from API-Football are stored under
 * this offset + their API-Football id, so they can never collide with a
 * football-data.org id in the same integer column.
 */
export const API_FOOTBALL_ID_OFFSET = 1_000_000_000;

export function fromApiFootballId(apiFootballId: number): number {
  return API_FOOTBALL_ID_OFFSET + apiFootballId;
}

/**
 * gameweek.id for a competition's Nth gameweek. The Premier League keeps the
 * FPL event number (1-38) it has always used; every other competition gets
 * competition_id * 100 + number.
 */
export function gameweekId(competition: Pick<Competition, "id" | "code">, number: number): number {
  if (!Number.isInteger(number) || number < 1 || number > 99) {
    throw new Error(`Gameweek number ${number} is out of range 1-99.`);
  }
  return competition.code === "PL" ? number : competition.id * 100 + number;
}

/**
 * API-Football's season is the year the season starts in. A league running
 * Aug 2026 - May 2027 is season 2026; before July we're still in last year's.
 * Override with API_FOOTBALL_SEASON for a league on a calendar-year season.
 */
export function currentSeason(now = new Date()): number {
  const override = process.env.API_FOOTBALL_SEASON;
  if (override) return Number(override);
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** The FPL deadline rule: 90 minutes before a gameweek's first kickoff. */
export const DEADLINE_LEAD_MS = 90 * 60 * 1000;

export interface GameweekRow {
  id: number;
  competition_id: number;
  number: number;
  deadline_at: string;
  is_current: boolean;
}

/**
 * Builds a competition's gameweeks from its fixtures' matchdays. A gameweek's
 * deadline is 90 minutes before its earliest kickoff, and the current one is
 * the latest gameweek whose deadline has passed (FPL's is_current rule).
 * Matchdays with no timed fixture yet are left out.
 */
export function buildGameweeks(
  competition: Pick<Competition, "id" | "code">,
  fixtures: { matchday: number | null; kickoff: string | null }[],
  now = new Date(),
): GameweekRow[] {
  const firstKickoff = new Map<number, number>();
  for (const f of fixtures) {
    if (f.matchday === null || f.kickoff === null) continue;
    const t = Date.parse(f.kickoff);
    const prev = firstKickoff.get(f.matchday);
    if (prev === undefined || t < prev) firstKickoff.set(f.matchday, t);
  }

  const rows = [...firstKickoff.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, kickoff]) => ({
      id: gameweekId(competition, number),
      competition_id: competition.id,
      number,
      deadline_at: new Date(kickoff - DEADLINE_LEAD_MS).toISOString(),
      is_current: false,
    }));

  const started = rows.filter((r) => Date.parse(r.deadline_at) <= now.getTime());
  const current = started.at(-1);
  if (current) current.is_current = true;
  return rows;
}

/**
 * Writes gameweeks without tripping the one-current-per-competition index:
 * clear the old current flag first, then upsert.
 */
export async function upsertGameweeks(
  supabase: SupabaseClient,
  competitionId: number,
  rows: GameweekRow[],
): Promise<void> {
  const { error: clearError } = await supabase
    .from("gameweek")
    .update({ is_current: false })
    .eq("competition_id", competitionId)
    .eq("is_current", true);
  if (clearError) throw new Error(`clearing current gameweek failed: ${clearError.message}`);

  const { error } = await supabase.from("gameweek").upsert(rows);
  if (error) throw new Error(`gameweek upsert failed: ${error.message}`);
}

export async function loadCompetitions(supabase: SupabaseClient): Promise<Competition[]> {
  const { data, error } = await supabase
    .from("competition")
    .select("id, name, code, country, api_football_league_id, data_source")
    .order("id");
  if (error) throw new Error(`Could not load competitions: ${error.message}`);
  return data as Competition[];
}

/**
 * Picks the competitions a script was asked for: codes as CLI arguments
 * ("PD BL1"), or every competition except the Premier League with --all.
 */
export function selectCompetitions(all: Competition[], args: string[]): Competition[] {
  const codes = args.filter((a) => !a.startsWith("--"));
  if (args.includes("--all")) return all.filter((c) => c.code !== "PL");
  if (codes.length === 0) {
    throw new Error(
      `Name the competitions to ingest (${all.map((c) => c.code).join(", ")}) or pass --all.`,
    );
  }
  return codes.map((code) => {
    const c = all.find((x) => x.code === code.toUpperCase());
    if (!c) throw new Error(`Unknown competition code ${code}.`);
    return c;
  });
}

/** Value of a --flag=value argument, if given. */
export function flagValue(args: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  return args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
