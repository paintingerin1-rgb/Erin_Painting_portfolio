import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import JoinLeaguePage from "./JoinLeaguePage";
import { getMyLeagues, joinByCode, listCompetitions, listPublicLeagues } from "./leaguesApi";

vi.mock("./leaguesApi", () => ({
  getMyLeagues: vi.fn(),
  joinByCode: vi.fn(),
  joinPublicLeague: vi.fn(),
  listCompetitions: vi.fn(),
  listPublicLeagues: vi.fn(),
}));

const refreshLeagues = vi.fn();
vi.mock("../../contexts/CurrentLeagueContext", () => ({
  useCurrentLeague: () => ({ refreshLeagues }),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
  useNavigate: () => mockNavigate,
}));

// Public league rows have Join buttons too, so find the code form's own.
function codeFormButton() {
  const form = screen.getByRole("textbox", { name: "Join code" }).closest("form")!;
  return within(form).getByRole("button", { name: "Join" });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <JoinLeaguePage />
    </MemoryRouter>,
  );
}

describe("JoinLeaguePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listPublicLeagues).mockResolvedValue([
      { id: 1, name: "Thunder Derby FL", competitionId: 2 },
      { id: 2, name: "Velvet Society League", competitionId: 1 },
    ]);
    vi.mocked(getMyLeagues).mockResolvedValue([]);
    vi.mocked(listCompetitions).mockResolvedValue([
      { id: 1, name: "English Premier League", code: "PL", country: "England" },
      { id: 2, name: "LaLiga", code: "PD", country: "Spain" },
    ] as Awaited<ReturnType<typeof listCompetitions>>);
  });
  afterEach(cleanup);

  it("shows the join code form without waiting for the public leagues", () => {
    vi.mocked(listPublicLeagues).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("heading", { name: "Have a code?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Join code" })).toBeInTheDocument();
  });

  it("filters the public leagues by name or competition", async () => {
    renderPage();
    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("LaLiga")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search public leagues" });
    fireEvent.change(search, { target: { value: "laliga" } });
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Thunder Derby FL")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 leagues match")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nothing like this" } });
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(/No public leagues match/)).toBeInTheDocument();
  });

  it("joins by code and goes back to your leagues", async () => {
    vi.mocked(joinByCode).mockResolvedValue(7);
    renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: "Join code" }), {
      target: { value: " jnsxxh " },
    });
    fireEvent.click(codeFormButton());

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(joinByCode).toHaveBeenCalledWith("jnsxxh");
    expect(refreshLeagues).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith("/leagues", {
      state: { toast: { message: "Joined league." } },
    });
  });

  it("says why a code didn't work", async () => {
    vi.mocked(joinByCode).mockRejectedValue(new Error("No league has that join code."));
    renderPage();
    fireEvent.change(screen.getByRole("textbox", { name: "Join code" }), {
      target: { value: "WRONG1" },
    });
    fireEvent.click(codeFormButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("No league has that join code.");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
