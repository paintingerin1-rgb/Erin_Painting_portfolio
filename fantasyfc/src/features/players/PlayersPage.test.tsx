import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PlayersPage from "./PlayersPage";
import { listPlayers } from "./playersApi";
import { listCompetitions } from "../leagues/leaguesApi";

vi.mock("./playersApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./playersApi")>();
  return {
    ...actual,
    listPlayers: vi.fn(),
  };
});

vi.mock("../leagues/leaguesApi", () => ({
  listCompetitions: vi.fn(),
}));

// The current league plays in LaLiga (competition 2).
vi.mock("../../contexts/CurrentLeagueContext", () => ({
  useCurrentLeague: () => ({ currentCompetitionId: 2 }),
}));

describe("PlayersPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listCompetitions).mockResolvedValue([
      { id: 1, name: "English Premier League", code: "PL", country: "England" },
      { id: 2, name: "LaLiga", code: "PD", country: "Spain" },
    ]);
  });

  afterEach(cleanup);

  it("renders players and filters by search", async () => {
    vi.mocked(listPlayers).mockResolvedValue({
      players: [
        {
          id: 1,
          name: "Bukayo Saka",
          position: "Midfielder",
          real_team: "Arsenal",
          price: 10,
        },
      ],
      total: 1,
    });

    render(<PlayersPage />);

    await waitFor(() => {
      expect(screen.getByText("Bukayo Saka")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search players/i);
    fireEvent.change(searchInput, { target: { value: "Saka" } });

    await waitFor(() => {
      expect(listPlayers).toHaveBeenCalledWith(
        expect.objectContaining({
          search: "Saka",
        }),
      );
    });
  });

  it("starts on the current league's competition and switches with the tabs", async () => {
    vi.mocked(listPlayers).mockResolvedValue({ players: [], total: 0 });

    render(<PlayersPage />);

    await waitFor(() => {
      expect(listPlayers).toHaveBeenCalledWith(expect.objectContaining({ competitionId: 2 }));
    });
    // Never queried before knowing the competition, so leagues never mix.
    expect(listPlayers).not.toHaveBeenCalledWith(expect.objectContaining({ competitionId: undefined }));

    fireEvent.click(screen.getByRole("button", { name: "English Premier League" }));

    await waitFor(() => {
      expect(listPlayers).toHaveBeenLastCalledWith(expect.objectContaining({ competitionId: 1, page: 0 }));
    });
    expect(screen.getByRole("button", { name: "English Premier League" })).toHaveAttribute("aria-pressed", "true");
  });
});
