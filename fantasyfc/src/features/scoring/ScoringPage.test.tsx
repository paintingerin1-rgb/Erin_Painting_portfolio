import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ScoringPage from "./ScoringPage";
import { GAMEWEEK_5 } from "../../data/gameweek5";

describe("ScoringPage", () => {
  afterEach(cleanup);

  it("reports every real gameweek 5 player matching FPL's published score", () => {
    render(<ScoringPage />);
    expect(screen.getByRole("status")).toHaveTextContent(
      `${GAMEWEEK_5.length} of ${GAMEWEEK_5.length} players match`,
    );
  });

  it("shows the rule-by-rule breakdown for the player you pick", () => {
    render(<ScoringPage />);
    fireEvent.click(screen.getByRole("button", { name: /Brobbey/ }));
    expect(screen.getByRole("heading", { name: "How Brobbey got 17" })).toBeInTheDocument();
    expect(screen.getByText("Goals (3)")).toBeInTheDocument();
  });
});
