// S2-08a proof-of-concept: pull one real gameweek of match stats for every
// player from the official Fantasy Premier League API and print them.
//
// Provider: fantasy.premierleague.com/api (unofficial, free, no auth/key).
// Endpoints used:
//   GET /bootstrap-static/   - players, teams, positions, gameweek list
//   GET /event/{id}/live/    - per-player stats for one finished gameweek
//
// This is read-only and prints to stdout; it writes nothing to Supabase.
// It exists to prove the feed works end to end before S2-08b builds the
// scoring engine and ingestion script on top of it.
//
// Run: npm run poc:fpl-stats

const API_BASE = "https://fantasy.premierleague.com/api";
// The FPL site rejects requests with no User-Agent.
const HEADERS = { "User-Agent": "Mozilla/5.0" };

interface BootstrapEvent {
  id: number;
  name: string;
  finished: boolean;
}

interface BootstrapElement {
  id: number;
  web_name: string;
  team: number;
  element_type: number;
}

interface BootstrapTeam {
  id: number;
  short_name: string;
}

interface BootstrapElementType {
  id: number;
  singular_name_short: string;
}

interface Bootstrap {
  events: BootstrapEvent[];
  elements: BootstrapElement[];
  teams: BootstrapTeam[];
  element_types: BootstrapElementType[];
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
  bps: number;
  clearances_blocks_interceptions: number;
  recoveries: number;
  tackles: number;
  defensive_contribution: number;
  total_points: number;
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

async function main() {
  const bootstrap = await fetchJson<Bootstrap>("/bootstrap-static/");

  const finishedGameweeks = bootstrap.events.filter((e) => e.finished);
  const targetGameweek = finishedGameweeks.at(-1);
  if (!targetGameweek) {
    throw new Error("No finished gameweeks yet this season - nothing to pull.");
  }

  const teamsById = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const positionsById = new Map(
    bootstrap.element_types.map((p) => [p.id, p.singular_name_short]),
  );
  const playersById = new Map(bootstrap.elements.map((p) => [p.id, p]));

  const live = await fetchJson<LiveEvent>(`/event/${targetGameweek.id}/live/`);

  const played = live.elements.filter((e) => e.stats.minutes > 0);

  console.log(
    `${targetGameweek.name} (id ${targetGameweek.id}): ${live.elements.length} players in feed, ${played.length} with minutes played.\n`,
  );

  const header = [
    "player",
    "team",
    "pos",
    "min",
    "gls",
    "ast",
    "cs",
    "gc",
    "sv",
    "og",
    "pens",
    "yc",
    "rc",
    "cbi",
    "rec",
    "tkl",
    "defcon",
    "bonus",
    "bps",
    "pts",
  ];
  console.log(header.join("\t"));

  for (const el of played) {
    const player = playersById.get(el.id);
    if (!player) continue;
    const s = el.stats;
    console.log(
      [
        player.web_name,
        teamsById.get(player.team) ?? "?",
        positionsById.get(player.element_type) ?? "?",
        s.minutes,
        s.goals_scored,
        s.assists,
        s.clean_sheets,
        s.goals_conceded,
        s.saves,
        s.own_goals,
        s.penalties_saved + s.penalties_missed,
        s.yellow_cards,
        s.red_cards,
        s.clearances_blocks_interceptions,
        s.recoveries,
        s.tackles,
        s.defensive_contribution,
        s.bonus,
        s.bps,
        s.total_points,
      ].join("\t"),
    );
  }

  // `defensive_contribution` is the raw CBIT/CBIRT count, not a "crossed the
  // threshold" flag - verified against live data: DEF total is
  // clearances_blocks_interceptions + tackles (threshold 10), MID/FWD adds
  // recoveries too (threshold 12). The +2 scoring points aren't a separate
  // field; S2-08b's fpl_points() has to apply the threshold itself.
  const withBonus = played.filter((e) => e.stats.bonus > 0).length;
  const crossedThreshold = played.filter((e) => {
    const player = playersById.get(e.id);
    const pos = player && positionsById.get(player.element_type);
    if (pos === "DEF") return e.stats.defensive_contribution >= 10;
    if (pos === "MID" || pos === "FWD") return e.stats.defensive_contribution >= 12;
    return false;
  }).length;
  console.log(
    `\n${withBonus} players earned bonus. ${crossedThreshold} crossed the defensive contribution threshold (DEF >=10 CBIT, MID/FWD >=12 CBIRT) - both bonus and the raw CBIT/CBIRT count came straight from the feed, no derivation needed for the inputs; the threshold check itself is ours to apply.`,
  );
}

main().catch((err) => {
  console.error("PoC pull failed:", err);
  process.exitCode = 1;
});
