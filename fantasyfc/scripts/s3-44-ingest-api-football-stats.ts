// #44: per-player, per-gameweek match stats from API-Football for every
// competition except the Premier League (which keeps the FPL feed:
// npm run ingest:gameweek-stats).
//
// For each competition:
//  1. One /fixtures call (cached for the day) lists the season's matches.
//  2. Clubs are crosswalked to API-Football teams by kickoff time
//     (crosswalkClubs in lib/apiFootballStats.ts) and the result is saved to
//     club.api_football_team_id, so later runs skip that step. PSL clubs
//     already are API-Football teams.
//  3. Each finished fixture costs one /fixtures/players call, cached forever.
//     Players are matched to football_players by name within their club
//     (the S2-08b matcher); PSL players by id.
//  4. Rows are summed per player per gameweek and upserted into
//     player_gameweek_stats. Points are derived on read, as for the PL.
//
// The free plan allows 100 requests a day, and a gameweek is about 10. Newest
// gameweeks go first; the run stops at --max-requests (default 90) and a
// re-run tomorrow carries on from the cache.
//
// Run: npm run ingest:league-stats -- --all
//      npm run ingest:league-stats -- BL1 --gameweek=7 --max-requests=20

import { createClient } from "@supabase/supabase-js";
import {
  API_FOOTBALL_ID_OFFSET,
  currentSeason,
  flagValue,
  gameweekId,
  loadCompetitions,
  selectCompetitions,
  type Competition,
} from "./lib/competitions.ts";
import {
  ApiFootball,
  PlanRestricted,
  QuotaExhausted,
  type AfFixture,
  type AfFixtureTeamPlayers,
} from "./lib/apiFootball.ts";
import {
  crosswalkClubs,
  mergeGameweekRows,
  statsRowsForFixture,
  toMatchable,
  type StatsRow,
} from "./lib/apiFootballStats.ts";
import { matchFplPlayers } from "./s2-08b-match-players.ts";
import { selectAll } from "./lib/selectAll.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface OurFixture {
  id: number;
  gameweek_id: number | null;
  home_club_id: number;
  away_club_id: number;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

interface ClubRow {
  id: number;
  api_football_team_id: number | null;
}

async function crosswalk(
  competition: Competition,
  clubs: ClubRow[],
  apiFixtures: AfFixture[],
  ourFixtures: OurFixture[],
): Promise<Map<number, number>> {
  if (competition.data_source === "API_FOOTBALL") {
    return new Map(clubs.map((c) => [c.id - API_FOOTBALL_ID_OFFSET, c.id]));
  }

  const known = new Map(
    clubs.filter((c) => c.api_football_team_id !== null).map((c) => [c.api_football_team_id as number, c.id]),
  );
  const result = crosswalkClubs(
    apiFixtures.map((f) => ({ home: f.teams.home.id, away: f.teams.away.id, kickoff: f.fixture.date })),
    ourFixtures
      .filter((f) => f.kickoff_at !== null)
      .map((f) => ({ home: f.home_club_id, away: f.away_club_id, kickoff: f.kickoff_at as string })),
    known,
  );

  for (const [apiTeam, clubId] of result) {
    if (known.get(apiTeam) === clubId) continue;
    const { error } = await supabase.from("club").update({ api_football_team_id: apiTeam }).eq("id", clubId);
    if (error) throw new Error(`club ${clubId} api_football_team_id update failed: ${error.message}`);
  }

  const apiTeams = new Map<number, string>();
  for (const f of apiFixtures) {
    apiTeams.set(f.teams.home.id, f.teams.home.name);
    apiTeams.set(f.teams.away.id, f.teams.away.name);
  }
  const unmapped = [...apiTeams].filter(([id]) => !result.has(id));
  if (unmapped.length > 0) {
    console.warn(
      `  ${unmapped.length} API-Football teams have no club: ${unmapped.map(([id, name]) => `${name} (${id})`).join(", ")}. ` +
        "Set club.api_football_team_id by hand and re-run.",
    );
  }
  return result;
}

async function ingest(competition: Competition, api: ApiFootball, onlyGameweek: number | undefined) {
  if (competition.api_football_league_id === null) {
    throw new Error(`${competition.code} has no api_football_league_id.`);
  }

  // Players are loaded (paged) further down, once there is work to do.
  const [clubsRes, fixturesRes] = await Promise.all([
    supabase.from("club").select("id, api_football_team_id").eq("competition_id", competition.id),
    supabase
      .from("fixture")
      .select("id, gameweek_id, home_club_id, away_club_id, kickoff_at, home_score, away_score, status")
      .eq("competition_id", competition.id),
  ]);
  for (const r of [clubsRes, fixturesRes]) {
    if (r.error) throw new Error(`loading ${competition.code} data failed: ${r.error.message}`);
  }
  const ourFixtures = fixturesRes.data as OurFixture[];
  if (ourFixtures.length === 0) {
    // Usually a free API-Football key, which can't load the PSL's fixtures.
    console.warn(
      `${competition.name}: skipped, no fixtures. Run npm run ingest:league-fixtures -- ${competition.code} first.`,
    );
    return;
  }

  const apiFixtures = await api.get<AfFixture[]>(
    "/fixtures",
    { league: competition.api_football_league_id, season: currentSeason() },
    "today",
  );
  const clubByApiTeam = await crosswalk(competition, clubsRes.data as ClubRow[], apiFixtures, ourFixtures);

  const apiFixtureByPair = new Map(
    apiFixtures.map((f) => [`${clubByApiTeam.get(f.teams.home.id)}|${clubByApiTeam.get(f.teams.away.id)}`, f]),
  );

  const targetGameweek = onlyGameweek === undefined ? undefined : gameweekId(competition, onlyGameweek);
  const byGameweek = new Map<number, OurFixture[]>();
  for (const f of ourFixtures) {
    if (f.status !== "COMPLETED" || f.gameweek_id === null) continue;
    if (targetGameweek !== undefined && f.gameweek_id !== targetGameweek) continue;
    byGameweek.set(f.gameweek_id, [...(byGameweek.get(f.gameweek_id) ?? []), f]);
  }

  // Name matching, cached across fixtures: API-Football player id -> ours.
  const resolved = new Map<number, number>();
  // Paged: a league's squads can pass the 1,000-row cap.
  const players = await selectAll<{ id: number; name: string; club_id: number | null }>(
    (from, to) =>
      supabase
        .from("football_players")
        .select("id, name, club_id")
        .eq("competition_id", competition.id)
        .order("id")
        .range(from, to),
    `${competition.code} players`,
  );
  const playerIds = new Set(players.map((p) => p.id));

  let totalRows = 0;
  const unresolvedNames = new Set<string>();
  // Newest gameweeks first: they matter most for standings.
  for (const gw of [...byGameweek.keys()].sort((a, b) => b - a)) {
    const rows: StatsRow[] = [];
    let missing = 0;
    for (const ours of byGameweek.get(gw) ?? []) {
      const theirs = apiFixtureByPair.get(`${ours.home_club_id}|${ours.away_club_id}`);
      if (!theirs) {
        missing++;
        continue;
      }

      let teams: AfFixtureTeamPlayers[];
      try {
        teams = await api.get<AfFixtureTeamPlayers[]>("/fixtures/players", { fixture: theirs.fixture.id }, "forever");
      } catch (err) {
        // Keep what this gameweek has so far; the re-run completes it.
        if (err instanceof QuotaExhausted && rows.length > 0) await upsert(mergeGameweekRows(rows));
        throw err;
      }

      if (competition.data_source === "API_FOOTBALL") {
        // PSL players are stored under their API-Football id; one missing
        // from our squads (a late signing) stays unresolved.
        for (const side of teams) {
          for (const { player } of side.players) {
            const ours = API_FOOTBALL_ID_OFFSET + player.id;
            if (playerIds.has(ours)) resolved.set(player.id, ours);
          }
        }
      } else {
        const elements = teams.flatMap((side) =>
          side.players.filter(({ player }) => !resolved.has(player.id)).map(({ player }) => toMatchable(player, side.team.id)),
        );
        const { matched } = matchFplPlayers(elements, players, clubByApiTeam);
        for (const [apiId, ourId] of matched) resolved.set(apiId, ourId);
      }

      const goalsAgainst = (apiTeamId: number) => {
        const club = clubByApiTeam.get(apiTeamId);
        if (club === ours.home_club_id) return ours.away_score;
        if (club === ours.away_club_id) return ours.home_score;
        return null;
      };
      const result = statsRowsForFixture(teams, gw, goalsAgainst, (id) => resolved.get(id));
      rows.push(...result.rows);
      result.unresolved.forEach((n) => unresolvedNames.add(n));
    }

    const merged = mergeGameweekRows(rows);
    await upsert(merged);
    totalRows += merged.length;
    console.log(
      `  gameweek ${gw % 100}: ${merged.length} player rows` +
        (missing > 0 ? `, ${missing} fixtures not found on API-Football` : ""),
    );
  }

  if (unresolvedNames.size > 0) {
    const sample = [...unresolvedNames].slice(0, 10).join(", ");
    console.warn(`  ${unresolvedNames.size} players not matched to football_players: ${sample}${unresolvedNames.size > 10 ? ", ..." : ""}`);
  }
  console.log(`${competition.name}: ${byGameweek.size} gameweeks, ${totalRows} rows.`);
}

async function upsert(rows: StatsRow[]) {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("player_gameweek_stats")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "player_id,gameweek_id" });
    if (error) throw new Error(`player_gameweek_stats upsert failed: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const competitions = selectCompetitions(await loadCompetitions(supabase), args);
  if (competitions.some((c) => c.code === "PL")) {
    throw new Error("Premier League stats come from the FPL feed: npm run ingest:gameweek-stats.");
  }
  const gameweek = flagValue(args, "gameweek");
  const api = new ApiFootball(Number(flagValue(args, "max-requests") ?? 90));

  try {
    for (const competition of competitions) {
      if (competition.data_source === "ESPN") {
        console.log(`${competition.name}: skipped, its stats come from ESPN (npm run ingest:espn-stats).`);
        continue;
      }
      try {
        await ingest(competition, api, gameweek === undefined ? undefined : Number(gameweek));
      } catch (err) {
        // Free keys can't see the current season; nothing to ingest there.
        if (!(err instanceof PlanRestricted)) throw err;
        console.warn(`${competition.name}: skipped. ${err.message}`);
      }
    }
  } catch (err) {
    if (!(err instanceof QuotaExhausted)) throw err;
    console.warn(err.message);
  } finally {
    console.log(`Used ${api.requestsUsed} API-Football requests.`);
  }
}

main().catch((err) => {
  console.error("League stats ingestion failed:", err);
  process.exitCode = 1;
});
