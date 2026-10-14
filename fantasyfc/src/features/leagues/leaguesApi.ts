import { supabase } from "../../lib/supabaseClient";
import {
  assertOk,
  firstRow,
  unwrapMany,
  unwrapOne,
  describeError,
} from "../../lib/dataAccess";

export type Visibility = "PUBLIC" | "PRIVATE";

interface CreateLeagueRpcRow {
  id: number;
  join_code: string | null;
}

export interface MyLeague {
  id: number;
  name: string;
  visibility: Visibility;
  role: "COMMISSIONER" | "REGULAR";
  /** The real-world league its squads are drafted from (competition.id). */
  competitionId: number;
  /** That competition's code and name (PL, "English Premier League"), for
   *  the sidebar's league switcher. */
  competitionCode?: string;
  competitionName?: string;
}

export interface PublicLeague {
  id: number;
  name: string;
  competitionId: number;
}

/** A real-world league players can be drafted from (#44). */
export interface Competition {
  id: number;
  name: string;
  /** football-data.org's code where it has one: PL, PD, BL1, ... PSL. */
  code: string;
  country: string | null;
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return user.id;
}

export async function getMyLeagues(): Promise<MyLeague[]> {
  const userId = await getCurrentUserId();
  // RLS also returns other members of shared leagues; without this filter each
  // league appears once per member, carrying their role instead of ours.
  const rows = unwrapMany(
    await supabase
      .from("league_member")
      .select(
        "role, league:league_id(id, name, visibility, competition_id, competition:competition_id(code, name))",
      )
      .eq("user_id", userId),
    "your leagues",
  );

  return rows.map((row) => {
    // supabase-js types this embed as an array even though league_id is a
    // to-one FK; it's always exactly one row here.
    const league = Array.isArray(row.league) ? row.league[0] : row.league;
    const competition = Array.isArray(league.competition) ? league.competition[0] : league.competition;
    return {
      id: league.id,
      name: league.name,
      visibility: league.visibility,
      role: row.role,
      competitionId: league.competition_id,
      competitionCode: competition?.code,
      competitionName: competition?.name,
    };
  });
}

/** Every competition, in the order they were added (Premier League first). */
export async function listCompetitions(): Promise<Competition[]> {
  return unwrapMany(
    await supabase.from("competition").select("id, name, code, country").order("id"),
    "competitions",
  );
}

/** The Premier League's competition id: the default for a new league. */
export async function getCompetitionId(): Promise<number> {
  const competition = unwrapOne(
    await supabase.from("competition").select("id").eq("code", "PL").single(),
    "the competition",
  );
  return competition.id;
}

export interface CreateLeagueInput {
  name: string;
  visibility: Visibility;
  maxTeams: number;
  /** Defaults to the Premier League. */
  competitionId?: number;
}

export interface CreateLeagueResult {
  id: number;
  joinCode: string | null;
}

// Goes through the create_league RPC rather than a plain insert().select():
// a PRIVATE league isn't visible under league's own SELECT policy until the
// after_league_insert trigger's league_member row exists, so PostgREST's
// return-the-new-row step (what .select() asks for) gets blocked by that
// same policy - a real, verified RLS/PostgREST interaction, not a design
// choice. The RPC's return value isn't subject to that check on the way out,
// and it generates/retries the join code server-side too.
export async function createLeague({
  name,
  visibility,
  maxTeams,
  competitionId,
}: CreateLeagueInput): Promise<CreateLeagueResult> {
  competitionId ??= await getCompetitionId();

  const { data, error } = await supabase.rpc("create_league", {
    p_name: name,
    p_visibility: visibility,
    p_max_teams: maxTeams,
    p_competition_id: competitionId,
  });

  if (error) throw new Error(describeError(error, "the league"));

  const row = firstRow(data as CreateLeagueRpcRow[] | null, "the new league");

  return { id: row.id, joinCode: row.join_code };
}

/** Public leagues, optionally only those of one competition (the globe). */
export async function listPublicLeagues(competitionId?: number): Promise<PublicLeague[]> {
  let query = supabase
    .from("league")
    .select("id, name, competition_id")
    .eq("visibility", "PUBLIC");
  if (competitionId !== undefined) query = query.eq("competition_id", competitionId);

  const rows = unwrapMany(
    await query.order("created_at", { ascending: false }),
    "public leagues",
  );
  return rows.map((l) => ({ id: l.id, name: l.name, competitionId: l.competition_id }));
}

export async function joinPublicLeague(leagueId: number): Promise<void> {
  const userId = await getCurrentUserId();

  assertOk(
    await supabase
      .from("league_member")
      .insert({ league_id: leagueId, user_id: userId, role: "REGULAR" }),
    "your league membership",
  );
}

export async function joinByCode(code: string): Promise<number> {
  const { data, error } = await supabase.rpc("join_league_by_code", {
    p_join_code: code,
  });

  if (error) throw new Error(describeError(error, "that league"));
  const leagueId = data as number;

  return leagueId;
}

export async function leaveLeague(leagueId: number): Promise<void> {
  const { error } = await supabase.rpc("leave_league", {
    p_league_id: leagueId,
  });
  if (error) throw new Error(describeError(error, "leaving the league"));
}
