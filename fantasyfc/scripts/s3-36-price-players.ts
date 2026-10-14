// S3-07 (#36): reprice every player so prices vary and reflect status.
// The rules live in scripts/lib/pricing.ts; this script loads the data,
// prints what would change, and only writes with --apply.
//
// Run after the player and stats ingests, since those reset or feed prices:
//   node --env-file=.env --env-file=.env.ingest scripts/s3-36-price-players.ts
//   ... add --apply to write football_players.price (default is a dry run)
//
// Safe for squads already drafted: drafted_players keeps each pick's
// draft_price, and release_player refunds that, so no budget moves.
//
// Needs VITE_SUPABASE_URL (.env) and SUPABASE_SERVICE_ROLE_KEY (.env.ingest).

import { createClient } from "@supabase/supabase-js";
import { matchFplPlayers, type FplElement } from "./s2-08b-match-players.ts";
import { selectAll } from "./lib/selectAll.ts";
import {
  POSITIONS,
  clubForm,
  priceByStatus,
  type CompletedFixture,
  type Position,
  type PricedPlayer,
} from "./lib/pricing.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment before running this script.",
  );
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
// --show=Kane,Mbappé prints those players' old and new prices.
const SHOW = (process.argv.find((a) => a.startsWith("--show="))?.slice(7) ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// FPL's element_type ids.
const FPL_POSITION: Record<number, Position> = {
  1: "Goalkeeper",
  2: "Defender",
  3: "Midfielder",
  4: "Forward",
};

interface FplBootstrapElement extends FplElement {
  element_type: number;
  now_cost: number;
}

async function loadFpl(): Promise<FplBootstrapElement[]> {
  const res = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
    headers: { "User-Agent": "Mozilla/5.0" }, // FPL rejects requests without one
  });
  if (!res.ok) throw new Error(`FPL bootstrap-static responded ${res.status}`);
  return ((await res.json()) as { elements: FplBootstrapElement[] }).elements;
}

async function main() {
  const [fpl, players, points, fixtures, competitions, clubs] = await Promise.all([
    loadFpl(),
    selectAll<{
      id: number;
      name: string;
      position: string;
      club_id: number | null;
      competition_id: number;
      price: number;
    }>(
      (from, to) =>
        supabase
          .from("football_players")
          .select("id, name, position, club_id, competition_id, price")
          .order("id")
          .range(from, to),
      "players",
    ),
    selectAll<{ player_id: number; gameweek_id: number; points: number }>(
      (from, to) =>
        supabase
          .from("player_gameweek_points")
          .select("player_id, gameweek_id, points")
          .order("player_id")
          .order("gameweek_id")
          .range(from, to),
      "player points",
    ),
    selectAll<CompletedFixture & { id: number }>(
      (from, to) =>
        supabase
          .from("fixture")
          .select("id, home_club_id, away_club_id, home_score, away_score")
          .eq("status", "COMPLETED")
          .order("id")
          .range(from, to),
      "completed fixtures",
    ),
    supabase.from("competition").select("id, code").order("id"),
    supabase.from("club").select("id, fpl_team_id").not("fpl_team_id", "is", null),
  ]);
  if (competitions.error) throw new Error(competitions.error.message);
  if (clubs.error) throw new Error(clubs.error.message);

  // FPL's real price spread per position, the template for every league.
  const templates = Object.fromEntries(
    POSITIONS.map((pos) => [
      pos,
      fpl
        .filter((e) => FPL_POSITION[e.element_type] === pos)
        .map((e) => e.now_cost / 10)
        .sort((a, b) => a - b),
    ]),
  ) as Record<Position, number[]>;

  // Premier League players FPL lists keep FPL's own price.
  const plId = competitions.data.find((c) => c.code === "PL")?.id;
  const plPlayers = players.filter((p) => p.competition_id === plId);
  const { matched } = matchFplPlayers(
    fpl,
    plPlayers,
    new Map(clubs.data.map((c) => [c.fpl_team_id as number, c.id])),
  );
  const costByElement = new Map(fpl.map((e) => [e.id, e.now_cost / 10]));
  const fixed = new Map([...matched].map(([el, playerId]) => [playerId, costByElement.get(el)!]));

  const seasonPoints = new Map<number, number>();
  for (const row of points) {
    seasonPoints.set(row.player_id, (seasonPoints.get(row.player_id) ?? 0) + row.points);
  }

  const priced: PricedPlayer[] = players.map((p) => ({
    id: p.id,
    competitionId: p.competition_id,
    position: p.position,
    clubId: p.club_id,
    points: seasonPoints.get(p.id) ?? 0,
  }));
  const prices = priceByStatus(priced, clubForm(fixtures), templates, fixed);

  // Summary per competition, before and after.
  const codeById = new Map(competitions.data.map((c) => [c.id, c.code]));
  console.log(`FPL prices for ${fixed.size}/${plPlayers.length} Premier League players; the rest by rank.\n`);
  console.log("league  players  distinct before -> after  min  median  max   top three");
  for (const c of competitions.data) {
    const league = players.filter((p) => p.competition_id === c.id && prices.has(p.id));
    if (league.length === 0) continue;
    const after = league.map((p) => prices.get(p.id)!).sort((a, b) => a - b);
    const top = [...league]
      .sort((a, b) => prices.get(b.id)! - prices.get(a.id)!)
      .slice(0, 3)
      .map((p) => `${p.name} £${prices.get(p.id)}m`)
      .join(", ");
    console.log(
      `${c.code.padEnd(6)}  ${String(league.length).padStart(7)}  ` +
        `${String(new Set(league.map((p) => p.price)).size).padStart(15)} -> ${String(new Set(after).size).padEnd(5)}  ` +
        `${after[0].toFixed(1)}  ${after[Math.floor(after.length / 2)].toFixed(1).padStart(6)}  ` +
        `${after[after.length - 1].toFixed(1).padStart(4)}   ${top}`,
    );
  }

  for (const name of SHOW) {
    for (const p of players.filter((p) => p.name.toLowerCase().includes(name))) {
      console.log(
        `  ${p.name} (${codeById.get(p.competition_id)}, ${p.position}, ` +
          `${seasonPoints.get(p.id) ?? 0} pts): £${p.price}m -> £${prices.get(p.id) ?? "-"}m`,
      );
    }
  }

  const changes = players.filter((p) => prices.has(p.id) && prices.get(p.id) !== Number(p.price));
  const skipped = players.length - prices.size;
  console.log(`\n${changes.length} prices would change${skipped ? `, ${skipped} players skipped (unknown position)` : ""}.`);
  if (!APPLY) {
    console.log("Dry run: nothing written. Re-run with --apply to write.");
    return;
  }

  // One update per changed player, a few at a time.
  let done = 0;
  for (let i = 0; i < changes.length; i += 25) {
    await Promise.all(
      changes.slice(i, i + 25).map(async (p) => {
        const { error } = await supabase
          .from("football_players")
          .update({ price: prices.get(p.id) })
          .eq("id", p.id);
        if (error) throw new Error(`Could not update ${p.name}: ${error.message}`);
      }),
    );
    done += Math.min(25, changes.length - i);
  }
  console.log(`Updated ${done} prices.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
