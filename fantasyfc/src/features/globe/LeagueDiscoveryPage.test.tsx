import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LeagueDiscoveryPage from "./LeagueDiscoveryPage";
import { supportsWebGL } from "./webgl";

// jsdom has no WebGL, so these tests cover the plain-list fallback. The globe
// itself needs a real browser.
vi.mock("./webgl", () => ({ supportsWebGL: vi.fn(() => false) }));

function renderPage() {
  return render(
    <MemoryRouter>
      <LeagueDiscoveryPage />
    </MemoryRouter>,
  );
}

describe("LeagueDiscoveryPage without WebGL", () => {
  beforeEach(() => {
    vi.mocked(supportsWebGL).mockReturnValue(false);
  });

  // Vitest globals are off here, so Testing Library can't clean up by itself.
  afterEach(cleanup);

  it("lists every league on the globe", () => {
    renderPage();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });

  it("lets you join or create in any league, with its competition preselected", () => {
    renderPage();
    const row = screen.getByText("Premier League").closest("li")!;
    expect(within(row).getByRole("link", { name: "Join" })).toHaveAttribute(
      "href",
      "/leagues/join",
    );
    expect(within(row).getByRole("link", { name: "Create" })).toHaveAttribute(
      "href",
      "/leagues/create?competition=PL",
    );
    const eredivisie = screen.getByText("Eredivisie").closest("li")!;
    expect(within(eredivisie).getByRole("link", { name: "Create" })).toHaveAttribute(
      "href",
      "/leagues/create?competition=DED",
    );
  });

  it("shows no league as coming soon", () => {
    renderPage();
    expect(screen.queryByText("Coming soon")).toBeNull();
  });
});

describe("supportsWebGL", () => {
  it("is false when the browser can't create a WebGL context", async () => {
    const real = await vi.importActual<typeof import("./webgl")>("./webgl");
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(null);
    expect(real.supportsWebGL()).toBe(false);
    getContext.mockRestore();
  });
});
