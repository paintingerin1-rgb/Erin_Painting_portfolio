// Lineup persistence for My Squad (#17): get_lineup() and set_lineup() in
// migration 20261011150000. Both check the caller owns the team; set_lineup
// also enforces the formation rules and the gameweek deadline.

import { supabase } from "../../lib/supabaseClient";
import { describeError } from "../../lib/dataAccess";

export interface SavedLineupRow {
  playerId: number;
  slotId: string;
  isCaptain: boolean;
}

export interface SavedLineup {
  gameweekId: number;
  gameweekNumber: number;
  deadlineAt: string;
  rows: SavedLineupRow[];
}

interface GetLineupRpcRow {
  gameweek_id: number;
  gameweek_number: number;
  deadline_at: string;
  player_id: number;
  slot_id: string;
  is_starting: boolean;
  is_captain: boolean;
}

/**
 * The team's lineup for its next gameweek (created on first read). Null
 * before the draft is complete, or when the season has no gameweek left.
 */
export async function getLineup(teamId: string): Promise<SavedLineup | null> {
  const { data, error } = await supabase.rpc("get_lineup", { p_team_id: teamId });
  if (error) throw new Error(describeError(error, "your lineup"));
  const rows = (data ?? []) as GetLineupRpcRow[];
  if (rows.length === 0) return null;
  return {
    gameweekId: rows[0].gameweek_id,
    gameweekNumber: rows[0].gameweek_number,
    deadlineAt: rows[0].deadline_at,
    rows: rows.map((r) => ({ playerId: r.player_id, slotId: r.slot_id, isCaptain: r.is_captain })),
  };
}

export async function saveLineup(
  teamId: string,
  gameweekId: number,
  slots: { player_id: number; slot_id: string; is_captain: boolean }[],
): Promise<void> {
  const { error } = await supabase.rpc("set_lineup", {
    p_team_id: teamId,
    p_gameweek_id: gameweekId,
    p_slots: slots,
  });
  // set_lineup's own messages ("Locked — GW 7 kicked off.", "Not a legal
  // formation ...") are written for players, so pass them through.
  if (error) throw new Error(error.message || describeError(error, "your lineup"));
}
