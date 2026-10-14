import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import "./DashboardPage.css";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import {
  getUpcomingGameweek,
  type CurrentGameweek,
} from "../standings/standingsApi";
import { getFixtures, type FixtureRow as Fixture } from "../matchCenter/matchCenterApi";
import { formatCountdown, formatKickoff } from "../../lib/dateFormat";
import FixtureRow from "../../components/FixtureRow/FixtureRow";
import {
  getDraftCount,
  getLatestMessages,
  getLeagueSnapshot,
  type LatestMessage,
  type LeagueSnapshot,
} from "./dashboardApi";

export default function DashboardPage() {
  const navigate = useNavigate();
  const {
    currentLeagueId,
    currentCompetitionId,
    currentTeam,
    leagues,
    isLoading: isLeagueLoading,
  } = useCurrentLeague();

  const [gameweek, setGameweek] = useState<CurrentGameweek | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [latestMessages, setLatestMessages] = useState<LatestMessage[]>([]);
  const [leagueSnapshot, setLeagueSnapshot] = useState<LeagueSnapshot | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  // Re-rendered every second so the countdown actually counts down.
  const [now, setNow] = useState(() => Date.now());

  const activeLeague = leagues.find((l) => l.id === currentLeagueId);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!currentLeagueId || !currentTeam) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const [gw, allFixtures, count, messages, snapshot] = await Promise.all([
          getUpcomingGameweek(currentCompetitionId),
          getFixtures(currentCompetitionId),
          getDraftCount(currentTeam.id),
          getLatestMessages(currentLeagueId),
          getLeagueSnapshot(currentLeagueId),
        ]);

        if (cancelled) return;

        setGameweek(gw);
        setFixtures(
          allFixtures.filter((f) => f.status === "SCHEDULED").slice(0, 5),
        );
        setDraftCount(count);
        setLatestMessages(messages);
        setLeagueSnapshot(snapshot);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [currentLeagueId, currentCompetitionId, currentTeam]);

  // Only tick while there's a deadline on screen to count towards.
  useEffect(() => {
    if (!gameweek) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gameweek]);

  if (isLeagueLoading || loading) {
    return <p className="dashboard__status">Loading your dashboard…</p>;
  }

  if (!currentLeagueId || !currentTeam || !activeLeague) {
    return (
      <div className="dashboard__status">
        <h2>Welcome to FantasyFC!</h2>
        <p>
          Please select a league from the sidebar or create a new one to get
          started.
        </p>
      </div>
    );
  }

  return (
    <div className="dashboard__main">
      <div className="dashboard__header">
        <div>
          <p className="dashboard__eyebrow">
            {gameweek ? `Gameweek ${gameweek.number}` : "Gameweek TBC"}
          </p>
          <h1 className="dashboard__title">{currentTeam.team_name}</h1>
        </div>
        <div className="dashboard__budget-badge">
          Budget: £{currentTeam.remaining_budget.toFixed(1)}m
        </div>
      </div>
      <div className="dashboard__pitch-divider" />

      <section className="dashboard__content-grid">
        {/* Gameweek countdown */}
        <div className="panel dashboard-card">
          <div className="panel__header">
            <h2 className="panel__title">Gameweek begins in</h2>
          </div>
          <div className="dashboard-card__body">
            {gameweek ? (
              <>
                <div className="dashboard-card__big-stat dashboard-card__countdown">
                  {formatCountdown(gameweek.deadlineAt, now)}
                </div>
                <p className="dashboard-card__sub-stat">
                  Deadline{" "}
                  {formatKickoff(gameweek.deadlineAt, { fallback: "TBC" })}
                </p>
              </>
            ) : (
              <p>No active gameweek</p>
            )}
          </div>
        </div>

        {/* Draft Status Card */}
        <div className="panel dashboard-card">
          <div className="panel__header">
            <h2 className="panel__title">Squad Status</h2>
          </div>
          <div className="dashboard-card__body">
            {currentTeam.is_draft_complete ? (
              <>
                <div
                  className="dashboard-card__big-stat"
                  style={{ color: "#4ade80" }}
                >
                  Squad Locked
                </div>
                <button
                  className="dashboard-card__action-btn"
                  onClick={() => navigate("/squad")}
                >
                  Manage Squad →
                </button>
              </>
            ) : (
              <>
                <div
                  className="dashboard-card__big-stat"
                  style={{ color: "#fbbf24" }}
                >
                  {draftCount} / 15 Drafted
                </div>
                <button
                  className="dashboard-card__action-btn"
                  onClick={() => navigate("/draft")}
                >
                  Continue Draft →
                </button>
              </>
            )}
          </div>
        </div>

        {/* League Snapshot Card */}
        <div className="panel dashboard-card">
          <div className="panel__header">
            <h2 className="panel__title">League Info</h2>
            <Link to={`/standings`} className="panel__view-all">
              Details →
            </Link>
          </div>
          <div className="dashboard-card__body">
            <p>
              <strong>Name:</strong> {activeLeague.name}
            </p>
            {leagueSnapshot ? (
              <>
                <p>
                  <strong>Members:</strong> {leagueSnapshot.member_count}
                </p>
                <p>
                  <strong>Join Code:</strong>{" "}
                  <span className="join-code-badge">
                    {leagueSnapshot.join_code || "N/A"}
                  </span>
                </p>
              </>
            ) : (
              <p>Loading...</p>
            )}
          </div>
        </div>

        {/* Next Fixtures Card */}
        <div className="panel dashboard-card">
          <div className="panel__header">
            <h2 className="panel__title">Upcoming Matches</h2>
            <Link to="/match-center" className="panel__view-all">
              See all →
            </Link>
          </div>
          <div className="dash-fixtures-list">
            {fixtures.length > 0 ? (
              fixtures.map((f) => (
                <div className="dash-fixture" key={f.id}>
                  <FixtureRow fixture={f} />
                </div>
              ))
            ) : (
              <p className="dash-fixtures-list__empty">No upcoming matches.</p>
            )}
          </div>
        </div>

        {/* Latest Chat Messages Card */}
        <div className="panel dashboard-card">
          <div className="panel__header">
            <h2 className="panel__title">Latest Chat</h2>
            <Link
              to="/messages"
              state={{ leagueId: currentLeagueId }}
              className="panel__view-all"
            >
              Join chat →
            </Link>
          </div>
          <div className="messages-list">
            {latestMessages.length > 0 ? (
              latestMessages.map((msg) => (
                <div className="dashboard-message" key={msg.id}>
                  <span className="dashboard-message__author">
                    {msg.author_name}:{" "}
                  </span>
                  <span className="dashboard-message__text">{msg.content}</span>
                  <div className="dashboard-message__time">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))
            ) : (
              <p>No messages yet.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
