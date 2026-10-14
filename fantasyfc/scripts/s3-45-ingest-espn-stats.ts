// #45: per-player, per-gameweek match stats from ESPN for the six European
// leagues, the PSL, MLS and the J1 League (the Premier League keeps the FPL
// feed).
//
// For each competition:
//  1. ESPN's team list, then each club's schedule (cached for the day), give
//     the season's matches.
//  2. ESPN teams are matched to our clubs by kickoff time (crosswalkClubs),
//     then each of our finished fixtures to its ESPN match by home/away club.
//  3. Each finished match costs one summary request, cached forever. Players
//     are matched to football_players by name within their club (the S2-08b
//     matcher). The ESPN leagues' clubs, players and fixtures already are
//     ESPN's (ingest:espn-leagues), so they skip every matching step.
//  4. Rows are summed per player per gameweek and upserted into
//     player_gameweek_stats; points are derived on read, as for the PL.
//
// Newest gameweeks go first. Idempotent: re-run after each matchday.
//
// Run: npm run ingest:espn-stats -- --all
//      npm run ingest:espn-stats -- BL1 --gameweek=6

import { createClient } from "@supabase/supabase-js";
import {
  flagValue,
  gameweekId,
  loadCompetitions,
  selectCompetitions,
  type Competition,
} from "./lib/competitions.ts";
import { crosswalkClubs, mergeGameweekRows, type StatsRow } from "./lib/apiFootballStats.ts";
import {
  currentSeasonOnly,
  ESPN_LEAGUES,
  Espn,
  ESPN_FIXTURE_ID_OFFSET,
  fromEspnId,
  espnRowsForMatch,
  fixturesFromSchedules,
  toMatchable,
  type EspnScheduleResponse,
  type EspnSummary,
  type EspnTeamsResponse,
} from "./lib/espn.ts";
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
  status: string;
}

async function ingest(competition: Competition, espn: Espn, onlyGameweek: number | undefined) {
  const slug = ESPN_LEAGUES[competition.code];

  // Paged: MLS alone has ~960 players and the cap is 1,000 rows.
  const [ourFixtures, players] = await Promise.all([
    selectAll<OurFixture>(
      (from, to) =>
        supabase
          .from("fixture")
          .select("id, gameweek_id, home_club_id, away_club_id, kickoff_at, status")
          .eq("competition_id", competition.id)
          .order("id")
          .range(from, to),
      `${competition.code} fixtures`,
    ),
    selectAll<{ id: number; name: string; club_id: number | null }>(
      (from, to) =>
        supabase
          .from("football_players")
          .select("id, name, club_id")
          .eq("competition_id", competition.id)
          .order("id")
          .range(from, to),
      `${competition.code} players`,
    ),
  ]);
  if (ourFixtures.length === 0) {
    const load = competition.data_source === "ESPN"
      ? `npm run ingest:espn-leagues -- ${competition.code}`
      : `npm run ingest:league-fixtures -- ${competition.code}`;
    console.warn(`${competition.name}: skipped, no fixtures. Run ${load} first.`);
    return;
  }

  // 1. The season's matches, from every club's schedule.
  const teams = (await espn.get<EspnTeamsResponse>(`/${slug}/teams`, "today")).sports[0].leagues[0].teams;
  const schedules: EspnScheduleResponse[] = [];
  for (const { team } of teams) {
    schedules.push(await espn.get<EspnScheduleResponse>(`/${slug}/teams/${team.id}/schedule`, "today"));
  }
  const espnFixtures = currentSeasonOnly(fixturesFromSchedules(schedules));

  // 2. ESPN team -> our club, then our fixture -> ESPN match.
  const fromEspn = competition.data_source === "ESPN";
  const clubByTeam = fromEspn
    ? new Map(teams.map(({ team }) => [Number(team.id), fromEspnId(team.id)]))
    : crosswalkClubs(
        espnFixtures,
        ourFixtures
          .filter((f) => f.kickoff_at !== null)
          .map((f) => ({ home: f.home_club_id, away: f.away_club_id, kickoff: f.kickoff_at as string })),
      );
  const unmapped = teams.filter(({ team }) => !clubByTeam.has(Number(team.id)));
  if (unmapped.length > 0) {
    console.warn(`  ${unmapped.length} ESPN teams not matched to a club: ${unmapped.map(({ team }) => team.displayName).join(", ")}`);
  }
  // ESPN leagues share fixture ids with ESPN. Others pair up by home and
  // away club, which is unique in a double round robin (not in MLS, where
  // two clubs can meet at the same ground twice).
  const espnById = new Map(espnFixtures.map((f) => [f.id, f]));
  const espnByPair = new Map(
    espnFixtures.map((f) => [`${clubByTeam.get(f.home)}|${clubByTeam.get(f.away)}`, f]),
  );
  const espnMatchFor = (ours: OurFixture) =>
    fromEspn
      ? espnById.get(ours.id - ESPN_FIXTURE_ID_OFFSET)
      : espnByPair.get(`${ours.home_club_id}|${ours.away_club_id}`);

  const target = onlyGameweek === undefined ? undefined : gameweekId(competition, onlyGameweek);
  const byGameweek = new Map<number, OurFixture[]>();
  for (const f of ourFixtures) {
    if (f.status !== "COMPLETED" || f.gameweek_id === null) continue;
    if (target !== undefined && f.gameweek_id !== target) continue;
    byGameweek.set(f.gameweek_id, [...(byGameweek.get(f.gameweek_id) ?? []), f]);
  }

  // A gameweek with no finished match has no stats. On a full run, clear any
  // left from an earlier numbering or a result that was later voided.
  if (target === undefined) {
    const { data: allGameweeks, error } = await supabase
      .from("gameweek")
      .select("id")
      .eq("competition_id", competition.id);
    if (error) throw new Error(`gameweek lookup failed: ${error.message}`);
    await clearGameweeks((allGameweeks ?? []).map((g) => g.id).filter((id) => !byGameweek.has(id)));
  }

  // 3. Stats, newest gameweek first. ESPN athlete id -> our player id.
  const playerIds = new Set(players.map((p) => p.id));
  const resolved = new Map<number, number>();
  const unresolvedNames = new Set<string>();
  let totalRows = 0;

  for (const gw of [...byGameweek.keys()].sort((a, b) => b - a)) {
    const rows: StatsRow[] = [];
    let missing = 0;
    for (const ours of byGameweek.get(gw) ?? []) {
      const match = espnMatchFor(ours);
      if (!match?.completed) {
        missing++;
        continue;
      }
      const summary = await espn.get<EspnSummary>(`/${slug}/summary?event=${match.id}`, "forever");

      if (fromEspn) {
        // Same ids; a player missing from ingest:espn-leagues' squads stays unresolved.
        for (const side of summary.rosters ?? []) {
          for (const entry of side.roster) {
            const ours = fromEspnId(entry.athlete.id);
            if (playerIds.has(ours)) resolved.set(Number(entry.athlete.id), ours);
          }
        }
      } else {
        const elements = (summary.rosters ?? []).flatMap((side) =>
          side.roster
            .filter((entry) => !resolved.has(Number(entry.athlete.id)))
            .map((entry) => toMatchable(entry, Number(side.team.id))),
        );
        for (const [espnId, ourId] of matchFplPlayers(elements, players, clubByTeam).matched) {
          resolved.set(espnId, ourId);
        }
      }

      const result = espnRowsForMatch(summary, gw, (id) => resolved.get(id));
      rows.push(...result.rows);
      result.unresolved.forEach((n) => unresolvedNames.add(n));
    }

    // Replace the gameweek wholesale, so a player whose stats ESPN corrected
    // away (or rows from an older numbering) don't linger.
    const merged = mergeGameweekRows(rows);
    await clearGameweeks([gw]);
    await upsert(merged);
    totalRows += merged.length;
    console.log(
      `  gameweek ${gw % 100}: ${merged.length} player rows` +
        (missing > 0 ? `, ${missing} fixtures not found on ESPN` : ""),
    );
  }

  if (unresolvedNames.size > 0) {
    const sample = [...unresolvedNames].slice(0, 10).join(", ");
    console.warn(
      `  ${unresolvedNames.size} players who played weren't matched to football_players: ${sample}${unresolvedNames.size > 10 ? ", ..." : ""}`,
    );
  }
  console.log(`${competition.name}: ${byGameweek.size} gameweeks, ${totalRows} rows.`);
}

async function clearGameweeks(gameweekIds: number[]) {
  if (gameweekIds.length === 0) return;
  const { error } = await supabase.from("player_gameweek_stats").delete().in("gameweek_id", gameweekIds);
  if (error) throw new Error(`clearing gameweek stats failed: ${error.message}`);
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
  const competitions = selectCompetitions(await loadCompetitions(supabase), args).filter((c) => {
    if (c.code === "PL") throw new Error("Premier League stats come from the FPL feed: npm run ingest:gameweek-stats.");
    if (!ESPN_LEAGUES[c.code]) {
      console.warn(`${c.name}: skipped, no ESPN league for ${c.code}.`);
      return false;
    }
    return true;
  });
  const gameweek = flagValue(args, "gameweek");
  const espn = new Espn();

  try {
    for (const competition of competitions) {
      await ingest(competition, espn, gameweek === undefined ? undefined : Number(gameweek));
    }
  } finally {
    console.log(`Made ${espn.requestsUsed} ESPN requests (the rest came from .cache/espn).`);
  }
}

main().catch((err) => {
  console.error("ESPN stats ingestion failed:", err);
  process.exitCode = 1;
});
