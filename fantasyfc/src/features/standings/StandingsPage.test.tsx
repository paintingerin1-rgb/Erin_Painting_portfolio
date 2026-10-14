import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StandingsPage from "./StandingsPage";
import {
  getCurrentGameweek,
  getLeagueName,
  getLeagueStandings,
} from "./standingsApi";

vi.mock("./standingsApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./standingsApi")>();
  return {
    ...actual,
    getLeagueStandings: vi.fn(),
    getLeagueName: vi.fn(),
    getCurrentGameweek: vi.fn(),
  };
});

const getSession = vi.hoisted(() => vi.fn());
vi.mock("../../lib/supabaseClient", () => ({
  supabase: { auth: { getSession } },
}));

let mockCurrentLeagueId: number | null = null;
let mockIsLeagueLoading = false;

vi.mock("../../contexts/CurrentLeagueContext", () => ({
  useCurrentLeague: () => ({
    leagues: [],
    currentLeagueId: mockCurrentLeagueId,
    currentTeam: null,
    isLoading: mockIsLeagueLoading,
    setLeagueId: vi.fn(),
    refreshTeam: vi.fn(),
    refreshLeagues: vi.fn(),
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/standings" element={<StandingsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("StandingsPage", () => {
  beforeEach(() => {
    mockCurrentLeagueId = null;
    mockIsLeagueLoading = false;
    vi.resetAllMocks();
    vi.mocked(getCurrentGameweek).mockResolvedValue({
      number: 6,
      deadlineAt: "2026-10-01T12:00:00Z",
    });
    getSession.mockResolvedValue({ data: { session: { user: { id: "me" } } } });
  });

  afterEach(cleanup);

  it("shows an empty state when currentLeagueId is null", async () => {
    mockCurrentLeagueId = null;
    renderAt("/standings");

    expect(screen.getByText(/No league selected/i)).toBeInTheDocument();
  });

  it("renders a league table and highlights the signed-in manager", async () => {
    vi.mocked(getLeagueName).mockResolvedValue("Family League");
    vi.mocked(getLeagueStandings).mockResolvedValue([
      {
        userId: "mom",
        username: "mom",
        avatarUrl: null,
        teamName: "Mom's XI",
        isDraftComplete: true,
        gameweekPoints: 40,
        totalPoints: 120,
        rank: 1,
        previousRank: 1,
      },
      {
        userId: "me",
        username: "danny",
        avatarUrl: null,
        teamName: "Danny FC",
        isDraftComplete: false,
        gameweekPoints: 20,
        totalPoints: 90,
        rank: 2,
        previousRank: 2,
      },
    ]);
    mockCurrentLeagueId = 3;
    renderAt("/standings");

    expect(await screen.findByText("Family League")).toBeInTheDocument();
    expect(getLeagueStandings).toHaveBeenCalledWith(3);

    const myRow = screen.getByText("Danny FC").closest("tr");
    expect(myRow).toHaveClass("standings-table__row--you");
    expect(myRow).toHaveTextContent("YOU");
    expect(myRow).toHaveTextContent("Drafting");
    expect(screen.getByText("Mom's XI").closest("tr")).not.toHaveClass(
      "standings-table__row--you",
    );
  });

  it("says no gameweeks are scored instead of a table of zeros", async () => {
    vi.mocked(getLeagueName).mockResolvedValue("New League");
    vi.mocked(getLeagueStandings).mockResolvedValue([
      {
        userId: "me",
        username: "danny",
        avatarUrl: null,
        teamName: "Danny FC",
        isDraftComplete: true,
        gameweekPoints: 0,
        totalPoints: 0,
        rank: 1,
        previousRank: null,
      },
    ]);
    mockCurrentLeagueId = 4;
    renderAt("/standings");

    expect(await screen.findByText("No gameweeks scored yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("explains that only the starting XI scores once there are points", async () => {
    vi.mocked(getLeagueName).mockResolvedValue("Family League");
    vi.mocked(getLeagueStandings).mockResolvedValue([
      {
        userId: "me",
        username: "danny",
        avatarUrl: null,
        teamName: "Danny FC",
        isDraftComplete: true,
        gameweekPoints: 12,
        totalPoints: 30,
        rank: 1,
        previousRank: 1,
      },
    ]);
    mockCurrentLeagueId = 3;
    renderAt("/standings");

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText(/Only your starting XI scores/)).toBeInTheDocument();
    expect(screen.queryByText("No gameweeks scored yet")).not.toBeInTheDocument();
  });

  it("shows the error when the user is not a member", async () => {
    vi.mocked(getLeagueName).mockResolvedValue("Secret League");
    vi.mocked(getLeagueStandings).mockRejectedValue(
      new Error("You are not a member of this league."),
    );
    mockCurrentLeagueId = 99;
    renderAt("/standings");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are not a member of this league.",
    );
  });

  it("sorts by gameweek points, toggling descending then ascending", async () => {
    vi.mocked(getLeagueName).mockResolvedValue("Family League");
    vi.mocked(getLeagueStandings).mockResolvedValue([
      {
        userId: "mom",
        username: "mom",
        avatarUrl: null,
        teamName: "Mom's XI",
        isDraftComplete: true,
        gameweekPoints: 40,
        totalPoints: 120,
        rank: 1,
        previousRank: 1,
      },
      {
        userId: "danny",
        username: "danny",
        avatarUrl: null,
        teamName: "Danny FC",
        isDraftComplete: true,
        gameweekPoints: 20,
        totalPoints: 90,
        rank: 2,
        previousRank: 2,
      },
    ]);
    mockCurrentLeagueId = 3;
    renderAt("/standings");

    await screen.findByText("Family League");

    const gwHeader = screen.getByRole("button", { name: /GW/i });

    fireEvent.click(gwHeader); // first click: desc (highest first)
    let rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Mom's XI");

    fireEvent.click(gwHeader); // second click: asc (lowest first)
    rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Danny FC");
  });

  it("sorts by total points independently of the gameweek column", async () => {
    vi.mocked(getLeagueName).mockResolvedValue("Family League");
    vi.mocked(getLeagueStandings).mockResolvedValue([
      {
        userId: "mom",
        username: "mom",
        avatarUrl: null,
        teamName: "Mom's XI",
        isDraftComplete: true,
        gameweekPoints: 40,
        totalPoints: 90,
        rank: 1,
        previousRank: 1,
      },
      {
        userId: "danny",
        username: "danny",
        avatarUrl: null,
        teamName: "Danny FC",
        isDraftComplete: true,
        gameweekPoints: 20,
        totalPoints: 120,
        rank: 2,
        previousRank: 2,
      },
    ]);
    mockCurrentLeagueId = 3;
    renderAt("/standings");

    await screen.findByText("Family League");

    const totalHeader = screen.getByRole("button", { name: /Total/i });

    fireEvent.click(totalHeader); // desc: Danny FC (120) first
    let rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Danny FC");

    fireEvent.click(totalHeader); // asc: Mom's XI (90) first
    rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Mom's XI");
  });
});
