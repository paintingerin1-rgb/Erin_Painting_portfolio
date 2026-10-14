// S2-08b: ingest per-player, per-gameweek match stats from the FPL feed.
//
// Extends S2-08a's proof of concept from a single printed gameweek into a
// real, idempotent ingestion path: pulls every FINISHED gameweek and upserts
// raw stats into player_gameweek_stats. Points are never written here - they
// are derived on read by the player_gameweek_points view (see the S2-08b
// migration), so a scoring-rule fix never needs a backfill.
//
// Requires SUPABASE_SERVICE_ROLE_KEY in the environment - never commit that
// key. VITE_SUPABASE_URL is reused from .env since it's already public.
//
// Run: npm run ingest:gameweek-stats

import { createClient } from "@supabase/supabase-js";
import { matchFplPlayers, type FplElement } from "./s2-08b-match-players.ts";
import { selectAll } from "./lib/selectAll.ts";

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
  finished: boolean;
}

interface Bootstrap {
  events: BootstrapEvent[];
  elements: FplElement[];
}

interface LiveElementStats {
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

interface LiveElement {
  id: number;
  stats: LiveElementStats;
}

interface LiveEvent {
  elements: LiveElement[];
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`${path} responded ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// See s2-08b-match-players.ts for why identity is resolved by name within a
// club rather than by either provider's numeric id.
async function buildFplToFootballPlayerIdMap(
  fplElements: FplElement[],
): Promise<Map<number, number>> {
  // Premier League players only, paged: with ten leagues football_players
  // is far past the 1,000-row cap, and an unpaged read silently drops rows.
  const [clubsRes, players] = await Promise.all([
    supabase.from("club").select("id, fpl_team_id").not("fpl_team_id", "is", null),
    selectAll<{ id: number; name: string; club_id: number | null }>(
      (from, to) =>
        supabase
          .from("football_players")
          .select("id, name, club_id, competition!inner(code)")
          .eq("competition.code", "PL")
          .order("id")
          .range(from, to),
      "Premier League players",
    ),
  ]);
  if (clubsRes.error) {
    throw new Error(`Could not load club: ${clubsRes.error.message}`);
  }
  if (clubsRes.data.length === 0) {
    throw new Error(
      "No club has an fpl_team_id yet. Run npm run ingest:players, then npm run ingest:fixtures, before this script.",
    );
  }

  const clubByFplTeam = new Map(clubsRes.data.map((c) => [c.fpl_team_id as number, c.id]));
  const { matched, noClub, ambiguous, notFound } = matchFplPlayers(
    fplElements,
    players,
    clubByFplTeam,
  );

  console.log(`Matched ${matched.size}/${fplElements.length} FPL players to football_players.`);
  const report = (label: string, els: FplElement[]) => {
    if (els.length === 0) return;
    const sample = els.slice(0, 10).map((e) => e.web_name).join(", ");
    console.warn(`  ${els.length} ${label}: ${sample}${els.length > 10 ? ", ..." : ""}`);
  };
  report("on an FPL team with no club mapping (set club.fpl_team_id)", noClub);
  report("ambiguous (same name twice at one club)", ambiguous);
  report("not found at their club", notFound);

  return matched;
}

async function main() {
  const bootstrap = await fetchJson<Bootstrap>("/bootstrap-static/");
  const finished = bootstrap.events.filter((e) => e.finished);
  const fplIdToPlayerId = await buildFplToFootballPlayerIdMap(bootstrap.elements);

  let totalRows = 0;
  let totalSkipped = 0;
  for (const gw of finished) {
    const live = await fetchJson<LiveEvent>(`/event/${gw.id}/live/`);

    // Players with 0 minutes didn't play - skip them rather than writing a
    // row of zeros for the entire player pool every single gameweek.
    // Players we couldn't resolve to a football_players row are skipped too
    // (logged, not silently dropped) rather than inserted under the wrong id.
    let skippedThisGw = 0;
    const rows = live.elements
      .filter((e) => e.stats.minutes > 0)
      .flatMap((e) => {
        const playerId = fplIdToPlayerId.get(e.id);
        if (playerId === undefined) {
          skippedThisGw++;
          return [];
        }
        return [
          {
            player_id: playerId,
            gameweek_id: gw.id,
            minutes: e.stats.minutes,
            goals_scored: e.stats.goals_scored,
            assists: e.stats.assists,
            clean_sheets: e.stats.clean_sheets,
            goals_conceded: e.stats.goals_conceded,
            own_goals: e.stats.own_goals,
            penalties_saved: e.stats.penalties_saved,
            penalties_missed: e.stats.penalties_missed,
            yellow_cards: e.stats.yellow_cards,
            red_cards: e.stats.red_cards,
            saves: e.stats.saves,
            bonus: e.stats.bonus,
            defensive_contribution: e.stats.defensive_contribution,
          },
        ];
      });

    // Upsert in chunks - a full gameweek is ~300-400 players with minutes.
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("player_gameweek_stats")
        .upsert(chunk, { onConflict: "player_id,gameweek_id" });
      if (error) {
        throw new Error(`gameweek ${gw.id} stats upsert failed: ${error.message}`);
      }
    }

    console.log(
      `Gameweek ${gw.id}: upserted ${rows.length} player rows` +
        (skippedThisGw > 0 ? `, skipped ${skippedThisGw} unresolved players.` : "."),
    );
    totalRows += rows.length;
    totalSkipped += skippedThisGw;
  }

  console.log(
    `Done. ${finished.length} finished gameweeks, ${totalRows} rows total, ${totalSkipped} rows skipped for unresolved players.`,
  );
}

main().catch((err) => {
  console.error("Gameweek stats ingestion failed:", err);
  process.exitCode = 1;
});
