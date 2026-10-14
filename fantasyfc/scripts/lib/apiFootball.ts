// Minimal API-Football (api-sports.io) client for the ingest scripts (#44).
//
// The free plan allows 100 requests a day, so every response is cached on
// disk under .cache/api-football/ (gitignored). Finished-match data never
// changes, so those responses are reused forever; list endpoints that do
// change (fixture lists, squads) are cached for the day they were fetched.
// A re-run therefore only spends requests on what it hasn't seen yet.
//
// Requires API_FOOTBALL_KEY in the environment (keep it in .env.ingest).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API_BASE = "https://v3.football.api-sports.io";
const CACHE_DIR = join(process.cwd(), ".cache", "api-football");

/** API-Football wraps every payload in this envelope, errors included. */
interface Envelope<T> {
  errors: unknown[] | Record<string, string>;
  results: number;
  paging?: { current: number; total: number };
  response: T;
}

export type CachePolicy = "forever" | "today";

export class ApiFootball {
  private requestsMade = 0;
  private readonly key: string;
  private readonly maxRequests: number;

  constructor(maxRequests = 90) {
    const key = process.env.API_FOOTBALL_KEY;
    if (!key) {
      throw new Error(
        "Set API_FOOTBALL_KEY (free key from dashboard.api-football.com) in .env.ingest before running this script.",
      );
    }
    this.key = key;
    this.maxRequests = maxRequests;
  }

  get requestsUsed(): number {
    return this.requestsMade;
  }

  /** True once this run has spent its request allowance. */
  get exhausted(): boolean {
    return this.requestsMade >= this.maxRequests;
  }

  async get<T>(path: string, params: Record<string, string | number>, cache: CachePolicy): Promise<T> {
    const query = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ).toString();
    const day = new Date().toISOString().slice(0, 10);
    const name = `${path.replace(/\//g, "_")}__${query.replace(/[&=]/g, "_")}${cache === "today" ? `__${day}` : ""}.json`;
    const file = join(CACHE_DIR, name);

    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      // Not cached yet.
    }

    if (this.exhausted) {
      throw new QuotaExhausted(this.maxRequests);
    }
    this.requestsMade++;

    const res = await fetch(`${API_BASE}${path}?${query}`, {
      headers: { "x-apisports-key": this.key },
    });
    if (!res.ok) {
      throw new Error(`API-Football ${path}?${query} responded ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as Envelope<T>;

    // Plan limits (e.g. a season the free plan can't see) arrive as a 200
    // with a non-empty `errors`, not as an HTTP error.
    const errors = Array.isArray(body.errors) ? body.errors : Object.values(body.errors ?? {});
    if (errors.length > 0) {
      const message = `API-Football ${path}?${query}: ${errors.map(String).join("; ")}`;
      if (!Array.isArray(body.errors) && "plan" in body.errors) throw new PlanRestricted(message);
      throw new Error(message);
    }

    const remaining = res.headers.get("x-ratelimit-requests-remaining");
    if (remaining !== null && Number(remaining) <= 0) {
      console.warn("API-Football daily quota is used up; the rest of this run reads the cache only.");
      this.requestsMade = this.maxRequests;
    }

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(body.response));
    return body.response;
  }
}

/**
 * The plan can't see this data. Free keys only reach seasons 2022-2024, so
 * the current season's fixtures and stats need a paid plan.
 */
export class PlanRestricted extends Error {
  /** The newest season the plan allows, when the message names one. */
  get latestAllowedSeason(): number | null {
    const m = /to (\d{4})/.exec(this.message);
    return m ? Number(m[1]) : null;
  }
}

export class QuotaExhausted extends Error {
  constructor(max: number) {
    super(`Stopped after ${max} API-Football requests (pass --max-requests=N to change). Re-run tomorrow to continue; finished work is cached.`);
  }
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we read)
// ---------------------------------------------------------------------------

export interface AfTeam {
  id: number;
  name: string;
  code: string | null;
}

export interface AfFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string };
  };
  league: { round: string };
  teams: { home: AfTeam; away: AfTeam };
  goals: { home: number | null; away: number | null };
}

export interface AfSquadPlayer {
  id: number;
  name: string;
  position: string | null;
}

export interface AfFixturePlayerStats {
  games: { minutes: number | null; position: string | null; substitute: boolean | null };
  goals: { total: number | null; conceded: number | null; assists: number | null; saves: number | null };
  cards: { yellow: number | null; red: number | null };
  penalty: { saved: number | null; missed: number | null };
  tackles: { total: number | null; blocks: number | null; interceptions: number | null };
}

export interface AfFixtureTeamPlayers {
  team: AfTeam;
  players: { player: { id: number; name: string }; statistics: AfFixturePlayerStats[] }[];
}

/** "Regular Season - 7" -> 7. Null for rounds that aren't a league matchday. */
export function roundNumber(round: string): number | null {
  const m = /^Regular Season\s*-\s*(\d+)$/.exec(round.trim());
  return m ? Number(m[1]) : null;
}

export function fixtureStatus(short: string): "UPCOMING" | "LIVE" | "COMPLETED" {
  if (["FT", "AET", "PEN"].includes(short)) return "COMPLETED";
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "SUSP"].includes(short)) return "LIVE";
  return "UPCOMING";
}

/**
 * A three-letter code per club, unique within the league. API-Football's own
 * code is used when it has one; otherwise the first letters of the name.
 */
export function shortCodes(teams: AfTeam[]): Map<number, string> {
  const taken = new Set<string>();
  const codes = new Map<number, string>();
  for (const t of teams) {
    const base = (t.code ?? t.name.replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase().padEnd(3, "X");
    let code = base;
    for (let i = 2; taken.has(code); i++) code = `${base.slice(0, 2)}${i}`;
    taken.add(code);
    codes.set(t.id, code);
  }
  return codes;
}
