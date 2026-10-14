// Standings data source: the league_standings / my_league_standings RPCs
// (20260926150000). Points are derived in the database from
// player_gameweek_points: each team's starting XI, captain doubled - see
// 20261012090000_score_starting_xi.sql for exactly which players and
// gameweeks count towards a team's total.

import { supabase } from "../../lib/supabaseClient";
import { unwrapMany, describeError } from "../../lib/dataAccess";

export interface StandingRow {
  userId: string;
  username: string;
  avatarUrl: string | null;
  teamName: string | null;
  isDraftComplete: boolean;
  gameweekPoints: number;
  totalPoints: number;
  rank: number;
  previousRank: number | null;
}

export interface CurrentGameweek {
  number: number;
  deadlineAt: string;
}

interface StandingRpcRow {
  user_id: string;
  username: string;
  avatar_url: string | null;
  team_name: string | null;
  is_draft_complete: boolean;
  gameweek_points: number;
  total_points: number;
  rank: number;
  previous_rank: number | null;
}


/** Full table for one league, already sorted by rank. */
export async function getLeagueStandings(
  leagueId: number,
): Promise<StandingRow[]> {
  const rows = unwrapMany<StandingRpcRow>(
    await supabase.rpc("league_standings", { p_league_id: leagueId }),
    "the league standings",
  );
  return rows.map((r) => ({
    userId: r.user_id,
    username: r.username,
    avatarUrl: r.avatar_url,
    teamName: r.team_name,
    isDraftComplete: r.is_draft_complete,
    gameweekPoints: r.gameweek_points,
    totalPoints: r.total_points,
    rank: r.rank,
    previousRank: r.previous_rank,
  }));
}

/** A league's name; RLS lets members read their own leagues. */
export async function getLeagueName(leagueId: number): Promise<string> {
  const { data, error } = await supabase
    .from("league")
    .select("name")
    .eq("id", leagueId)
    .maybeSingle();
  if (error) throw new Error(describeError(error, "the league"));
  if (!data) throw new Error("League not found, or you're not a member of it.");
  return data.name;
}

/**
 * Each competition has its own gameweeks (#44), so both lookups below take
 * the current league's competition. Without one they use the Premier League.
 */
function gameweeksOf(competitionId: number | null, columns: string) {
  const query = supabase.from("gameweek").select(`${columns}, competition!inner ( code )`);
  return competitionId === null
    ? query.eq("competition.code", "PL")
    : query.eq("competition_id", competitionId);
}

export async function getCurrentGameweek(
  competitionId: number | null = null,
): Promise<CurrentGameweek | null> {
  const { data, error } = await gameweeksOf(competitionId, "number, deadline_at")
    .eq("is_current", true)
    .maybeSingle<{ number: number; deadline_at: string }>();
  if (error) throw new Error(describeError(error, "the current gameweek"));
  if (!data) return null;
  return {
    number: data.number,
    deadlineAt: data.deadline_at,
  };
}

export async function getUpcomingGameweek(
  competitionId: number | null = null,
): Promise<CurrentGameweek | null> {
  const { data: gw, error: gwError } = await gameweeksOf(competitionId, "id, number, deadline_at")
    .gt("deadline_at", new Date().toISOString())
    .order("deadline_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: number; number: number; deadline_at: string }>();

  if (gwError) throw new Error(describeError(gwError, "the upcoming gameweek"));
  if (!gw) return null;



  return {
    number: gw.number,
    deadlineAt: gw.deadline_at,
  };
}

/**
 * Places gained (+) or lost (-) this gameweek. Null when there is nothing to
 * compare against. A lower rank number is better, so it's previous - current.
 */
export function rankMovement(
  rank: number,
  previousRank: number | null,
): number | null {
  return previousRank === null ? null : previousRank - rank;
}
