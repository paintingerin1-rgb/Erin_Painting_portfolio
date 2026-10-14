// Sample data for the portfolio demo.
//
// The production app reads all of this from Supabase (Postgres), filled by
// ingestion scripts that pull from football-data.org, the ESPN API and the
// official Fantasy Premier League feed. This file stands in for the database
// so the demo runs anywhere with no backend, keys or setup.

import type { PlayerPosition } from "../features/players/playersApi";

export interface SampleCompetition {
  id: number;
  name: string;
  code: string;
  country: string | null;
}

export const COMPETITIONS: SampleCompetition[] = [
  { id: 1, name: "Premier League", code: "PL", country: "England" },
  { id: 2, name: "LaLiga", code: "PD", country: "Spain" },
  { id: 3, name: "Bundesliga", code: "BL1", country: "Germany" },
  { id: 4, name: "Serie A", code: "SA", country: "Italy" },
  { id: 5, name: "Ligue 1", code: "FL1", country: "France" },
  { id: 6, name: "Eredivisie", code: "DED", country: "Netherlands" },
  { id: 7, name: "Primeira Liga", code: "PPL", country: "Portugal" },
  { id: 8, name: "Betway Premiership", code: "PSL", country: "South Africa" },
  { id: 9, name: "MLS", code: "MLS", country: "USA" },
  { id: 10, name: "J1 League", code: "J1", country: "Japan" },
];

type P = [name: string, club: string, position: PlayerPosition, price: number];

// Prices follow the shape of the production formula: a positional floor,
// lifted by player status, with variance so players aren't priced in flat
// tiers (the Sprint 2 feedback this fixed).
const BY_COMPETITION: Record<number, P[]> = {
  1: [
    ["Erling Haaland", "Man City", "Forward", 14.5],
    ["Mohamed Salah", "Liverpool", "Midfielder", 13.5],
    ["Bukayo Saka", "Arsenal", "Midfielder", 10.5],
    ["Cole Palmer", "Chelsea", "Midfielder", 10.5],
    ["Alexander Isak", "Liverpool", "Forward", 10.5],
    ["Bruno Fernandes", "Man United", "Midfielder", 9.0],
    ["Phil Foden", "Man City", "Midfielder", 8.5],
    ["Ollie Watkins", "Aston Villa", "Forward", 9.0],
    ["Martin Ødegaard", "Arsenal", "Midfielder", 8.5],
    ["Jarrod Bowen", "West Ham", "Midfielder", 8.0],
    ["Bryan Mbeumo", "Man United", "Midfielder", 8.0],
    ["Chris Wood", "Nott'm Forest", "Forward", 7.5],
    ["Yoane Wissa", "Newcastle", "Forward", 7.5],
    ["Jean-Philippe Mateta", "Crystal Palace", "Forward", 7.5],
    ["Morgan Rogers", "Aston Villa", "Midfielder", 7.0],
    ["Eberechi Eze", "Arsenal", "Midfielder", 7.5],
    ["Dominic Calvert-Lewin", "Leeds", "Forward", 5.5],
    ["Joelinton", "Newcastle", "Midfielder", 5.5],
    ["Youri Tielemans", "Aston Villa", "Midfielder", 5.5],
    ["Emiliano Buendía", "Aston Villa", "Midfielder", 5.5],
    ["Brian Brobbey", "Sunderland", "Forward", 5.5],
    ["Stefanos Kostoulas", "Brighton", "Forward", 4.5],
    ["Virgil van Dijk", "Liverpool", "Defender", 6.0],
    ["William Saliba", "Arsenal", "Defender", 6.0],
    ["Gabriel Magalhães", "Arsenal", "Defender", 6.0],
    ["Josko Gvardiol", "Man City", "Defender", 6.0],
    ["Pedro Porro", "Tottenham", "Defender", 5.5],
    ["Lewis Hall", "Newcastle", "Defender", 5.0],
    ["Rico Henry", "Brentford", "Defender", 4.5],
    ["Kristoffer Ajer", "Brentford", "Defender", 4.5],
    ["Jay Dasilva", "Coventry", "Defender", 4.0],
    ["Kristoffer Schuster", "Brentford", "Defender", 4.5],
    ["Diogo Dalot", "Man United", "Defender", 5.0],
    ["Reece James", "Chelsea", "Defender", 5.5],
    ["Rúben Dias", "Man City", "Defender", 5.5],
    ["Marc Guéhi", "Crystal Palace", "Defender", 5.0],
    ["David Raya", "Arsenal", "Goalkeeper", 5.5],
    ["Alisson", "Liverpool", "Goalkeeper", 5.5],
    ["Jordan Pickford", "Everton", "Goalkeeper", 5.0],
    ["Robert Sánchez", "Chelsea", "Goalkeeper", 5.0],
    ["Nick Pope", "Newcastle", "Goalkeeper", 5.0],
    ["Carl Rushworth", "Coventry", "Goalkeeper", 4.0],
    ["James Trafford", "Leeds", "Goalkeeper", 4.5],
    ["Matz Sels", "Nott'm Forest", "Goalkeeper", 4.5],
    ["Mark Flekken", "Brentford", "Goalkeeper", 4.5],
    ["Bernd Leno", "Fulham", "Goalkeeper", 4.5],
    ["Antoine Semenyo", "Bournemouth", "Midfielder", 7.0],
    ["Dejan Kulusevski", "Tottenham", "Midfielder", 7.0],
    ["Matheus Cunha", "Man United", "Forward", 7.5],
    ["Kai Havertz", "Arsenal", "Forward", 8.0],
  ],
  2: [
    ["Kylian Mbappé", "Real Madrid", "Forward", 14.0],
    ["Lamine Yamal", "Barcelona", "Midfielder", 12.5],
    ["Robert Lewandowski", "Barcelona", "Forward", 10.0],
    ["Vinícius Júnior", "Real Madrid", "Forward", 11.5],
    ["Pedri", "Barcelona", "Midfielder", 8.5],
    ["Antoine Griezmann", "Atlético Madrid", "Forward", 8.0],
    ["Jules Koundé", "Barcelona", "Defender", 5.5],
    ["Thibaut Courtois", "Real Madrid", "Goalkeeper", 5.5],
  ],
  3: [
    ["Harry Kane", "Bayern Munich", "Forward", 14.0],
    ["Jamal Musiala", "Bayern Munich", "Midfielder", 10.5],
    ["Florian Wirtz", "Leverkusen", "Midfielder", 10.0],
    ["Serhou Guirassy", "Dortmund", "Forward", 9.0],
    ["Joshua Kimmich", "Bayern Munich", "Defender", 6.5],
    ["Gregor Kobel", "Dortmund", "Goalkeeper", 5.5],
  ],
  4: [
    ["Lautaro Martínez", "Inter", "Forward", 11.0],
    ["Rafael Leão", "AC Milan", "Forward", 9.5],
    ["Nicolò Barella", "Inter", "Midfielder", 8.0],
    ["Alessandro Bastoni", "Inter", "Defender", 6.0],
    ["Mike Maignan", "AC Milan", "Goalkeeper", 5.5],
  ],
  5: [
    ["Ousmane Dembélé", "PSG", "Forward", 12.0],
    ["Vitinha", "PSG", "Midfielder", 8.0],
    ["Achraf Hakimi", "PSG", "Defender", 6.5],
    ["Gianluigi Donnarumma", "PSG", "Goalkeeper", 5.5],
  ],
  6: [
    ["Luuk de Jong", "PSV", "Forward", 7.5],
    ["Ismael Saibari", "PSV", "Midfielder", 6.5],
    ["Jorrel Hato", "Ajax", "Defender", 5.0],
  ],
  7: [
    ["Viktor Gyökeres", "Sporting CP", "Forward", 11.0],
    ["Vangelis Pavlidis", "Benfica", "Forward", 8.5],
    ["Otamendi", "Benfica", "Defender", 5.0],
  ],
  8: [
    ["Iqraam Rayners", "Mamelodi Sundowns", "Forward", 8.0],
    ["Relebohile Mofokeng", "Orlando Pirates", "Midfielder", 7.5],
    ["Teboho Mokoena", "Mamelodi Sundowns", "Midfielder", 7.0],
    ["Ronwen Williams", "Mamelodi Sundowns", "Goalkeeper", 5.5],
    ["Aubrey Modiba", "Mamelodi Sundowns", "Defender", 5.0],
  ],
  9: [
    ["Lionel Messi", "Inter Miami", "Forward", 13.0],
    ["Denis Bouanga", "LAFC", "Forward", 9.0],
    ["Luis Suárez", "Inter Miami", "Forward", 8.0],
    ["Brad Guzan", "Atlanta United", "Goalkeeper", 4.5],
  ],
  10: [
    ["Yuki Soma", "Machida Zelvia", "Midfielder", 7.0],
    ["Anderson Lopes", "Yokohama F. Marinos", "Forward", 8.0],
    ["Shuichi Gonda", "Vissel Kobe", "Goalkeeper", 4.5],
  ],
};

export interface SamplePlayer {
  id: number;
  competitionId: number;
  name: string;
  position: PlayerPosition;
  real_team: string;
  price: number;
}

export const PLAYERS: SamplePlayer[] = Object.entries(BY_COMPETITION).flatMap(
  ([competitionId, rows]) =>
    rows.map(([name, club, position, price], i) => ({
      id: Number(competitionId) * 1000 + i,
      competitionId: Number(competitionId),
      name,
      position,
      real_team: club,
      price,
    })),
);

// ---------------------------------------------------------------------------
// Fixtures: Premier League gameweeks 4-7, relative to "now" so the demo
// always has finished, live and upcoming matches whenever it's opened.
// ---------------------------------------------------------------------------

export interface SampleFixture {
  id: number;
  competitionId: number;
  gameweek: number | null;
  /** Hours from now; negative is in the past. Null for an unconfirmed kickoff. */
  kickoffOffsetHours: number | null;
  status: "SCHEDULED" | "LIVE" | "FINISHED";
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
}

type F = [gw: number | null, hours: number | null, status: SampleFixture["status"], home: string, away: string, hs: number | null, as: number | null];

const PL_FIXTURES: F[] = [
  [4, -340, "FINISHED", "Arsenal", "Nott'm Forest", 3, 0],
  [4, -338, "FINISHED", "Liverpool", "Burnley", 1, 0],
  [4, -336, "FINISHED", "Man City", "Man United", 3, 0],
  [4, -315, "FINISHED", "Brighton", "Tottenham", 2, 2],
  [5, -170, "FINISHED", "Coventry", "Brentford", 0, 0],
  [5, -168, "FINISHED", "Newcastle", "Leeds", 2, 1],
  [5, -167, "FINISHED", "Aston Villa", "Sunderland", 2, 3],
  [5, -165, "FINISHED", "Chelsea", "Fulham", 1, 1],
  [5, -144, "FINISHED", "Man United", "Everton", 0, 1],
  [6, -0.6, "LIVE", "Arsenal", "Newcastle", 1, 0],
  [6, -0.4, "LIVE", "Crystal Palace", "Liverpool", 1, 1],
  [6, 26, "SCHEDULED", "Man City", "Brentford", null, null],
  [6, 28, "SCHEDULED", "Tottenham", "Aston Villa", null, null],
  [7, 170, "SCHEDULED", "Chelsea", "Liverpool", null, null],
  [7, 172, "SCHEDULED", "Leeds", "Coventry", null, null],
  [7, 194, "SCHEDULED", "Everton", "West Ham", null, null],
  [null, null, "SCHEDULED", "Bournemouth", "Fulham", null, null],
];

export const FIXTURES: SampleFixture[] = PL_FIXTURES.map(
  ([gameweek, kickoffOffsetHours, status, home, away, homeScore, awayScore], i) => ({
    id: i + 1,
    competitionId: 1,
    gameweek,
    kickoffOffsetHours,
    status,
    home,
    away,
    homeScore,
    awayScore,
  }),
);

// ---------------------------------------------------------------------------
// One demo league. In production these totals come from the league_standings
// database function, which sums fpl_points() over each team's starting XI.
// ---------------------------------------------------------------------------

export const DEMO_LEAGUE = { id: 1, name: "ENTE-6 Demo League" };
export const DEMO_USER_ID = "erin";

export const STANDINGS = [
  { userId: "m1", username: "thandi_k", teamName: "Cape Town Comets", isDraftComplete: true, gameweekPoints: 58, totalPoints: 312, previousRank: 2 },
  { userId: "erin", username: "erin", teamName: "Pixel Perfect XI", isDraftComplete: true, gameweekPoints: 71, totalPoints: 309, previousRank: 3 },
  { userId: "m2", username: "lwazi.m", teamName: "Stellies Strikers", isDraftComplete: true, gameweekPoints: 44, totalPoints: 301, previousRank: 1 },
  { userId: "m3", username: "j_vdmerwe", teamName: "Back Four Dynamo", isDraftComplete: true, gameweekPoints: 63, totalPoints: 288, previousRank: 4 },
  { userId: "m4", username: "aisha.p", teamName: "Clean Sheet Club", isDraftComplete: true, gameweekPoints: 39, totalPoints: 254, previousRank: 5 },
  { userId: "m5", username: "newmanager", teamName: "Late Joiners FC", isDraftComplete: false, gameweekPoints: 0, totalPoints: 0, previousRank: null },
];

/** Resolves after a short delay, so loading states are visible like they are against a real backend. */
export function later<T>(value: T, ms = 220): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
