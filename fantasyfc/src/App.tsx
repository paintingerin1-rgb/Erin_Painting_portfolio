import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout/Layout";
import PlayersPage from "./features/players/PlayersPage";
import MatchCenterPage from "./features/matchCenter/MatchCenterPage";
import StandingsPage from "./features/standings/StandingsPage";
import ScoringPage from "./features/scoring/ScoringPage";

// Every page renders inside one shared layout (sidebar + content), so only
// the content swaps on navigation. Unknown URLs redirect rather than render
// a blank screen.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/players" replace />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/match-center" element={<MatchCenterPage />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/scoring" element={<ScoringPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/players" replace />} />
    </Routes>
  );
}
