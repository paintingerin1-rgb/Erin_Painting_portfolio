import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SquadPage from "./SquadPage";
import { getLineup, saveLineup, type SavedLineup } from "./lineupApi";
import type { Position } from "./lineupLogic";

vi.mock("./lineupApi", () => ({ getLineup: vi.fn(), saveLineup: vi.fn() }));

// A 2/5/4/4 squad. Names are short so PlayerCard shows them in full.
const SQUAD: { id: number; name: string; position: Position }[] = [
  { id: 1, name: "Keeper", position: "Goalkeeper" },
  { id: 2, name: "Spare", position: "Goalkeeper" },
  ...[3, 4, 5, 6, 7].map((id) => ({ id, name: `Def${id}`, position: "Defender" as Position })),
  ...[8, 9, 10, 11].map((id) => ({ id, name: `Mid${id}`, position: "Midfielder" as Position })),
  ...[12, 13, 14, 15].map((id) => ({ id, name: `Fwd${id}`, position: "Forward" as Position })),
];

const drafted = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: drafted }) }),
    rpc: vi.fn(),
  },
}));

// One team object per test, like the real context (a new object on every
// render would re-run the page's load effect each time).
let team = { id: "team-1", team_name: "Test XI", is_draft_complete: true };
vi.mock("../../contexts/CurrentLeagueContext", () => ({
  useCurrentLeague: () => ({ currentTeam: team, isLoading: false }),
}));

const FUTURE = "2099-01-01T12:00:00Z";
const PAST = "2020-01-01T12:00:00Z";

/** The default 4-3-3: Def7, Mid11, Fwd15 and the spare keeper on the bench. */
function saved433(deadlineAt = FUTURE): SavedLineup {
  const slot: Record<number, string> = {
    1: "GK1", 3: "DEF1", 4: "DEF2", 5: "DEF3", 6: "DEF4", 8: "MID1", 9: "MID2", 10: "MID3",
    12: "FWD1", 13: "FWD2", 14: "FWD3", 2: "B1", 7: "B2", 11: "B3", 15: "B4",
  };
  return {
    gameweekId: 7,
    gameweekNumber: 7,
    deadlineAt,
    rows: SQUAD.map((p) => ({ playerId: p.id, slotId: slot[p.id], isCaptain: p.id === 12 })),
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SquadPage />
    </MemoryRouter>,
  );
}

describe("SquadPage lineup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    team = { id: "team-1", team_name: "Test XI", is_draft_complete: true };
    drafted.mockResolvedValue({
      data: SQUAD.map((p) => ({
        player_id: p.id,
        football_players: { ...p, price: 5, real_team: "Club" },
      })),
      error: null,
    });
  });
  afterEach(cleanup);

  it("shows the saved lineup for the next gameweek", async () => {
    vi.mocked(getLineup).mockResolvedValue(saved433());
    renderPage();
    expect(await screen.findByText(/GW 7 lineup · 4-3-3/)).toBeInTheDocument();
    expect(screen.getByTitle("Captain")).toBeInTheDocument();
  });

  it("saves a swap, then reloads the lineup from the database", async () => {
    vi.mocked(getLineup).mockResolvedValueOnce(saved433());
    // What the database returns after the save: Def7 on for Fwd14 (5-3-2).
    const after = saved433();
    after.rows = after.rows.map((r) =>
      r.playerId === 7 ? { ...r, slotId: "DEF5" } : r.playerId === 14 ? { ...r, slotId: "B2" } : r,
    );
    vi.mocked(getLineup).mockResolvedValueOnce(after);
    vi.mocked(saveLineup).mockResolvedValue();

    renderPage();
    fireEvent.click(await screen.findByText("Fwd14"));
    fireEvent.click(screen.getByText("Def7"));

    await waitFor(() => expect(saveLineup).toHaveBeenCalledTimes(1));
    const [teamId, gameweekId, slots] = vi.mocked(saveLineup).mock.calls[0];
    expect([teamId, gameweekId]).toEqual(["team-1", 7]);
    expect(slots).toContainEqual({ player_id: 7, slot_id: "DEF5", is_captain: false });
    expect(slots).toContainEqual({ player_id: 14, slot_id: "B2", is_captain: false });

    // The screen shows the reloaded lineup, not just local state.
    expect(await screen.findByText(/GW 7 lineup · 5-3-2/)).toBeInTheDocument();
    expect(getLineup).toHaveBeenCalledTimes(2);
  });

  it("refuses an illegal swap without saving", async () => {
    vi.mocked(getLineup).mockResolvedValue(saved433());
    renderPage();
    fireEvent.click(await screen.findByText("Mid8"));
    fireEvent.click(screen.getByText("Spare"));
    expect(await screen.findByText(/one goalkeeper/)).toBeInTheDocument();
    expect(saveLineup).not.toHaveBeenCalled();
  });

  it("shows the locked state once the deadline has passed, and doesn't save", async () => {
    vi.mocked(getLineup).mockResolvedValue(saved433(PAST));
    renderPage();
    expect(await screen.findByText(/Locked — GW 7 kicked off\. Reload/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Fwd14"));
    expect(saveLineup).not.toHaveBeenCalled();
  });

  it("asks for a completed draft before any swap", async () => {
    team = { ...team, is_draft_complete: false };
    renderPage();
    fireEvent.click(await screen.findByText("Fwd14"));
    expect(await screen.findByText(/Complete your draft first/)).toBeInTheDocument();
    expect(getLineup).not.toHaveBeenCalled();
  });
});
