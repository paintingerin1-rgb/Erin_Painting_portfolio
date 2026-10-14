import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FixtureRow from "./FixtureRow";
import type { FixtureRow as Fixture } from "../../features/matchCenter/matchCenterApi";

function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    gameweek_number: 7,
    kickoff_at: "2026-10-17T14:00:00Z",
    status: "FINISHED",
    home_team: "Fulham",
    away_team: "Man United",
    home_score: 2,
    away_score: 1,
    ...over,
  };
}

describe("FixtureRow", () => {
  // Vitest globals are off here, so Testing Library can't clean up by itself.
  afterEach(cleanup);

  it("shows a finished match as a centred score with a dot by each team", () => {
    const { container } = render(<FixtureRow fixture={fixture()} />);
    expect(screen.getByLabelText("Fulham 2 – 1 Man United")).toBeInTheDocument();
    expect(container.querySelector(".frow__centre")).toHaveTextContent("2 – 1");
    expect(screen.getByRole("img", { name: "Fulham: Won" })).toHaveAttribute("data-result", "won");
    expect(screen.getByRole("img", { name: "Man United: Lost" })).toHaveAttribute(
      "data-result",
      "lost",
    );
  });

  it("shows grey dots for both teams after a draw", () => {
    render(<FixtureRow fixture={fixture({ home_score: 1, away_score: 1 })} />);
    expect(screen.getAllByRole("img").map((d) => d.dataset.result)).toEqual(["drawn", "drawn"]);
  });

  it("centres an upcoming match on vs, with no dots", () => {
    const { container } = render(
      <FixtureRow fixture={fixture({ status: "SCHEDULED", home_score: null, away_score: null })} />,
    );
    expect(container.querySelector(".frow__centre")).toHaveTextContent("vs");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });

  it("marks a live match once, with the score but no result dots", () => {
    render(<FixtureRow fixture={fixture({ status: "LIVE" })} />);
    expect(screen.getAllByText("Live")).toHaveLength(1);
    expect(screen.getByLabelText("Fulham 2 – 1 Man United")).toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
  });
});
