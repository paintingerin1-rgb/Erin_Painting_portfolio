import { lazy, Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabaseClient";
import { signOut } from "./lib/auth";
import { describeError } from "./lib/dataAccess";
import LoginPage from "./features/auth/LoginPage";
import LeaguesHubPage from "./features/leagues/LeaguesHubPage";
import LeagueDetailsPage from "./features/leagues/LeagueDetailsPage";
import CreateLeaguePage from "./features/leagues/CreateLeaguePage";
import JoinLeaguePage from "./features/leagues/JoinLeaguePage";
import AppLayout from "./components/AppLayout/AppLayout";
import SessionRequired from "./components/SessionRequired/SessionRequired";
import { CurrentLeagueProvider } from "./contexts/CurrentLeagueContext";
import DraftPage from "./features/draft/DraftPage";
import SquadPage from "./features/squad/SquadPage";
import MessagesPage from "./features/messages/MessagesPage";
import PlayersPage from "./features/players/PlayersPage";
import StandingsPage from "./features/standings/StandingsPage";
import DashboardPage from "./features/dashboard/DashboardPage";
import MatchCenterPage from "./features/matchCenter/MatchCenterPage";

// The globe pulls in three.js and a world map, so it gets its own chunk
// instead of weighing down every other page.
const LeagueDiscoveryPage = lazy(
  () => import("./features/globe/LeagueDiscoveryPage"),
);

// Dev-only escape hatch: set VITE_SKIP_AUTH=true in your local .env to work
// on frontend routes without a working login flow. Defaults to off so this
// never changes behavior for anyone who doesn't set it. Must be false when
// demoing - it bypasses the real login.
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === "true";

interface Profile {
  username: string;
  avatar_url: string | null;
}

export default function AppRoutes() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!SKIP_AUTH);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (SKIP_AUTH) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from("profile")
      .select("username, avatar_url")
      // RLS also exposes profiles of users sharing a league, so filter to
      // our own row or .single() fails as soon as anyone else joins.
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error(describeError(error, "your profile"));
          return;
        }
        setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p>Loading...</p>;

  const isAuthed = SKIP_AUTH || !!session;

  return (
    <Routes>
      <Route
        path="/"
        element={isAuthed ? <Navigate to="/leagues" replace /> : <LoginPage />}
      />

      {/* Every signed-in page renders inside the shared shell: one sidebar,
          one backdrop, page content in the outlet. */}
      <Route
        element={
          isAuthed ? (
            <CurrentLeagueProvider>
              <AppLayout
                userName={profile?.username ?? "Manager"}
                userMeta={session?.user?.email ?? ""}
                onSignOut={handleSignOut}
              />
            </CurrentLeagueProvider>
          ) : (
            <Navigate to="/" replace />
          )
        }
      >
        {/* Live, backed by Supabase. SKIP_AUTH is enough to get into the
            shell and click around, but not to query real data:
            every RLS policy is scoped `to authenticated`, so without a
            session these return zero rows rather than failing loudly. */}
        <Route
          path="/leagues"
          element={session ? <LeaguesHubPage /> : <SessionRequired />}
        />
        {/* League discovery globe (#30) */}
        <Route
          path="/leagues/discover"
          element={
            <Suspense fallback={<p className="leagues-loading">Loading the globe…</p>}>
              <LeagueDiscoveryPage />
            </Suspense>
          }
        />
        <Route
          path="/leagues/:id"
          element={session ? <LeagueDetailsPage /> : <SessionRequired />}
        />
        <Route
          path="/leagues/create"
          element={session ? <CreateLeaguePage /> : <SessionRequired />}
        />
        <Route
          path="/leagues/join"
          element={session ? <JoinLeaguePage /> : <SessionRequired />}
        />
        {/* Squad Management*/}
        <Route
          path="/squad"
          element={session ? <SquadPage /> : <SessionRequired />}
        />
        {/* Sprint 2 Flagship Feature */}
        <Route
          path="/draft"
          element={session ? <DraftPage /> : <SessionRequired />}
        />
        {/* wired to the real football_players table */}
        <Route
          path="/players"
          element={session ? <PlayersPage /> : <SessionRequired />}
        />
        <Route
          path="/dashboard"
          element={session ? <DashboardPage /> : <SessionRequired />}
        />

        {/* League chat (S2-14) */}
        <Route
          path="/messages"
          element={session ? <MessagesPage /> : <SessionRequired />}
        />

        {/* sprint 2 match center feature*/}
        <Route
          path="/match-center"
          element={session ? <MatchCenterPage /> : <SessionRequired />}
        />

        {/* League tables, scored from player_gameweek_points */}
        <Route
          path="/standings"
          element={session ? <StandingsPage /> : <SessionRequired />}
        />



      </Route>

      {/* Anything unrecognised goes somewhere real instead of rendering
          nothing and logging "No routes matched location". */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
