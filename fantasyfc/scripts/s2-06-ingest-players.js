import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

// Polyfill WebSocket for Node < 22 so Supabase doesn't crash on init.
// We don't use realtime features in this script, so an empty class is fine.
if (!globalThis.WebSocket) {
  globalThis.WebSocket = class WebSocket {};
}

/**
 * Provider: football-data.org (Endpoint: /v4/competitions/<code>/teams)
 *
 * Usage:
 *   npm run ingest:players               # Premier League only (as before)
 *   npm run ingest:players -- PD BL1     # named competitions
 *   npm run ingest:players -- --all      # every football-data.org competition
 * The PSL, MLS and J1 come from ESPN instead: npm run ingest:espn-leagues.
 *
 * Pricing Formula:
 * - Positional Floor: GK (4.5), DEF (4.5), MID (5.0), FWD (5.5)
 * - Quality Premium: each league's top clubs (below) add +2.5 to price.
 *
 * This ensures the top 15 most expensive players cost > 100M, while a cheap squad costs < 100M.
 */

// Names as each provider spells them (football-data.org `name`, and
// API-Football for the PSL). Three or more per league keeps enough premium
// players in every position for the 100M cap to bind.
const PREMIUM_CLUBS = [
  // Premier League
  "Arsenal FC",
  "Manchester City FC",
  "Liverpool FC",
  "Chelsea FC",
  "Tottenham Hotspur FC",
  "Manchester United FC",
  // LaLiga
  "Real Madrid CF",
  "FC Barcelona",
  "Club Atlético de Madrid",
  // Bundesliga
  "FC Bayern München",
  "Borussia Dortmund",
  "Bayer 04 Leverkusen",
  // Serie A
  "FC Internazionale Milano",
  "SSC Napoli",
  "Juventus FC",
  "AC Milan",
  // Ligue 1
  "Paris Saint-Germain FC",
  "Olympique de Marseille",
  "AS Monaco FC",
  // Eredivisie
  "AFC Ajax",
  "PSV",
  "Feyenoord Rotterdam",
  // Primeira Liga
  "Sport Lisboa e Benfica",
  "FC Porto",
  "Sporting Clube de Portugal",
  // PSL, MLS and J1 (ESPN names)
  "Mamelodi Sundowns",
  "Orlando Pirates",
  "Kaizer Chiefs",
  "Inter Miami CF",
  "LAFC",
  "LA Galaxy",
  "Columbus Crew",
  "Vissel Kobe",
  "Kashima Antlers",
  "Sanfrecce Hiroshima",
  "Urawa Red Diamonds",
];

// football-data.org says Defence/Midfield/Offence; API-Football (PSL) says
// Defender/Midfielder/Attacker.
export const getPositionEnum = (pos) => {
  if (pos === "Attacker" || pos === "Offence" || pos === "Forward") return "Forward";
  if (pos === "Midfield" || pos === "Midfielder") return "Midfielder";
  if (pos === "Defence" || pos === "Defender") return "Defender";
  if (pos === "Goalkeeper") return "Goalkeeper";
  return "Unknown";
};

export const calculatePrice = (position, teamName, playerId = 0, playerName = "") => {
  let basePrice = 4.5;
  if (position === "Forward") basePrice = 5.5;
  if (position === "Midfielder") basePrice = 5.0;

  let premium = PREMIUM_CLUBS.includes(teamName) ? 2.5 : 0.0;
  
  let variance = 0;
  if (playerId) {
    variance = (playerId % 21) / 10; // 0.0 to 2.0
  }

  let superstarBonus = 0;
  if (playerName) {
    const nameLower = playerName.toLowerCase();
    if (nameLower.includes("haaland") || nameLower.includes("salah") || nameLower.includes("saka") || nameLower.includes("kane") || nameLower.includes("mbappe")) {
      superstarBonus = 3.0;
    }
  }

  return Math.round((basePrice + premium + variance + superstarBonus) * 10) / 10;
};

async function seedCompetition(supabase, competition, apiKey) {
  console.log(`Fetching ${competition.name} players from football-data.org...`);

  const response = await fetch(
    `https://api.football-data.org/v4/competitions/${competition.code}/teams`,
    {
      method: "GET",
      headers: { "X-Auth-Token": apiKey },
    },
  );

  if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

  const data = await response.json();

  // Upsert the clubs first so every player's club_id has a row to point at.
  // A newly promoted club is added here instead of failing the player insert.
  const clubs = data.teams.map((team) => ({
    id: team.id,
    name: team.shortName || team.name,
    short_code: team.tla.trim(),
    competition_id: competition.id,
  }));

  const { error: clubError } = await supabase
    .from("club")
    .upsert(clubs, { onConflict: "id" });

  if (clubError) throw clubError;

  let allPlayers = [];

  data.teams.forEach((team) => {
    team.squad.forEach((player) => {
      const position = getPositionEnum(player.position);
      allPlayers.push({
        id: player.id,
        name: player.name,
        position: position,
        real_team: team.shortName || team.name,
        club_id: team.id,
        competition_id: competition.id,
        price: calculatePrice(position, team.name, player.id, player.name),
      });
    });
  });

  console.log(
    `Found ${allPlayers.length} players. Upserting into Supabase...`,
  );

  const { error } = await supabase
    .from("football_players")
    .upsert(allPlayers, { onConflict: "id" });

  if (error) throw error;
  console.log(`Successfully seeded ${competition.name} players!`);
}

async function seedPlayers() {
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FOOTBALL_API_KEY) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data: competitions, error: compError } = await supabase
      .from("competition")
      .select("id, name, code, data_source");
    if (compError) throw compError;

    const args = process.argv.slice(2);
    const fromFootballData = competitions.filter(
      (c) => c.data_source === "FOOTBALL_DATA",
    );
    const codes = args.filter((a) => !a.startsWith("--")).map((a) => a.toUpperCase());
    const selected = args.includes("--all")
      ? fromFootballData
      : fromFootballData.filter((c) => (codes.length ? codes : ["PL"]).includes(c.code));
    if (selected.length === 0) {
      throw new Error(
        `No football-data.org competition matches ${codes.join(", ")}. ` +
          `Choose from ${fromFootballData.map((c) => c.code).join(", ")}.`,
      );
    }

    for (const [i, competition] of selected.entries()) {
      // The free plan allows 10 requests a minute.
      if (i > 0) await new Promise((r) => setTimeout(r, 7000));
      await seedCompetition(supabase, competition, FOOTBALL_API_KEY);
    }
  } catch (err) {
    console.error("Error seeding players:", err.message);
    process.exit(1);
  }
}

// Only when run as a script: the PSL ingest imports calculatePrice from here.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (process.env.NODE_ENV !== "test" && isMain) {
  seedPlayers();
}
