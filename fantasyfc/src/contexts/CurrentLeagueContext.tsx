// Current league - portfolio version.
//
// In production this is a React context: the sidebar's league switcher sets
// the selected league once, and every page (Dashboard, Players, Match Center,
// Standings, Chat) reads it from here. The demo has one league, so the hook
// returns it directly with the same shape the pages expect.

import { DEMO_LEAGUE } from "../data/sampleData";

export function useCurrentLeague() {
  return {
    currentLeagueId: DEMO_LEAGUE.id,
    currentCompetitionId: 1 as number | null,
    isLoading: false,
  };
}
