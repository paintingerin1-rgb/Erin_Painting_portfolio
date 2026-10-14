// #44: gameweeks + fixtures for every competition except the Premier League
// (which keeps using the FPL feed: npm run ingest:fixtures).
//
// - football-data.org competitions (PD, BL1, SA, FL1, DED, PPL): one
//   /competitions/<code>/matches call each, on the free plan.
// - API-Football competitions (PSL): one /fixtures call, ids offset by
//   API_FOOTBALL_ID_OFFSET (needs a paid key for the current season).
// - ESPN competitions (PSL, MLS, J1 since #45) are skipped: npm run ingest:espn-leagues.
//
// A competition's gameweeks are its matchdays: the deadline is 90 minutes
// before the matchday's first kickoff and the current gameweek is the latest
// one whose deadline has passed (see buildGameweeks in lib/competitions.ts).
// Idempotent; re-run whenever results or kickoff times change.
//
// Run: npm run ingest:league-fixtures -- --all   (or name codes: -- PD BL1)

import { createClient } from "@supabase/supabase-js";
import {
  buildGameweeks,
  currentSeason,
  fromApiFootballId,
  gameweekId,
  loadCompetitions,
  selectCompetitions,
  sleep,
  upsertGameweeks,
  type Competition,
} from "./lib/competitions.ts";
import {
  ApiFootball,
  PlanRestricted,
  fixtureStatus as afStatus,
  roundNumber,
  type AfFixture,
} from "./lib/apiFootball.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface FixtureRow {
  id: number;
  competition_id: number;
  gameweek_id: number | null;
  home_club_id: number;
  away_club_id: number;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
  status: "UPCOMING" | "LIVE" | "COMPLETED";
}

interface ParsedFixture {
  row: Omit<FixtureRow, "gameweek_id">;
  matchday: number | null;
}

// ---------------------------------------------------------------------------
// football-data.org
// ---------------------------------------------------------------------------

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  homeTeam: { id: number | null };
  awayTeam: { id: number | null };
  score: { fullTime: { home: number | null; away: number | null } };
}

function fdStatus(status: string): FixtureRow["status"] {
  if (status === "FINISHED" || status === "AWARDED") return "COMPLETED";
  if (status === "IN_PLAY" || status === "PAUSED" || status === "LIVE") return "LIVE";
  return "UPCOMING";
}

async function footballDataFixtures(competition: Competition): Promise<ParsedFixture[]> {
  if (!FOOTBALL_API_KEY) throw new Error("Set FOOTBALL_API_KEY in .env.ingest.");
  const res = await fetch(
    `https://api.football-data.org/v4/competitions/${competition.code}/matches`,
    { headers: { "X-Auth-Token": FOOTBALL_API_KEY } },
  );
  if (!res.ok) throw new Error(`football-data.org ${competition.code} matches: ${res.status} ${res.statusText}`);
  const { matches } = (await res.json()) as { matches: FdMatch[] };

  return matches
    .filter((m) => m.homeTeam.id !== null && m.awayTeam.id !== null)
    .map((m) => ({
      matchday: m.matchday,
      row: {
        id: m.id,
        competition_id: competition.id,
        home_club_id: m.homeTeam.id as number,
        away_club_id: m.awayTeam.id as number,
        kickoff_at: m.utcDate,
        home_score: m.score.fullTime.home,
        away_score: m.score.fullTime.away,
        status: fdStatus(m.status),
      },
    }));
}

// ---------------------------------------------------------------------------
// API-Football
// ---------------------------------------------------------------------------

async function apiFootballFixtures(competition: Competition, api: ApiFootball): Promise<ParsedFixture[]> {
  if (competition.api_football_league_id === null) {
    throw new Error(`${competition.code} has no api_football_league_id.`);
  }
  const fixtures = await api.get<AfFixture[]>(
    "/fixtures",
    { league: competition.api_football_league_id, season: currentSeason() },
    "today",
  );
  return fixtures.map((f) => ({
    matchday: roundNumber(f.league.round),
    row: {
      id: fromApiFootballId(f.fixture.id),
      competition_id: competition.id,
      home_club_id: fromApiFootballId(f.teams.home.id),
      away_club_id: fromApiFootballId(f.teams.away.id),
      kickoff_at: f.fixture.date,
      home_score: f.goals.home,
      away_score: f.goals.away,
      status: afStatus(f.fixture.status.short),
    },
  }));
}

// ---------------------------------------------------------------------------

async function ingest(competition: Competition, api: () => ApiFootball) {
  const parsed =
    competition.data_source === "API_FOOTBALL"
      ? await apiFootballFixtures(competition, api())
      : await footballDataFixtures(competition);

  // Fixtures can only point at clubs the squads ingest has created.
  const { data: clubs, error: clubError } = await supabase
    .from("club")
    .select("id")
    .eq("competition_id", competition.id);
  if (clubError) throw new Error(`club lookup failed: ${clubError.message}`);
  const clubIds = new Set(clubs.map((c) => c.id));
  if (clubIds.size === 0) {
    throw new Error(
      `${competition.name} has no clubs yet. Run ` +
        (competition.data_source !== "FOOTBALL_DATA"
          ? `npm run ingest:espn-leagues -- ${competition.code}`
          : `npm run ingest:players -- ${competition.code}`) +
        " first.",
    );
  }

  const gameweeks = buildGameweeks(
    competition,
    parsed.map((p) => ({ matchday: p.matchday, kickoff: p.row.kickoff_at })),
  );
  await upsertGameweeks(supabase, competition.id, gameweeks);
  const gameweekIds = new Set(gameweeks.map((g) => g.id));

  const unknownClubs = new Set<number>();
  const rows: FixtureRow[] = parsed.flatMap(({ row, matchday }) => {
    for (const club of [row.home_club_id, row.away_club_id]) {
      if (!clubIds.has(club)) unknownClubs.add(club);
    }
    if (!clubIds.has(row.home_club_id) || !clubIds.has(row.away_club_id)) return [];
    const gw = matchday === null ? null : gameweekId(competition, matchday);
    return [{ ...row, gameweek_id: gw !== null && gameweekIds.has(gw) ? gw : null }];
  });
  if (unknownClubs.size > 0) {
    console.warn(
      `  ${unknownClubs.size} clubs in ${competition.code}'s fixtures aren't in club (ids ${[...unknownClubs].join(", ")}); ` +
        "their fixtures were skipped. Re-run the squads ingest.",
    );
  }

  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from("fixture").upsert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`fixture upsert failed: ${error.message}`);
  }

  const current = gameweeks.find((g) => g.is_current);
  console.log(
    `${competition.name}: ${gameweeks.length} gameweeks (current: ${current?.number ?? "none yet"}), ${rows.length} fixtures.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const competitions = selectCompetitions(await loadCompetitions(supabase), args);
  if (competitions.some((c) => c.code === "PL")) {
    throw new Error("The Premier League's fixtures come from the FPL feed: npm run ingest:fixtures.");
  }

  let api: ApiFootball | undefined;
  const lazyApi = () => (api ??= new ApiFootball());

  let footballDataCalls = 0;
  for (const competition of competitions) {
    if (competition.data_source === "ESPN") {
      console.log(`${competition.name}: skipped, its fixtures come from ESPN (npm run ingest:espn-leagues).`);
      continue;
    }
    // football-data.org's free plan allows 10 requests a minute.
    if (competition.data_source === "FOOTBALL_DATA" && footballDataCalls++ > 0) await sleep(7000);
    try {
      await ingest(competition, lazyApi);
    } catch (err) {
      // A free API-Football key can't see the current season: skip that
      // league (it stays draftable, with no gameweeks) and carry on.
      if (!(err instanceof PlanRestricted)) throw err;
      console.warn(`${competition.name}: skipped. ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error("League fixture ingestion failed:", err);
  process.exitCode = 1;
});
