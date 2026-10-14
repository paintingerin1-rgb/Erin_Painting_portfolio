// #45: clubs, squads, fixtures and gameweeks from ESPN for the leagues whose
// competition.data_source is ESPN: the PSL, MLS and the J1 League.
//
// For the PSL this replaces the API-Football squads load from #44: a free
// API-Football key can't read the current season, so its club list was
// stuck on 2024/25 and there were no fixtures. ESPN has all of it for free
// (unofficial API; see scripts/lib/espn.ts). Per league: the team list, then
// each club's roster and two schedule lists, cached for the day (about 50
// requests for the PSL, 90 for MLS).
//
// Gameweeks are calendar weeks in the league's local time (weeklyMatchdays):
// ESPN has no round numbers, and matches are spread across midweeks and
// weekends.
//
// Rows left from an earlier load that are no longer in the league (the
// 2024/25 API-Football clubs, departed players) are removed, unless a squad
// has drafted the player or a fixture still points at the club.
//
// Safety: if a reload would drop more than a quarter of a league's stored
// fixtures, ESPN's response no longer looks like the season we have (e.g. a
// relabelled season picked as the wrong stage). The loader then leaves that
// league's fixtures, gameweeks and points untouched and says so; pass
// --force once you've checked it's right. Gameweeks that hold points are
// never deleted without --force either.
//
// Run: npm run ingest:espn-leagues -- --all   (or codes: -- PSL MLS J1)
// then npm run ingest:espn-stats -- PSL MLS J1

import { createClient } from "@supabase/supabase-js";
import { calculatePrice, getPositionEnum } from "./s2-06-ingest-players.js";
import {
  buildGameweeks,
  gameweekId,
  loadCompetitions,
  upsertGameweeks,
  type Competition,
} from "./lib/competitions.ts";
import { shortCodes } from "./lib/apiFootball.ts";
import {
  currentSeasonOnly,
  Espn,
  ESPN_LEAGUES,
  fixtureLoss,
  fixturesFromSchedules,
  fromEspnFixtureId,
  fromEspnId,
  WEEK_UTC_OFFSET_HOURS,
  weeklyMatchdays,
  type EspnRosterResponse,
  type EspnScheduleResponse,
  type EspnTeamsResponse,
} from "./lib/espn.ts";
import { selectAll } from "./lib/selectAll.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script.",
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function ingest(league: Competition, espn: Espn, force: boolean) {
  const slug = ESPN_LEAGUES[league.code];
  if (!slug) throw new Error(`No ESPN league for ${league.code}.`);
  const requestsBefore = espn.requestsUsed;

  // Clubs.
  const teams = (await espn.get<EspnTeamsResponse>(`/${slug}/teams`, "today")).sports[0].leagues[0].teams.map(
    (t) => t.team,
  );
  if (teams.length === 0) throw new Error(`ESPN returned no ${league.code} teams.`);
  const codes = shortCodes(
    teams.map((t) => ({ id: Number(t.id), name: t.displayName, code: t.abbreviation?.slice(0, 3) ?? null })),
  );
  const clubs = teams.map((t) => ({
    id: fromEspnId(t.id),
    name: t.displayName,
    short_code: codes.get(Number(t.id)),
    competition_id: league.id,
  }));
  // Clubs from an earlier load (the 2024/25 API-Football list) can hold the
  // same three-letter codes, which are unique per league. Park theirs on a
  // code derived from the id; removeStale() deletes them afterwards.
  const newIds = new Set(clubs.map((c) => c.id));
  const { data: existing, error: existingError } = await supabase
    .from("club")
    .select("id")
    .eq("competition_id", league.id);
  if (existingError) throw new Error(`club lookup failed: ${existingError.message}`);
  for (const old of (existing ?? []).filter((c) => !newIds.has(c.id))) {
    const { error } = await supabase.from("club").update({ short_code: `~${old.id}` }).eq("id", old.id);
    if (error) throw new Error(`parking club ${old.id} failed: ${error.message}`);
  }

  const { error: clubError } = await supabase.from("club").upsert(clubs, { onConflict: "id" });
  if (clubError) throw new Error(`club upsert failed: ${clubError.message}`);

  // Squads. A player listed by two clubs (mid-transfer) is written once.
  const players = new Map<number, Record<string, unknown>>();
  const schedules: EspnScheduleResponse[] = [];
  for (const team of teams) {
    const roster = await espn.get<EspnRosterResponse>(`/${slug}/teams/${team.id}/roster`, "today");
    for (const a of roster.athletes ?? []) {
      const position = getPositionEnum(a.position?.name ?? null);
      players.set(Number(a.id), {
        id: fromEspnId(a.id),
        name: a.displayName,
        position,
        real_team: team.displayName,
        club_id: fromEspnId(team.id),
        competition_id: league.id,
        price: calculatePrice(position, team.displayName, Number(a.id), a.displayName),
      });
    }
    // Past results and upcoming fixtures are two separate lists.
    schedules.push(await espn.get<EspnScheduleResponse>(`/${slug}/teams/${team.id}/schedule`, "today"));
    schedules.push(await espn.get<EspnScheduleResponse>(`/${slug}/teams/${team.id}/schedule?fixture=true`, "today"));
  }
  const playerRows = [...players.values()];
  for (let i = 0; i < playerRows.length; i += 200) {
    const { error } = await supabase
      .from("football_players")
      .upsert(playerRows.slice(i, i + 200), { onConflict: "id" });
    if (error) throw new Error(`football_players upsert failed: ${error.message}`);
  }

  // Fixtures and gameweeks.
  const clubIds = new Set(clubs.map((c) => c.id));
  const espnFixtures = currentSeasonOnly(fixturesFromSchedules(schedules)).filter(
    (f) => clubIds.has(fromEspnId(f.home)) && clubIds.has(fromEspnId(f.away)),
  );
  const matchdayOf = weeklyMatchdays(
    espnFixtures.map((f) => f.kickoff),
    WEEK_UTC_OFFSET_HOURS[league.code] ?? 0,
  );
  const gameweeks = buildGameweeks(
    league,
    espnFixtures.map((f) => ({ matchday: matchdayOf.get(f.kickoff) ?? null, kickoff: f.kickoff })),
  );
  // Refuse a reload that would wipe out much of the stored schedule.
  const stored = await selectAll<{ id: number }>(
    (from, to) => supabase.from("fixture").select("id").eq("competition_id", league.id).order("id").range(from, to),
    `${league.code} fixtures`,
  );
  const loss = fixtureLoss(
    stored.map((f) => f.id),
    new Set(espnFixtures.map((f) => fromEspnFixtureId(f.id))),
  );
  if (loss.tooMany && !force) {
    console.warn(
      `${league.name}: NOT updating fixtures or gameweeks. This run would drop ${loss.lost.length} of ` +
        `${stored.length} stored fixtures (${Math.round(loss.share * 100)}%), which usually means ESPN's season ` +
        "data changed shape. Clubs and squads were updated. Check ESPN, then re-run with --force if it's right.",
    );
    await removeStale(league, new Set(playerRows.map((p) => p.id as number)), clubIds);
    return;
  }

  await upsertGameweeks(supabase, league.id, gameweeks);

  const scores = new Map<number, { home: number | null; away: number | null }>();
  for (const s of schedules) {
    for (const e of s.events ?? []) {
      const c = e.competitions[0] as unknown as {
        competitors: { homeAway: string; score?: { value?: number } | string }[];
      };
      const score = (side: string) => {
        const raw = c.competitors.find((x) => x.homeAway === side)?.score;
        const value = typeof raw === "string" ? Number(raw) : raw?.value;
        return value === undefined || Number.isNaN(value) ? null : value;
      };
      scores.set(Number(e.id), { home: score("home"), away: score("away") });
    }
  }

  const fixtureRows = espnFixtures.map((f) => {
    const s = f.completed ? scores.get(f.id) : undefined;
    return {
      id: fromEspnFixtureId(f.id),
      competition_id: league.id,
      gameweek_id: gameweekId(league, matchdayOf.get(f.kickoff) as number),
      home_club_id: fromEspnId(f.home),
      away_club_id: fromEspnId(f.away),
      kickoff_at: f.kickoff,
      home_score: s?.home ?? null,
      away_score: s?.away ?? null,
      status: f.completed ? "COMPLETED" : "UPCOMING",
    };
  });
  for (let i = 0; i < fixtureRows.length; i += 100) {
    const { error } = await supabase.from("fixture").upsert(fixtureRows.slice(i, i + 100));
    if (error) throw new Error(`fixture upsert failed: ${error.message}`);
  }

  await removeStaleSchedule(
    league,
    new Set(fixtureRows.map((f) => f.id)),
    new Set(gameweeks.map((g) => g.id)),
    force,
  );
  await removeStale(league, new Set(playerRows.map((p) => p.id as number)), clubIds);

  const current = gameweeks.find((g) => g.is_current);
  console.log(
    `${league.name}: ${clubs.length} clubs, ${playerRows.length} players, ${fixtureRows.length} fixtures, ` +
      `${gameweeks.length} gameweeks (current: ${current?.number ?? "none yet"}). ` +
      `${espn.requestsUsed - requestsBefore} ESPN requests.`,
  );
}

async function main() {
  const args = process.argv.slice(2);
  const fromEspn = (await loadCompetitions(supabase)).filter((c) => c.data_source === "ESPN");
  const codes = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
  if (!args.includes("--all") && codes.length === 0) {
    throw new Error(`Name the leagues to load (${fromEspn.map((c) => c.code).join(", ")}) or pass --all.`);
  }
  const selected = args.includes("--all") ? fromEspn : fromEspn.filter((c) => codes.includes(c.code));
  const unknown = codes.filter((code) => !fromEspn.some((c) => c.code === code));
  if (unknown.length > 0) {
    throw new Error(`${unknown.join(", ")} isn't an ESPN league. Choose from ${fromEspn.map((c) => c.code).join(", ")}.`);
  }

  const espn = new Espn();
  for (const competition of selected) await ingest(competition, espn, args.includes("--force"));
}

/**
 * Drops a league's fixtures and gameweeks that are no longer in its season
 * (a match ESPN dropped, or a week that emptied). Gameweek numbers are stable
 * (weeklyMatchdays), and a finished match never moves, so a gameweek holding
 * points shouldn't go stale; if one does, it's kept with a warning unless
 * `force` is set.
 */
async function removeStaleSchedule(
  competition: Competition,
  keepFixtures: Set<number>,
  keepGameweeks: Set<number>,
  force: boolean,
) {
  const [fixtures, { data: gameweeks, error: gErr }] = await Promise.all([
    selectAll<{ id: number }>(
      (from, to) =>
        supabase.from("fixture").select("id").eq("competition_id", competition.id).order("id").range(from, to),
      `${competition.code} fixtures`,
    ),
    supabase.from("gameweek").select("id").eq("competition_id", competition.id),
  ]);
  if (gErr) throw new Error(`schedule check failed: ${gErr.message}`);

  const staleFixtures = fixtures.map((f) => f.id).filter((id) => !keepFixtures.has(id));
  for (let i = 0; i < staleFixtures.length; i += 200) {
    const { error } = await supabase.from("fixture").delete().in("id", staleFixtures.slice(i, i + 200));
    if (error) throw new Error(`removing old fixtures failed: ${error.message}`);
  }

  let staleGameweeks = (gameweeks ?? []).map((g) => g.id).filter((id) => !keepGameweeks.has(id));
  if (!force) {
    const scored: number[] = [];
    for (const id of staleGameweeks) {
      const { count, error } = await supabase
        .from("player_gameweek_stats")
        .select("player_id", { count: "exact", head: true })
        .eq("gameweek_id", id);
      if (error) throw new Error(`gameweek ${id} stats check failed: ${error.message}`);
      if ((count ?? 0) > 0) scored.push(id);
    }
    if (scored.length > 0) {
      console.warn(
        `  Kept ${scored.length} gameweeks that no longer have fixtures but hold points (ids ${scored.join(", ")}). ` +
          "Re-run with --force to remove them and their points.",
      );
      staleGameweeks = staleGameweeks.filter((id) => !scored.includes(id));
    }
  }
  if (staleGameweeks.length > 0) {
    const { error: sErr } = await supabase.from("player_gameweek_stats").delete().in("gameweek_id", staleGameweeks);
    if (sErr) throw new Error(`removing old gameweek stats failed: ${sErr.message}`);
    const { error } = await supabase.from("gameweek").delete().in("id", staleGameweeks);
    if (error) throw new Error(`removing old gameweeks failed: ${error.message}`);
  }
  if (staleFixtures.length || staleGameweeks.length) {
    console.log(`  Removed ${staleFixtures.length} fixtures and ${staleGameweeks.length} gameweeks outside the current season.`);
  }
}

/** Drops a league's players and clubs that are no longer in it, where safe. */
async function removeStale(competition: Competition, keepPlayers: Set<number>, keepClubs: Set<number>) {
  const competitionId = competition.id;
  // Both paged: an unpaged read stops at 1,000 rows, and a drafted player
  // missing from the second list would look safe to delete.
  const [stalePlayers, drafted] = await Promise.all([
    selectAll<{ id: number }>(
      (from, to) =>
        supabase.from("football_players").select("id").eq("competition_id", competitionId).order("id").range(from, to),
      `${competition.code} players`,
    ),
    selectAll<{ player_id: number }>(
      (from, to) =>
        supabase
          .from("drafted_players")
          .select("player_id, football_players!inner(competition_id)")
          .eq("football_players.competition_id", competitionId)
          .order("player_id")
          .order("team_id")
          .range(from, to),
      `${competition.code} drafted players`,
    ),
  ]);
  const draftedIds = new Set(drafted.map((d) => d.player_id));
  const removable = stalePlayers.map((p) => p.id).filter((id) => !keepPlayers.has(id) && !draftedIds.has(id));
  for (let i = 0; i < removable.length; i += 200) {
    const { error } = await supabase.from("football_players").delete().in("id", removable.slice(i, i + 200));
    // e.g. match stats still point at them; they stay, which is harmless.
    if (error) console.warn(`  Couldn't remove some departed players: ${error.message}`);
  }

  const { data: oldClubs, error: cErr } = await supabase.from("club").select("id, name").eq("competition_id", competitionId);
  if (cErr) throw new Error(`club lookup failed: ${cErr.message}`);
  let removedClubs = 0;
  for (const club of (oldClubs ?? []).filter((c) => !keepClubs.has(c.id))) {
    // Fails (and is kept) while drafted players or fixtures still point at it.
    const { error } = await supabase.from("club").delete().eq("id", club.id);
    if (error) console.warn(`  Kept ${club.name}: ${error.message}`);
    else removedClubs++;
  }
  if (removable.length || removedClubs) {
    console.log(`  Removed ${removable.length} players and ${removedClubs} clubs no longer in ${competition.name}.`);
  }
}

main().catch((err) => {
  console.error("ESPN league ingestion failed:", err);
  process.exitCode = 1;
});
