// ESPN's public soccer JSON API, for match stats outside the Premier League
// (#45). No key and no daily limit, but it is undocumented and unofficial:
// ESPN can change or block it without notice.
//
// Responses are cached under .cache/espn/ (gitignored): finished-match
// summaries forever, schedules and team lists for the day. Requests are
// spaced out so a full run doesn't hammer the site.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { StatsRow } from "./apiFootballStats.ts";
import type { FplElement } from "../s2-08b-match-players.ts";

const API_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const CACHE_DIR = join(process.cwd(), ".cache", "espn");
const PAUSE_MS = 250;

/** Our competition.code -> ESPN's league slug. */
export const ESPN_LEAGUES: Record<string, string> = {
  PD: "esp.1",
  BL1: "ger.1",
  SA: "ita.1",
  FL1: "fra.1",
  DED: "ned.1",
  PPL: "por.1",
  PSL: "rsa.1",
  MLS: "usa.1",
  J1: "jpn.1",
};

/**
 * UTC offset used to cut a league's calendar weeks into gameweeks, so a
 * whole local weekend falls in one week. MLS uses US Pacific time, so even
 * a late West Coast Sunday kickoff counts as Sunday.
 */
export const WEEK_UTC_OFFSET_HOURS: Record<string, number> = {
  PSL: 2,
  MLS: -8,
  J1: 9,
};

/**
 * ESPN clubs and players are stored under this offset + their ESPN id, clear
 * of football-data.org ids and API-Football's 1,000,000,000 range.
 */
export const ESPN_ID_OFFSET = 2_000_000_000;

export function fromEspnId(espnId: number | string): number {
  return ESPN_ID_OFFSET + Number(espnId);
}

/**
 * ESPN fixtures get their own offset: ESPN match ids run from ~760,000 (MLS)
 * to ~400,000,000, and the small ones would collide with football-data.org
 * match ids. 1,500,000,000 + 400,000,000 still fits a Postgres integer.
 */
export const ESPN_FIXTURE_ID_OFFSET = 1_500_000_000;

export function fromEspnFixtureId(espnId: number | string): number {
  return ESPN_FIXTURE_ID_OFFSET + Number(espnId);
}

export class Espn {
  private requestsMade = 0;

  get requestsUsed(): number {
    return this.requestsMade;
  }

  async get<T>(path: string, cache: "forever" | "today"): Promise<T> {
    const day = new Date().toISOString().slice(0, 10);
    const name = `${path.replace(/[/?=&]/g, "_")}${cache === "today" ? `__${day}` : ""}.json`;
    const file = join(CACHE_DIR, name);
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      // Not cached yet.
    }

    if (this.requestsMade > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
    this.requestsMade++;
    // fetch() decompresses the gzip ESPN always sends.
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`ESPN ${path} responded ${res.status} ${res.statusText}`);
    const body = (await res.json()) as T & { code?: number; message?: string };
    if (body.code && body.code >= 400) throw new Error(`ESPN ${path}: ${body.message}`);

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(file, JSON.stringify(body));
    return body;
  }
}

// ---------------------------------------------------------------------------
// Response shapes (only the fields we read)
// ---------------------------------------------------------------------------

export interface EspnTeamsResponse {
  sports: {
    leagues: { teams: { team: { id: string; displayName: string; abbreviation?: string } }[] }[];
  }[];
}

export interface EspnRosterResponse {
  athletes?: { id: string; displayName: string; position?: { name?: string } }[];
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  team: { id: string; displayName: string };
}

export interface EspnScheduleEvent {
  id: string;
  date: string;
  /** e.g. "Regular Season", "2026-27 South African Premiership", "Placement Playoffs". */
  seasonType?: { id: string; name: string };
  competitions: { competitors: EspnCompetitor[]; status: { type: { completed: boolean } } }[];
}

export interface EspnScheduleResponse {
  events: EspnScheduleEvent[];
}

export interface EspnPlay {
  clock: { displayValue: string };
  substitution: boolean;
  redCard: boolean;
}

export interface EspnRosterEntry {
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  athlete: { id: string; displayName: string; fullName?: string; lastName?: string };
  plays?: EspnPlay[];
  stats?: { name: string; value: number }[];
}

export interface EspnSummary {
  header: { competitions: { competitors: (EspnCompetitor & { score?: string })[] }[] };
  rosters?: { team: { id: string }; roster: EspnRosterEntry[] }[];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export interface EspnFixture {
  id: number;
  home: number;
  away: number;
  kickoff: string;
  completed: boolean;
  seasonType: string | null;
}

/** Every club's schedule lists each match twice; this keeps one of each. */
export function fixturesFromSchedules(schedules: EspnScheduleResponse[]): EspnFixture[] {
  const byId = new Map<number, EspnFixture>();
  for (const s of schedules) {
    for (const e of s.events ?? []) {
      const c = e.competitions[0];
      const home = c?.competitors.find((x) => x.homeAway === "home");
      const away = c?.competitors.find((x) => x.homeAway === "away");
      if (!home || !away) continue;
      byId.set(Number(e.id), {
        id: Number(e.id),
        home: Number(home.team.id),
        away: Number(away.team.id),
        kickoff: e.date,
        completed: c.status.type.completed,
        seasonType: e.seasonType?.id ?? null,
      });
    }
  }
  return [...byId.values()];
}

const RECENT_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Only the league season being played now. A club's schedule can also list
 * other stages: the J1 League's one-off spring 2026 "100 Year Vision League"
 * and its playoffs sit next to the 2026/27 season, and MLS adds its Cup
 * playoffs late in the year.
 *
 * Of the stages with a match within 60 days of `now`, the one with the most
 * matches wins. That keeps the MLS regular season (510 matches) once its
 * playoffs start, rather than switching to the playoffs and dropping every
 * regular-season gameweek on the next run.
 */
export function currentSeasonOnly(fixtures: EspnFixture[], now = new Date()): EspnFixture[] {
  const recent = fixtures.filter((f) => Math.abs(Date.parse(f.kickoff) - now.getTime()) <= RECENT_MS);
  const candidates = new Set((recent.length > 0 ? recent : fixtures).map((f) => f.seasonType));
  const size = (stage: string | null) => fixtures.filter((f) => f.seasonType === stage).length;
  const stage = [...candidates].sort((a, b) => size(b) - size(a))[0];
  return fixtures.filter((f) => f.seasonType === stage);
}

const HOUR_MS = 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/**
 * Matchday numbers for a league with no rounds in the feed (the ESPN
 * leagues): gameweek N is the Nth calendar week, Monday to Sunday in the
 * league's local time (`utcOffsetHours`, e.g. 2 for South Africa), counting
 * from the week of the season's first match. A club with a midweek and a
 * weekend match plays twice in that gameweek.
 *
 * Weeks without matches (international breaks) are skipped numbers rather
 * than closed up, so a postponed match moved into an empty week never
 * renumbers the gameweeks after it, and stored points stay in their week.
 */
export function weeklyMatchdays(kickoffs: string[], utcOffsetHours = 2): Map<string, number> {
  // 1970-01-01 was a Thursday, so shift by 3 days to start weeks on Monday.
  const weekOf = (iso: string) =>
    Math.floor((Date.parse(iso) + utcOffsetHours * HOUR_MS + 72 * HOUR_MS) / WEEK_MS);
  const first = Math.min(...kickoffs.map(weekOf));
  return new Map(kickoffs.map((k) => [k, weekOf(k) - first + 1]));
}

// ---------------------------------------------------------------------------
// Players and minutes
// ---------------------------------------------------------------------------

/** For matchFplPlayers(): ESPN gives a full name and a last name. */
export function toMatchable(entry: EspnRosterEntry, espnTeamId: number): FplElement {
  const full = entry.athlete.fullName ?? entry.athlete.displayName;
  const last = entry.athlete.lastName ?? "";
  const first = last && full.endsWith(last) ? full.slice(0, full.length - last.length).trim() : "";
  return {
    id: Number(entry.athlete.id),
    first_name: first,
    second_name: last || full,
    web_name: entry.athlete.displayName,
    team: espnTeamId,
  };
}

/** "71'" -> 71, "45'+1'" -> 46, "90'+4'" -> 94. */
export function clockMinute(display: string): number | null {
  const m = /^(\d+)'(?:\+(\d+)')?$/.exec(display.trim());
  return m ? Number(m[1]) + Number(m[2] ?? 0) : null;
}

/**
 * Minutes on the pitch, from when the player came on to when they went off
 * (substituted or sent off), on a 90-minute match. Anyone who played gets at
 * least 1. Returns 0 for an unused substitute.
 */
export function minutesPlayed(entry: EspnRosterEntry): number {
  if (!entry.starter && !entry.subbedIn) return 0;
  const plays = entry.plays ?? [];
  const subClocks = plays
    .filter((p) => p.substitution)
    .map((p) => clockMinute(p.clock.displayValue))
    .filter((m): m is number => m !== null);
  const redClock = plays
    .filter((p) => p.redCard)
    .map((p) => clockMinute(p.clock.displayValue))
    .find((m) => m !== null);

  // A substitute's first substitution play is coming on; a starter's is
  // going off.
  const on = entry.starter ? 0 : (subClocks[0] ?? 90);
  let off = 90;
  if (entry.subbedOut) off = (entry.starter ? subClocks[0] : subClocks[1]) ?? 90;
  if (redClock !== undefined) off = Math.min(off, redClock);

  return Math.max(1, Math.min(90, off) - Math.min(on, 90));
}

// ---------------------------------------------------------------------------
// Stats rows
// ---------------------------------------------------------------------------

/**
 * player_gameweek_stats rows for one finished ESPN match. ESPN's
 * goalsConceded is counted while the player was on the pitch, FPL's rule,
 * so a clean sheet is 60+ minutes with none conceded. Not in the feed, so 0:
 * penalties saved/missed, bonus, defensive contribution.
 */
export function espnRowsForMatch(
  summary: EspnSummary,
  gameweekId: number,
  resolvePlayer: (espnAthleteId: number) => number | undefined,
): { rows: StatsRow[]; unresolved: string[] } {
  const rows: StatsRow[] = [];
  const unresolved: string[] = [];
  const competitors = summary.header.competitions[0]?.competitors ?? [];

  for (const side of summary.rosters ?? []) {
    const opponent = competitors.find((c) => c.team.id !== side.team.id);
    const teamConceded = opponent?.score === undefined ? 0 : Number(opponent.score);

    for (const entry of side.roster) {
      const minutes = minutesPlayed(entry);
      if (minutes === 0) continue;
      const playerId = resolvePlayer(Number(entry.athlete.id));
      if (playerId === undefined) {
        unresolved.push(entry.athlete.displayName);
        continue;
      }
      const stat = (name: string) => entry.stats?.find((s) => s.name === name)?.value;
      const conceded = stat("goalsConceded") ?? teamConceded;

      rows.push({
        player_id: playerId,
        gameweek_id: gameweekId,
        minutes,
        goals_scored: stat("totalGoals") ?? 0,
        assists: stat("goalAssists") ?? 0,
        clean_sheets: minutes >= 60 && conceded === 0 ? 1 : 0,
        goals_conceded: conceded,
        own_goals: stat("ownGoals") ?? 0,
        penalties_saved: 0,
        penalties_missed: 0,
        yellow_cards: stat("yellowCards") ?? 0,
        red_cards: stat("redCards") ?? 0,
        saves: stat("saves") ?? 0,
        bonus: 0,
        defensive_contribution: 0,
      });
    }
  }
  return { rows, unresolved };
}

// ---------------------------------------------------------------------------
// Pruning guard
// ---------------------------------------------------------------------------

/**
 * Share of a league's stored fixtures a reload may drop before the loader
 * refuses to touch its schedule. A normal run drops none or a handful (a
 * match ESPN removes). Losing more means ESPN's response no longer looks
 * like the season we have, e.g. a relabelled season picked as the wrong
 * stage, and pruning would delete real fixtures, gameweeks and points.
 */
export const MAX_FIXTURE_LOSS = 0.25;

/** Which stored fixtures a reload would drop, and whether that's too many. */
export function fixtureLoss(
  existing: number[],
  incoming: Set<number>,
): { lost: number[]; share: number; tooMany: boolean } {
  const lost = existing.filter((id) => !incoming.has(id));
  const share = existing.length === 0 ? 0 : lost.length / existing.length;
  return { lost, share, tooMany: share > MAX_FIXTURE_LOSS };
}
