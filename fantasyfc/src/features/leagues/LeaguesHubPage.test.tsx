import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LeaguesHubPage from "./LeaguesHubPage";
import { getMyLeagues } from "./leaguesApi";

vi.mock("./leaguesApi", () => ({
  getMyLeagues: vi.fn(),
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

describe("LeaguesHubPage", () => {
  beforeEach(() => {
    mockCurrentLeagueId = null;
    mockIsLeagueLoading = false;
    vi.resetAllMocks();
  });
  afterEach(cleanup);

  it("renders empty state when no leagues exist", async () => {
    vi.mocked(getMyLeagues).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <LeaguesHubPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Loading your leagues/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText(/You're not in any leagues yet/i),
      ).toBeInTheDocument();
    });
  });

  it("renders populated state with leagues", async () => {
    vi.mocked(getMyLeagues).mockResolvedValue([
      {
        id: 1,
        name: "Alpha League",
        visibility: "PUBLIC",
        role: "COMMISSIONER",
        competitionId: 1,
      },
    ]);
    render(
      <MemoryRouter>
        <LeaguesHubPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha League")).toBeInTheDocument();
      expect(screen.getByText("PUBLIC")).toBeInTheDocument();
    });
  });

  it("creates a league from the globe, with Join as the only other option", async () => {
    vi.mocked(getMyLeagues).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <LeaguesHubPage />
      </MemoryRouter>
    );

    const create = await screen.findByRole("link", { name: "Create a League" });
    expect(create).toHaveAttribute("href", "/leagues/discover");
    expect(screen.getByRole("link", { name: "Join a League" })).toHaveAttribute("href", "/leagues/join");
    expect(screen.queryByRole("link", { name: /explore the globe/i })).not.toBeInTheDocument();
  });

  it("does the same under the leagues list", async () => {
    vi.mocked(getMyLeagues).mockResolvedValue([
      { id: 1, name: "Alpha League", visibility: "PUBLIC", role: "COMMISSIONER", competitionId: 1 },
    ]);
    render(
      <MemoryRouter>
        <LeaguesHubPage />
      </MemoryRouter>
    );

    const create = await screen.findByRole("link", { name: "Create a League" });
    expect(create).toHaveAttribute("href", "/leagues/discover");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
