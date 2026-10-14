import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeagueSwitcher from "./LeagueSwitcher";
import type { MyLeague } from "../../features/leagues/leaguesApi";

const setLeagueId = vi.fn();
let mockState: {
  leagues: MyLeague[];
  currentLeagueId: number | null;
  isLoading: boolean;
};

vi.mock("../../contexts/CurrentLeagueContext", () => ({
  useCurrentLeague: () => ({ ...mockState, setLeagueId }),
}));

const LEAGUES: MyLeague[] = [
  {
    id: 1,
    name: "sham_city",
    visibility: "PRIVATE",
    role: "COMMISSIONER",
    competitionId: 1,
    competitionCode: "PL",
    competitionName: "English Premier League",
  },
  {
    id: 2,
    name: "Kasi Legends",
    visibility: "PUBLIC",
    role: "REGULAR",
    competitionId: 9,
    competitionCode: "PSL",
    competitionName: "Betway Premiership",
  },
];

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <LeagueSwitcher />
    </MemoryRouter>,
  );
}

describe("LeagueSwitcher", () => {
  beforeEach(() => {
    setLeagueId.mockClear();
    mockState = { leagues: LEAGUES, currentLeagueId: 1, isLoading: false };
  });
  afterEach(cleanup);

  it("shows the current league with its competition", () => {
    renderSwitcher();
    const card = screen.getByRole("combobox");
    expect(card).toHaveTextContent("sham_city");
    expect(card).toHaveTextContent("Premier League");
    expect(card).toHaveTextContent("PL");
    expect(card).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Switch league")).toBeInTheDocument();
  });

  it("opens a list of every league, with the current one selected", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("combobox"));

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveTextContent("Private · Commissioner");
    expect(options[0]).toHaveTextContent("PL");
    expect(options[1]).toHaveTextContent("Public");
    expect(options[1]).not.toHaveTextContent("Commissioner");
  });

  it("switches league on click and closes", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Kasi Legends"));

    expect(setLeagueId).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("can be driven with the keyboard", () => {
    renderSwitcher();
    const card = screen.getByRole("combobox");
    fireEvent.keyDown(card, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(card, { key: "ArrowDown" });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(setLeagueId).toHaveBeenCalledWith(2);
  });

  it("closes on Escape and on a click outside, without switching", () => {
    renderSwitcher();
    const card = screen.getByRole("combobox");

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(card);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(setLeagueId).not.toHaveBeenCalled();
  });

  it("only lists leagues, with no create or join links (the Leagues page has those)", () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a loading card while leagues load, and nothing when there are none", () => {
    mockState = { leagues: [], currentLeagueId: null, isLoading: true };
    const { unmount } = renderSwitcher();
    expect(screen.getByText("Loading leagues…")).toBeInTheDocument();
    unmount();

    mockState = { leagues: [], currentLeagueId: null, isLoading: false };
    const { container } = renderSwitcher();
    expect(container).toBeEmptyDOMElement();
  });
});
