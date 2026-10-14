// S2-07: ingest gameweek + fixture schema from the FPL feed.
//
// Pulls every gameweek and fixture for the season from the same free,
// unauthenticated FPL API S2-08a proved out, and upserts them into
// `gameweek` and `fixture`. Idempotent and safe to re-run any time the
// fixture list changes (postponements, rescheduling) or a gameweek finishes.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment — never commit that
// key. VITE_SUPABASE_URL is reused from .env since it's already public.
//
// Run: npm run ingest:fixtures

import { createClient } from "@supabase/supabase-js";
import { upsertGameweeks } from "./lib/competitions.ts";
import { fplFixtureStatus } from "./lib/fplFixtures.ts";

const API_BASE = "https://fantasy.premierleague.com/api";
// The FPL site rejects requests with no User-Agent.
const HEADERS = { "User-Agent": "Mozilla/5.0" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface BootstrapEvent {
  id: number;
  deadline_time: string;
  is_current: boolean;
}

interface BootstrapTeam {
  id: number;
  short_name: string;
}

interface Bootstrap {
  events: BootstrapEvent[];
  teams: BootstrapTeam[];
}

interface Club {
  id: number;
  short_code: string;
  fpl_team_id: number | null;
}

interface Fixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  kickoff_time: string | null;
  started: boolean;
  finished: boolean;
  finished_provisional?: boolean;
  team_h_score: number | null;
  team_a_score: number | null;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`${path} responded ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// Maps each FPL team id to a public.club id. The club rows come from the
// player ingestion (football-data.org); this only fills in fpl_team_id.
//
// A team is matched on its 3-letter code first (FPL short_name vs
// football-data.org tla), because the code is stable across seasons while FPL
// renumbers its team ids every season. Where the two providers use different
// codes, set club.fpl_team_id by hand and the fallback below picks it up.
// A team matching neither is logged and its fixtures are skipped, rather than
// failing the whole run.
async function resolveClubs(teams: BootstrapTeam[]): Promise<Map<number, number>> {
  const { data: clubs, error } = await supabase
    .from("club")
    .select("id, short_code, fpl_team_id");
  if (error) throw new Error(`club lookup failed: ${error.message}`);

  const byCode = new Map((clubs as Club[]).map((c) => [c.short_code, c]));
  const byFplId = new Map(
    (clubs as Club[])
      .filter((c) => c.fpl_team_id !== null)
      .map((c) => [c.fpl_team_id, c]),
  );

  const clubByFplTeam = new Map<number, number>();
  for (const team of teams) {
    const club = byCode.get(team.short_name) ?? byFplId.get(team.id);
    if (!club) {
      console.warn(
        `No club matches FPL team ${team.id} (${team.short_name}); its fixtures were skipped. ` +
          `Set club.fpl_team_id = ${team.id} on the right club and re-run.`,
      );
      continue;
    }
    if (club.fpl_team_id !== team.id) {
      const { error: updateError } = await supabase
        .from("club")
        .update({ fpl_team_id: team.id })
        .eq("id", club.id);
      if (updateError) {
        throw new Error(`club ${club.id} fpl_team_id update failed: ${updateError.message}`);
      }
    }
    clubByFplTeam.set(team.id, club.id);
  }
  return clubByFplTeam;
}

async function main() {
  const { data: competition, error: competitionError } = await supabase
    .from("competition")
    .select("id")
    .eq("name", "English Premier League")
    .single();
  if (competitionError || !competition) {
    throw new Error(
      `Could not find the English Premier League competition row: ${competitionError?.message ?? "not found"}`,
    );
  }

  const [bootstrap, fixtures] = await Promise.all([
    fetchJson<Bootstrap>("/bootstrap-static/"),
    fetchJson<Fixture[]>("/fixtures/"),
  ]);

  const clubByFplTeam = await resolveClubs(bootstrap.teams);

  const gameweeks = bootstrap.events.map((e) => ({
    id: e.id,
    competition_id: competition.id,
    number: e.id,
    deadline_at: e.deadline_time,
    is_current: e.is_current,
  }));

  await upsertGameweeks(supabase, competition.id, gameweeks);
  console.log(`Upserted ${gameweeks.length} gameweeks.`);

  // Fixtures not yet assigned to a gameweek (postponed / TBC) are skipped -
  // gameweek_id is a real FK and can't point at nothing. So are fixtures
  // involving a club resolveClubs() couldn't match (already warned about).
  const rows = fixtures
    .filter(
      (f) =>
        f.event !== null &&
        clubByFplTeam.has(f.team_h) &&
        clubByFplTeam.has(f.team_a),
    )
    .map((f) => ({
      id: f.id,
      competition_id: competition.id,
      gameweek_id: f.event,
      home_club_id: clubByFplTeam.get(f.team_h),
      away_club_id: clubByFplTeam.get(f.team_a),
      kickoff_at: f.kickoff_time,
      home_score: f.team_h_score,
      away_score: f.team_a_score,
      status: fplFixtureStatus(f),
    }));

  // Upsert in chunks - a full season is ~380 fixtures.
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from("fixture").upsert(chunk);
    if (error) throw new Error(`fixture upsert failed: ${error.message}`);
  }
  console.log(`Upserted ${rows.length} fixtures.`);
}

main().catch((err) => {
  console.error("Fixture ingestion failed:", err);
  process.exitCode = 1;
});
