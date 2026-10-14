// S2-16: seed 50-100 mock public leagues with members and complete squads.
// S3-42: also seeds private leagues (join code required), 10 by default, and
// puts the demo account in one of each (--demo-user).
// --competition=CODE seeds leagues for another competition (default PL), e.g.
// --competition=PD --leagues=4 --private=1. Targets, join codes, the demo
// account and backdating all count only that competition's seeded leagues.
//
// Run:      node --env-file=.env.seed scripts/seed-leagues.ts [--leagues=75] [--private=10]
// Other competition, plan only (writes nothing):
//           node --env-file=.env.seed scripts/seed-leagues.ts --competition=MLS --leagues=4 --private=1 --dry-run
// Demo:     node --env-file=.env.seed scripts/seed-leagues.ts --demo-user=you@example.com
// Teardown: node --env-file=.env.seed scripts/seed-leagues.ts --teardown
// Full teardown (also deletes the demo accounts):
//           node --env-file=.env.seed scripts/seed-leagues.ts --teardown --full
//
// Needs a .env.seed file (gitignored) with:
//   SUPABASE_URL=...              (same as VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY=... (Project Settings -> API. Bypasses RLS -
//     never put this in .env.local or anything that reaches the browser.)
//
// 260 demo profiles, not ~30: league_member's check_league_member_limits
// trigger caps every user at 5 leagues, and 50-100 leagues at 4-20 members
// each needs more headroom than 30 profiles gives. The Premier League seed
// used 948 of 200 profiles' 1,000 slots; the extra 60 make room for other
// competitions' leagues.
//
// teams.is_draft_complete marks a seeded squad as finished, so a re-run
// skips it. Seeded squads count as drafted an hour before the season's first
// deadline (see seasonDraftTime), or league_standings would give every
// seeded team 0 points until the next gameweek is played.
//
// --demo-user: the account has to have signed in with Google once, so its
// profile exists. The script adds it to the fullest seeded public and private
// league with room, drafts it a squad in each, and gives both leagues a short
// chat history. Re-runs reuse the same two leagues.
//
// Teams: the after_league_member_insert trigger (20260923090000) creates one
// per member. The upsert below is a no-op wherever it already has, and the
// script then renames the team when it drafts the squad.
//
// Seeded leagues are left 2-5 spots short of max_teams so the demo's join
// flow has leagues to join; a league at 20 members is still full.
//
// Private leagues get a random 6 character join code, and the script prints
// every seeded private league's code at the end, so the demo can join one by
// code. They are small (3-8 members) and seeded first, because the 5 league
// cap per profile is shared with the public leagues.

import { createClient } from "@supabase/supabase-js";
import {
  competitionArg,
  countArg,
  demoChatHistory,
  leaguesToCreate,
  makeJoinCode,
  pickDemoLeague,
  seasonDraftTime,
} from "./lib/seedPlan.ts";
import { selectAll } from "./lib/selectAll.ts";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, ".seed-manifest.json");

// ============================================================================
// Config
// ============================================================================

const NUM_DEMO_PROFILES = 260;
const DEFAULT_TARGET_LEAGUES = 75; // override with --leagues=N (50-100 per the issue)
const DEFAULT_TARGET_PRIVATE_LEAGUES = 10; // override with --private=N (0 skips them)
const PRIVATE_MIN_MEMBERS = 3;
const PRIVATE_MAX_MEMBERS = 8;
const MIN_MEMBERS = 4;
const MAX_MEMBERS = 20; // matches league.max_teams's own <= 20 constraint
const MAX_LEAGUES_PER_USER = 5; // must match check_league_member_limits()
const SQUAD_BUDGET = 100.0; // must match teams.remaining_budget's default
// Long .in() filters go in the request URL; ~900 UUIDs is too long for the
// API gateway, and the request fails with an empty error message.
const IN_CHUNK = 100;

const POSITION_LIMITS: Record<string, number> = {
  Goalkeeper: 2,
  Defender: 5,
  Midfielder: 4,
  Forward: 4,
}; // mirrors DraftPage.tsx's POSITION_LIMITS - keep these in sync

const DEMO_EMAIL_DOMAIN = "cuneiform.seed";
// Dev-only placeholder - these accounts never sign in, so nothing reads it.
const DEMO_PASSWORD = "seed-demo-do-not-use-in-prod-A1!";

// ============================================================================
// CLI args / env
// ============================================================================

const args = process.argv.slice(2);
const TEARDOWN = args.includes("--teardown");
const FULL_TEARDOWN = args.includes("--full");
const DRY_RUN = args.includes("--dry-run");
let TARGET_LEAGUES: number;
let TARGET_PRIVATE_LEAGUES: number;
let COMPETITION_CODE: string;
try {
  TARGET_LEAGUES = countArg(args, "leagues", DEFAULT_TARGET_LEAGUES);
  TARGET_PRIVATE_LEAGUES = countArg(args, "private", DEFAULT_TARGET_PRIVATE_LEAGUES);
  COMPETITION_CODE = competitionArg(args);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
const DEMO_USER_EMAIL = args
  .find((a) => a.startsWith("--demo-user="))
  ?.slice("--demo-user=".length)
  .trim()
  .toLowerCase();
if (DEMO_USER_EMAIL === "") {
  console.error('--demo-user needs an email, e.g. --demo-user=you@example.com');
  process.exit(1);
}
const DEMO_CHAT_AUTHORS = 4; // seeded members who post in each demo league

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.seed scripts/seed-leagues.ts\n" +
      "See the comment at the top of this file for what .env.seed needs.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================================
// Manifest (local record of what this script created, for idempotent re-runs
// and teardown - gitignored, never committed)
// ============================================================================

interface Manifest {
  profiles: { id: string; email: string }[];
}

function loadManifest(): Manifest {
  if (!existsSync(MANIFEST_PATH)) return { profiles: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));
}

function saveManifest(manifest: Manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// ============================================================================
// Name generation
// ============================================================================

const FIRST_NAMES = [
  "Liam",
  "Noah",
  "Mia",
  "Ava",
  "Ethan",
  "Zoe",
  "Kai",
  "Leo",
  "Sofia",
  "Amara",
  "Jayden",
  "Riley",
  "Priya",
  "Sam",
  "Thabo",
  "Lerato",
  "Wian",
  "Nadia",
  "Caleb",
  "Hannah",
  "Mateo",
  "Aisha",
  "Ruan",
  "Lindiwe",
  "Marco",
  "Chloe",
  "Sipho",
  "Emma",
  "Jordan",
  "Tariq",
];

const LAST_NAMES = [
  "Smith",
  "Botha",
  "Ndlovu",
  "Cohen",
  "Garcia",
  "Nguyen",
  "Patel",
  "Mokoena",
  "Fischer",
  "Rossi",
  "Naidoo",
  "Dlamini",
  "Reyes",
  "Walker",
  "Khumalo",
  "Novak",
  "Pretorius",
  "Adams",
  "Van Wyk",
  "Moyo",
];

const LEAGUE_ADJECTIVES = [
  "Northside",
  "Golden",
  "Crimson",
  "Iron",
  "Midnight",
  "Coastal",
  "Rebel",
  "Silver",
  "Thunder",
  "Southern",
  "Vintage",
  "Neon",
  "Highveld",
  "Wandering",
  "Royal",
  "Electric",
  "Grand",
  "Rusty",
  "Bold",
  "Velvet",
];

const LEAGUE_NOUNS = [
  "Strikers",
  "Legends",
  "Rovers",
  "Ballers",
  "Derby",
  "Showdown",
  "Circuit",
  "Collective",
  "Society",
  "Alliance",
  "Tacticians",
  "Managers",
  "Dynasty",
  "Underdogs",
  "Gaffers",
  "Regulars",
  "Assembly",
  "Outfit",
];

const LEAGUE_SUFFIXES = ["League", "FL", "Fantasy League", "Cup", "Division"];

const TEAM_NOUNS = [
  "Ironsides",
  "Falcons",
  "Wolves",
  "Comets",
  "Foxes",
  "Titans",
  "Hawks",
  "Rebels",
  "Sharks",
  "Panthers",
  "Lions",
  "Eagles",
  "Vipers",
  "Rockets",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeFullName(): string {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
}

function makeLeagueName(used: Set<string>): string {
  let name: string;
  do {
    name = `${pick(LEAGUE_ADJECTIVES)} ${pick(LEAGUE_NOUNS)} ${pick(LEAGUE_SUFFIXES)}`;
  } while (used.has(name));
  used.add(name);
  return name;
}

function makeTeamName(ownerFirstName: string): string {
  return `${ownerFirstName}'s ${pick(TEAM_NOUNS)}`;
}

// ============================================================================
// Step 1: demo profiles (real auth.users, since profile.id is a hard FK to
// auth.users - there's no way to seed a profile row without one)
// ============================================================================

async function ensureDemoProfiles(): Promise<
  { id: string; email: string; fullName: string }[]
> {
  const manifest = loadManifest();
  const existing = new Map(manifest.profiles.map((p) => [p.email, p.id]));

  const result: { id: string; email: string; fullName: string }[] = [];

  for (let i = 1; i <= NUM_DEMO_PROFILES; i++) {
    const email = `demo-seed-${i}@${DEMO_EMAIL_DOMAIN}`;
    const fullName = makeFullName();

    const knownId = existing.get(email);
    if (knownId) {
      result.push({ id: knownId, email, fullName });
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      // Likely "already registered" from a previous run whose manifest
      // write didn't complete - look the user up instead of failing.
      const { data: list } = await supabase.auth.admin.listUsers({
        perPage: 1000,
      });
      const users = (list?.users ?? []) as { id: string; email?: string }[];
      const found = users.find((u) => u.email === email);
      if (!found) {
        throw new Error(
          `Could not create or find demo user ${email}: ${error.message}`,
        );
      }
      result.push({ id: found.id, email, fullName });
      manifest.profiles.push({ id: found.id, email });
      continue;
    }

    result.push({ id: data.user.id, email, fullName });
    manifest.profiles.push({ id: data.user.id, email });

    // Save incrementally so a crash at profile 150 doesn't redo the first 149.
    if (i % 10 === 0) saveManifest(manifest);
  }

  saveManifest(manifest);
  console.log(`${result.length} demo profiles ready.`);
  return result;
}

// ============================================================================
// Step 2: football_players cache, bucketed by position
// ============================================================================

interface PlayerRow {
  id: number;
  position: string;
  price: number;
}

// A league's squads can only hold its own competition's players (enforced by
// the drafted_players trigger).
async function fetchPlayersByPosition(
  competition: CompetitionRow,
): Promise<Record<string, PlayerRow[]>> {
  const data = await selectAll<PlayerRow>(
    (from, to) =>
      supabase
        .from("football_players")
        .select("id, position, price")
        .eq("competition_id", competition.id)
        .not("price", "is", null)
        .order("id")
        .range(from, to),
    `${competition.code} players`,
  );

  if (data.length === 0) {
    throw new Error(
      `No priced ${competition.name} players - nothing to draft squads from.`,
    );
  }

  const byPosition: Record<string, PlayerRow[]> = {
    Goalkeeper: [],
    Defender: [],
    Midfielder: [],
    Forward: [],
  };

  for (const p of data) {
    if (byPosition[p.position]) byPosition[p.position].push(p);
  }

  for (const position of Object.keys(byPosition)) {
    byPosition[position].sort((a, b) => a.price - b.price);
    if (byPosition[position].length < POSITION_LIMITS[position]) {
      throw new Error(
        `Only ${byPosition[position].length} ${position}s available, need ${POSITION_LIMITS[position]} per squad.`,
      );
    }
  }

  return byPosition;
}

// Budget-aware draft: before each pick, reserves the cheapest price for
// every slot still remaining, so it never paints itself into an
// unaffordable final pick.
function draftLegalSquad(
  playersByPosition: Record<string, PlayerRow[]>,
): PlayerRow[] {
  const cheapestByPosition: Record<string, number> = {};
  for (const position of Object.keys(POSITION_LIMITS)) {
    cheapestByPosition[position] = playersByPosition[position][0].price;
  }

  const remainingCounts = { ...POSITION_LIMITS };
  const usedIds = new Set<number>();
  const squad: PlayerRow[] = [];
  let budgetLeft = SQUAD_BUDGET;

  for (const position of Object.keys(POSITION_LIMITS)) {
    for (let i = 0; i < POSITION_LIMITS[position]; i++) {
      remainingCounts[position] -= 1;

      const reserve = Object.entries(remainingCounts).reduce(
        (sum, [pos, count]) => sum + count * cheapestByPosition[pos],
        0,
      );
      const affordableMax = budgetLeft - reserve;

      let candidates = playersByPosition[position].filter(
        (p) => !usedIds.has(p.id) && p.price <= affordableMax,
      );
      if (candidates.length === 0) {
        // Fallback in case the reserve math above still leaves nothing
        // affordable - never leave a slot unfillable.
        candidates = playersByPosition[position]
          .filter((p) => !usedIds.has(p.id))
          .slice(0, 1);
      }

      const chosen = pick(candidates);
      squad.push(chosen);
      usedIds.add(chosen.id);
      budgetLeft -= chosen.price;
    }
  }

  return squad;
}

// ============================================================================
// Step 3: leagues, members, teams, squads
// ============================================================================

type Visibility = "PUBLIC" | "PRIVATE";

interface SeedContext {
  competitionId: number;
  profileIds: string[];
  profileById: Map<string, { id: string; email: string; fullName: string }>;
  playersByPosition: Record<string, PlayerRow[]>;
  // Remaining league capacity per profile, so a run never trips
  // check_league_member_limits().
  membershipCount: Map<string, number>;
  usedNames: Set<string>;
  usedCodes: Set<string>;
  draftedAt: string | null;
}

interface CompetitionRow {
  id: number;
  code: string;
  name: string;
}

async function fetchCompetition(code: string): Promise<CompetitionRow> {
  const { data: competition, error: compError } = await supabase
    .from("competition")
    .select("id, code, name")
    .eq("code", code)
    .maybeSingle();

  if (compError || !competition) {
    throw new Error(
      `Couldn't find a competition with code ${code}: ${compError?.message ?? "no such row"}`,
    );
  }
  return competition;
}

// See the note at the top of this file: null (no gameweeks loaded) leaves
// drafted_at to its default of now().
async function fetchSeasonDraftTime(competitionId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from("gameweek")
    .select("deadline_at")
    .eq("competition_id", competitionId);
  if (error) throw new Error(`Couldn't load gameweeks: ${error.message}`);
  return seasonDraftTime((data ?? []).map((g) => g.deadline_at));
}

async function ensureLeagues(
  profiles: { id: string; email: string; fullName: string }[],
  playersByPosition: Record<string, PlayerRow[]>,
  competitionId: number,
  draftedAt: string | null,
) {
  const profileIds = profiles.map((p) => p.id);

  async function countSeeded(visibility: Visibility): Promise<number> {
    const { count, error } = await supabase
      .from("league")
      .select("id", { count: "exact", head: true })
      .in("created_by", profileIds)
      .eq("competition_id", competitionId)
      .eq("visibility", visibility);
    if (error) throw new Error(`Couldn't count seeded ${visibility} leagues: ${error.message}`);
    return count ?? 0;
  }

  const existing = {
    public: await countSeeded("PUBLIC"),
    private: await countSeeded("PRIVATE"),
  };
  const toCreate = leaguesToCreate(existing, {
    public: TARGET_LEAGUES,
    private: TARGET_PRIVATE_LEAGUES,
  });

  if (toCreate.public === 0 && toCreate.private === 0) {
    console.log(
      `Already have ${existing.public} public (target ${TARGET_LEAGUES}) and ` +
        `${existing.private} private (target ${TARGET_PRIVATE_LEAGUES}) seeded leagues. Nothing to do.`,
    );
    await printPrivateJoinCodes(profileIds, competitionId);
    return;
  }
  console.log(
    `${existing.public} public and ${existing.private} private seeded leagues exist, ` +
      `creating ${toCreate.public} public and ${toCreate.private} private more.`,
  );

  // 200 profiles at up to 5 leagues each is 1,000 rows, right at the API's
  // row limit, so these reads page (scripts/lib/selectAll.ts).
  const memberRows = await selectAll<{ user_id: string }>(
    (from, to) =>
      supabase
        .from("league_member")
        .select("user_id, league_id")
        .in("user_id", profileIds)
        .order("league_id")
        .order("user_id")
        .range(from, to),
    "league memberships",
  );

  const membershipCount = new Map<string, number>();
  for (const id of profileIds) membershipCount.set(id, 0);
  for (const row of memberRows) {
    membershipCount.set(
      row.user_id,
      (membershipCount.get(row.user_id) ?? 0) + 1,
    );
  }

  const existingLeagues = await selectAll<{ name: string; join_code: string | null }>(
    (from, to) => supabase.from("league").select("name, join_code").order("id").range(from, to),
    "league names",
  );
  const usedNames = new Set<string>();
  const usedCodes = new Set<string>();
  for (const row of existingLeagues) {
    usedNames.add(row.name);
    if (row.join_code) usedCodes.add(row.join_code);
  }

  const ctx: SeedContext = {
    competitionId,
    profileIds,
    profileById: new Map(profiles.map((p) => [p.id, p])),
    playersByPosition,
    membershipCount,
    usedNames,
    usedCodes,
    draftedAt,
  };

  // Private first: they're small, and public leagues would otherwise use up
  // the 5 league cap per profile before they got any members.
  const privateCreated = await seedLeagueBatch("PRIVATE", toCreate.private, ctx);
  const publicCreated = await seedLeagueBatch("PUBLIC", toCreate.public, ctx);

  console.log(
    `Done: ${publicCreated} new public and ${privateCreated} new private leagues created.`,
  );
  await printPrivateJoinCodes(profileIds, competitionId);
}

async function seedLeagueBatch(
  visibility: Visibility,
  toCreate: number,
  ctx: SeedContext,
): Promise<number> {
  if (toCreate === 0) return 0;
  const isPrivate = visibility === "PRIVATE";
  const kind = isPrivate ? "private" : "public";
  const minMembers = isPrivate ? PRIVATE_MIN_MEMBERS : MIN_MEMBERS;
  const maxMembers = isPrivate ? PRIVATE_MAX_MEMBERS : MAX_MEMBERS;
  const { profileIds, membershipCount } = ctx;

  function capacityPool(exclude?: string): string[] {
    return profileIds.filter(
      (id) =>
        id !== exclude && (membershipCount.get(id) ?? 0) < MAX_LEAGUES_PER_USER,
    );
  }

  let created = 0;
  for (let i = 0; i < toCreate; i++) {
    const creatorPool = capacityPool();
    if (creatorPool.length === 0) {
      console.warn(
        `Ran out of demo profiles with league capacity after ${created} new ${kind} leagues ` +
          `(everyone's at the ${MAX_LEAGUES_PER_USER}-league cap). Stopping early - ` +
          `bump NUM_DEMO_PROFILES if you need more.`,
      );
      break;
    }
    const creatorId = pick(creatorPool);

    const targetMembers = randInt(minMembers, maxMembers);
    const otherPool = capacityPool(creatorId);
    const others = shuffle(otherPool).slice(0, targetMembers - 1);
    const actualMemberCount = 1 + others.length; // creator + however many we could fill

    const name = makeLeagueName(ctx.usedNames);

    const { data: league, error: leagueError } = await supabase
      .from("league")
      .insert({
        name,
        competition_id: ctx.competitionId,
        visibility,
        join_code: isPrivate ? makeJoinCode(ctx.usedCodes) : null,
        max_teams: Math.min(MAX_MEMBERS, actualMemberCount + randInt(2, 5)),
        created_by: creatorId,
      })
      .select("id")
      .single();

    if (leagueError || !league) {
      console.warn(`Skipped a ${kind} league ("${name}"): ${leagueError?.message}`);
      continue;
    }

    // after_league_insert already added the creator as COMMISSIONER -
    // account for that locally without an extra round trip.
    membershipCount.set(creatorId, (membershipCount.get(creatorId) ?? 0) + 1);

    if (others.length > 0) {
      const { error: memberError } = await supabase
        .from("league_member")
        .insert(
          others.map((userId) => ({
            league_id: league.id,
            user_id: userId,
            role: "REGULAR",
          })),
        );
      if (memberError) {
        console.warn(
          `Some members didn't join "${name}": ${memberError.message}`,
        );
      } else {
        for (const userId of others) {
          membershipCount.set(userId, (membershipCount.get(userId) ?? 0) + 1);
        }
      }
    }

    const memberIds = [creatorId, ...others];
    await ensureTeamsAndSquads(
      league.id,
      memberIds,
      ctx.profileById,
      ctx.playersByPosition,
      ctx.draftedAt,
    );

    created++;
    if (created % 10 === 0)
      console.log(`  ${created}/${toCreate} ${kind} leagues created...`);
  }

  return created;
}

// The demo joins a private league by its code, so list them every run, not
// only when new ones were created.
async function printPrivateJoinCodes(profileIds: string[], competitionId: number) {
  const { data, error } = await supabase
    .from("league")
    .select("name, join_code")
    .in("created_by", profileIds)
    .eq("competition_id", competitionId)
    .eq("visibility", "PRIVATE")
    .order("name");
  if (error) throw new Error(`Couldn't list private leagues: ${error.message}`);
  if (!data || data.length === 0) return;

  console.log(`\nPrivate leagues (join with these codes at /leagues/join):`);
  for (const row of data) console.log(`  ${row.join_code}  ${row.name}`);
}

async function ensureTeamsAndSquads(
  leagueId: number,
  memberIds: string[],
  profileById: Map<string, { id: string; email: string; fullName: string }>,
  playersByPosition: Record<string, PlayerRow[]>,
  draftedAt: string | null,
) {
  for (const userId of memberIds) {
    const profile = profileById.get(userId)!;
    const firstName = profile.fullName.split(" ")[0];

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .upsert(
        {
          league_id: leagueId,
          user_id: userId,
          team_name: makeTeamName(firstName),
          remaining_budget: SQUAD_BUDGET,
          is_draft_complete: false,
        },
        { onConflict: "league_id,user_id", ignoreDuplicates: true },
      )
      .select("id, is_draft_complete")
      .maybeSingle();

    // ignoreDuplicates returns no data for an existing row - fetch it so we
    // can check whether it already has a squad (idempotent re-run).
    let teamRow = team;
    if (!teamRow) {
      const { data: existingTeam } = await supabase
        .from("teams")
        .select("id, is_draft_complete")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .single();
      teamRow = existingTeam;
    }

    if (teamError || !teamRow) {
      console.warn(
        `Couldn't create/find a team for ${profile.email} in league ${leagueId}: ${teamError?.message}`,
      );
      continue;
    }

    if (teamRow.is_draft_complete) continue; // already fully seeded, idempotent skip

    const squad = draftLegalSquad(playersByPosition);
    const totalCost = squad.reduce((sum, p) => sum + p.price, 0);

    const { error: draftError } = await supabase.from("drafted_players").upsert(
      squad.map((p) => ({
        team_id: teamRow!.id,
        player_id: p.id,
        draft_price: p.price,
        ...(draftedAt ? { drafted_at: draftedAt } : {}),
      })),
      { onConflict: "team_id,player_id", ignoreDuplicates: true },
    );

    if (draftError) {
      console.warn(
        `Couldn't draft a squad for ${profile.email}: ${draftError.message}`,
      );
      continue;
    }

    // is_draft_complete marks the squad as finished - see the note at the
    // top of this file.
    const { error: updateError } = await supabase
      .from("teams")
      .update({
        team_name: makeTeamName(firstName),
        remaining_budget: SQUAD_BUDGET - totalCost,
        is_draft_complete: true,
      })
      .eq("id", teamRow.id);

    if (updateError) {
      throw new Error(
        `Drafted a squad for ${profile.email} but couldn't update team ${teamRow.id}: ${updateError.message}`,
      );
    }
  }
}

// ============================================================================
// Step 4: the demo account (--demo-user) and its two leagues
// ============================================================================

interface SeededLeague {
  id: number;
  name: string;
  visibility: Visibility;
  max_teams: number;
  join_code: string | null;
}

async function fetchSeededLeagues(
  profileIds: string[],
  competitionId: number,
): Promise<SeededLeague[]> {
  return selectAll<SeededLeague>(
    (from, to) =>
      supabase
        .from("league")
        .select("id, name, visibility, max_teams, join_code")
        .in("created_by", profileIds)
        .eq("competition_id", competitionId)
        .order("id")
        .range(from, to),
    "seeded leagues",
  );
}

async function fetchMembers(leagueIds: number[]): Promise<{ league_id: number; user_id: string }[]> {
  const rows: { league_id: number; user_id: string }[] = [];
  for (const chunk of chunks(leagueIds)) {
    rows.push(
      ...(await selectAll<{ league_id: number; user_id: string }>(
        (from, to) =>
          supabase
            .from("league_member")
            .select("league_id, user_id")
            .in("league_id", chunk)
            .order("league_id")
            .order("user_id")
            .range(from, to),
        "league members",
      )),
    );
  }
  return rows;
}

// There's no lookup by email in the admin API, so page through the users.
async function findUserIdByEmail(email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Couldn't list users: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < perPage) return null;
  }
}

async function ensureDemoUser(
  email: string,
  profileIds: string[],
  playersByPosition: Record<string, PlayerRow[]>,
  competitionId: number,
  draftedAt: string | null,
) {
  const userId = await findUserIdByEmail(email);
  const { data: profile } = userId
    ? await supabase.from("profile").select("username").eq("id", userId).maybeSingle()
    : { data: null };
  if (!userId || !profile) {
    throw new Error(
      `No account for ${email}. Sign in to the app with Google once as that account, then re-run.`,
    );
  }

  const leagues = await fetchSeededLeagues(profileIds, competitionId);
  const members = await fetchMembers(leagues.map((l) => l.id));
  const memberCount = new Map<number, number>();
  const demoLeagueIds = new Set<number>();
  for (const m of members) {
    memberCount.set(m.league_id, (memberCount.get(m.league_id) ?? 0) + 1);
    if (m.user_id === userId) demoLeagueIds.add(m.league_id);
  }

  const picks: SeededLeague[] = [];
  for (const visibility of ["PUBLIC", "PRIVATE"] as const) {
    const id = pickDemoLeague(
      leagues
        .filter((l) => l.visibility === visibility)
        .map((l) => ({
          id: l.id,
          memberCount: memberCount.get(l.id) ?? 0,
          maxTeams: l.max_teams,
          hasDemoUser: demoLeagueIds.has(l.id),
        })),
    );
    if (id === null) {
      console.warn(`No seeded ${visibility.toLowerCase()} league has room for ${email} - skipped.`);
      continue;
    }
    picks.push(leagues.find((l) => l.id === id)!);
  }

  // check_league_member_limits() would refuse the join anyway; say why up
  // front instead of failing halfway through.
  const toJoin = picks.filter((l) => !demoLeagueIds.has(l.id));
  const { count: currentLeagues, error: countError } = await supabase
    .from("league_member")
    .select("league_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (countError) throw new Error(`Couldn't count ${email}'s leagues: ${countError.message}`);
  if ((currentLeagues ?? 0) + toJoin.length > MAX_LEAGUES_PER_USER) {
    throw new Error(
      `${email} is in ${currentLeagues} leagues and needs ${toJoin.length} more, over the ` +
        `${MAX_LEAGUES_PER_USER}-league cap. Leave some leagues in the app, then re-run.`,
    );
  }

  const demoProfile = new Map([[userId, { id: userId, email, fullName: profile.username }]]);

  for (const league of picks) {
    if (!demoLeagueIds.has(league.id)) {
      // The after_league_member_insert trigger creates the team.
      const { error } = await supabase
        .from("league_member")
        .insert({ league_id: league.id, user_id: userId, role: "REGULAR" });
      if (error) throw new Error(`Couldn't add ${email} to "${league.name}": ${error.message}`);
    }

    // Draft only into an empty team: squads picked by hand in the app are
    // left alone.
    const { data: team } = await supabase
      .from("teams")
      .select("id, drafted_players(count)")
      .eq("league_id", league.id)
      .eq("user_id", userId)
      .maybeSingle();
    const drafted = (team?.drafted_players as { count: number }[] | undefined)?.[0]?.count ?? 0;
    if (drafted === 0) {
      await ensureTeamsAndSquads(league.id, [userId], demoProfile, playersByPosition, draftedAt);
    }

    await ensureChatHistory(league.id, userId, members);

    const code = league.join_code ? ` (join code ${league.join_code})` : "";
    console.log(`  ${email} is in ${league.visibility.toLowerCase()} league "${league.name}"${code}`);
  }
}

// Seeded members only, never the demo account: nothing should appear under
// the presenter's name that they didn't write. Leagues that already have
// messages are left alone.
async function ensureChatHistory(
  leagueId: number,
  demoUserId: string,
  members: { league_id: number; user_id: string }[],
) {
  const { count, error: countError } = await supabase
    .from("league_message")
    .select("id", { count: "exact", head: true })
    .eq("league_id", leagueId);
  if (countError) throw new Error(`Couldn't read league ${leagueId}'s chat: ${countError.message}`);
  if ((count ?? 0) > 0) return;

  const authors = members
    .filter((m) => m.league_id === leagueId && m.user_id !== demoUserId)
    .map((m) => m.user_id)
    .slice(0, DEMO_CHAT_AUTHORS);
  const lines = demoChatHistory(authors.length, new Date());
  if (lines.length === 0) return;

  const { error } = await supabase.from("league_message").insert(
    lines.map((l) => ({
      league_id: leagueId,
      user_id: authors[l.authorIndex],
      content: l.content,
      created_at: l.createdAt,
    })),
  );
  if (error) throw new Error(`Couldn't seed league ${leagueId}'s chat: ${error.message}`);
}

// Squads seeded before this fix were stamped with the time of the run, so
// they score nothing for gameweeks already played. Move them back to the
// season's draft time too, which makes a re-run fix an existing seed without
// a teardown. Covers the demo account's team in a seeded league as well.
// Only this competition's leagues: seasons start on different dates.
async function backdateSeededSquads(
  profileIds: string[],
  competitionId: number,
  draftedAt: string | null,
) {
  if (!draftedAt) {
    console.warn("No gameweeks loaded yet - seeded squads will only score from the next gameweek.");
    return;
  }

  const leagueIds = (await fetchSeededLeagues(profileIds, competitionId)).map((l) => l.id);
  let moved = 0;
  for (const leagueChunk of chunks(leagueIds)) {
    const { data: teams, error: teamError } = await supabase
      .from("teams")
      .select("id")
      .in("league_id", leagueChunk);
    if (teamError) throw new Error(`Couldn't load seeded teams: ${teamError.message}`);

    for (const teamChunk of chunks((teams ?? []).map((t) => t.id as string))) {
      const { count, error } = await supabase
        .from("drafted_players")
        .update({ drafted_at: draftedAt }, { count: "exact" })
        .in("team_id", teamChunk)
        .gt("drafted_at", draftedAt);
      if (error) throw new Error(`Couldn't backdate seeded squads: ${error.message}`);
      moved += count ?? 0;
    }
  }
  if (moved > 0) console.log(`Backdated ${moved} drafted players to ${draftedAt}.`);
}

// ============================================================================
// Teardown
// ============================================================================

function chunks<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Every teardown step checks its error and stops: a delete that fails
// silently leaves rows behind that the next step then trips over (a league
// can't be deleted while teams still reference it).
async function selectIds<T>(table: string, column: string, values: string[] | number[]): Promise<T[]> {
  const ids: T[] = [];
  for (const chunk of chunks(values as unknown[])) {
    const { data, error } = await supabase.from(table).select("id").in(column, chunk);
    if (error) throw new Error(`Teardown: reading ${table} failed: ${error.message}`);
    for (const row of data ?? []) ids.push(row.id as T);
  }
  return ids;
}

async function deleteWhereIn(table: string, column: string, values: string[] | number[]) {
  for (const chunk of chunks(values as unknown[])) {
    const { error } = await supabase.from(table).delete().in(column, chunk);
    if (error) throw new Error(`Teardown: deleting from ${table} failed: ${error.message}`);
  }
}

async function teardown() {
  const manifest = loadManifest();
  const profileIds = manifest.profiles.map((p) => p.id);

  if (profileIds.length === 0) {
    console.log("No manifest found - nothing to tear down.");
    return;
  }

  console.log(`Tearing down data for ${profileIds.length} demo profiles...`);

  const leagueIds = await selectIds<number>("league", "created_by", profileIds);

  // Teams in seeded leagues, plus demo users' teams in any other league.
  const teamIds = [
    ...new Set([
      ...(leagueIds.length > 0 ? await selectIds<string>("teams", "league_id", leagueIds) : []),
      ...(await selectIds<string>("teams", "user_id", profileIds)),
    ]),
  ];

  if (teamIds.length > 0) {
    await deleteWhereIn("drafted_players", "team_id", teamIds);
    await deleteWhereIn("teams", "id", teamIds);
    console.log(`  removed ${teamIds.length} teams and their squads`);
  }

  if (leagueIds.length > 0) {
    await deleteWhereIn("league_member", "league_id", leagueIds);
    await deleteWhereIn("league", "id", leagueIds);
    console.log(`  removed ${leagueIds.length} leagues and their memberships`);
  }

  // Also drop memberships in leagues we didn't create (e.g. joined during testing).
  await deleteWhereIn("league_member", "user_id", profileIds);

  if (!FULL_TEARDOWN) {
    console.log(
      "Data cleared. Demo accounts kept (re-run without --full to reuse them). Use --full to remove them too.",
    );
    return;
  }

  console.log("Removing demo accounts (--full)...");
  // Deletes that fail (e.g. a network blip) stay in the manifest instead of
  // being silently forgotten, so a re-run can retry just those.
  const failed: { id: string; email: string }[] = [];
  for (const p of manifest.profiles) {
    const { error } = await supabase.auth.admin.deleteUser(p.id);
    if (error) {
      console.warn(`  couldn't delete ${p.email} (${p.id}): ${error.message}`);
      failed.push(p);
    }
  }
  // profile rows cascade-delete with their auth.users row automatically.

  writeFileSync(MANIFEST_PATH, JSON.stringify({ profiles: failed }, null, 2));
  if (failed.length > 0) {
    console.warn(
      `${failed.length} account(s) failed to delete and were kept in the manifest - ` +
        `re-run --teardown --full to retry them.`,
    );
  } else {
    console.log("Demo accounts removed and manifest cleared.");
  }
}

// ============================================================================
// Dry run: reads only, so a new competition's seed can be checked before it
// writes anything
// ============================================================================

async function dryRun(
  competition: CompetitionRow,
  playersByPosition: Record<string, PlayerRow[]>,
  draftedAt: string | null,
) {
  const counts = Object.entries(playersByPosition)
    .map(([position, players]) => `${players.length} ${position}s`)
    .join(", ");
  console.log(`Players: ${counts}.`);
  console.log(`Squads count as drafted at: ${draftedAt ?? "the time of the run (no gameweeks loaded)"}.`);

  const sample = draftLegalSquad(playersByPosition);
  const cost = sample.reduce((sum, p) => sum + p.price, 0);
  console.log(`Sample squad: ${sample.length} players for ${cost.toFixed(1)} of ${SQUAD_BUDGET}.`);

  const manifest = loadManifest();
  const profileIds = manifest.profiles.map((p) => p.id);
  const leagues = profileIds.length > 0 ? await fetchSeededLeagues(profileIds, competition.id) : [];
  const existing = {
    public: leagues.filter((l) => l.visibility === "PUBLIC").length,
    private: leagues.filter((l) => l.visibility === "PRIVATE").length,
  };
  const toCreate = leaguesToCreate(existing, {
    public: TARGET_LEAGUES,
    private: TARGET_PRIVATE_LEAGUES,
  });
  console.log(
    `${competition.code} has ${existing.public} public and ${existing.private} private seeded leagues; ` +
      `a real run creates ${toCreate.public} public and ${toCreate.private} private.`,
  );

  let memberships = 0;
  for (const chunk of chunks(profileIds)) {
    const { count, error } = await supabase
      .from("league_member")
      .select("league_id", { count: "exact", head: true })
      .in("user_id", chunk);
    if (error) throw new Error(`Couldn't count memberships: ${error.message}`);
    memberships += count ?? 0;
  }
  const newProfiles = Math.max(0, NUM_DEMO_PROFILES - profileIds.length);
  const free = (profileIds.length + newProfiles) * MAX_LEAGUES_PER_USER - memberships;
  const worstCase = toCreate.public * MAX_MEMBERS + toCreate.private * PRIVATE_MAX_MEMBERS;
  console.log(
    `Capacity: ${free} free league slots after creating ${newProfiles} new demo profiles; ` +
      `these leagues need at most ${worstCase}.`,
  );
  console.log("Dry run - nothing written.");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  if (TEARDOWN) {
    await teardown();
    return;
  }

  const competition = await fetchCompetition(COMPETITION_CODE);
  console.log(
    `Seeding ${competition.name} (${competition.code}) towards ${TARGET_LEAGUES} public ` +
      `(${MIN_MEMBERS}-${MAX_MEMBERS} members each) and ${TARGET_PRIVATE_LEAGUES} private ` +
      `(${PRIVATE_MIN_MEMBERS}-${PRIVATE_MAX_MEMBERS} members each) leagues...`,
  );
  const playersByPosition = await fetchPlayersByPosition(competition);
  const draftedAt = await fetchSeasonDraftTime(competition.id);
  if (DRY_RUN) {
    await dryRun(competition, playersByPosition, draftedAt);
    return;
  }
  const profiles = await ensureDemoProfiles();
  const profileIds = profiles.map((p) => p.id);
  await ensureLeagues(profiles, playersByPosition, competition.id, draftedAt);
  if (DEMO_USER_EMAIL) {
    console.log(`\nDemo account:`);
    await ensureDemoUser(DEMO_USER_EMAIL, profileIds, playersByPosition, competition.id, draftedAt);
  }
  await backdateSeededSquads(profileIds, competition.id, draftedAt);
  console.log("Seeding complete.");
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exitCode = 1;
});
