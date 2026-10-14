import { supabase } from "../../lib/supabaseClient";

export interface LatestMessage {
  id: number;
  content: string;
  created_at: string;
  author_name: string;
}

export async function getDraftCount(teamId: string): Promise<number> {
  const { count, error } = await supabase
    .from("drafted_players")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId);

  if (error) {
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function getLatestMessages(leagueId: number): Promise<LatestMessage[]> {
  const { data, error } = await supabase
    .from("league_message")
    .select(`
      id,
      content,
      created_at,
      profile:user_id(username)
    `)
    .eq("league_id", leagueId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !data) {
    throw new Error(error ? error.message : "No data returned");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((msg: any) => ({
    id: msg.id,
    content: msg.content,
    created_at: msg.created_at,
    author_name: msg.profile?.username ?? "Unknown",
  }));
}

export interface LeagueSnapshot {
  join_code: string | null;
  member_count: number;
}

export async function getLeagueSnapshot(leagueId: number): Promise<LeagueSnapshot | null> {
  // We need join code from league table and count of members
  const { data: league, error: leagueErr } = await supabase
    .from("league")
    .select("join_code")
    .eq("id", leagueId)
    .single();

  if (leagueErr) throw new Error(leagueErr.message);

  const { count, error: countErr } = await supabase
    .from("league_member")
    .select("*", { count: "exact", head: true })
    .eq("league_id", leagueId);

  if (countErr) throw new Error(countErr.message);

  return {
    join_code: league.join_code,
    member_count: count ?? 1,
  };
}

