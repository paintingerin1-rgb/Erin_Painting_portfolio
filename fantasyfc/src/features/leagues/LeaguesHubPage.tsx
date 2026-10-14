import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getMyLeagues, leaveLeague, type MyLeague } from "./leaguesApi";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import "./leagues.css";

interface ToastState {
  message: string;
  joinCode?: string;
}

export default function LeaguesHubPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshLeagues } = useCurrentLeague();

  const [leagues, setLeagues] = useState<MyLeague[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(
    (location.state as { toast?: ToastState } | null)?.toast ?? null,
  );

  useEffect(() => {
    // Clear the router-state toast payload so it doesn't reappear on a
    // back/forward navigation - the state on screen (`toast`) already has it.
    if (location.state) {
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMyLeagues()
      .then((data) => {
        if (!cancelled) setLeagues(data);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="leagues-page">
      <main className="leagues-main">
        {toast && (
          <div className="leagues-toast">
            <span>{toast.message}</span>
            {toast.joinCode && (
              <span>
                {" "}
                Join code:{" "}
                <span className="leagues-toast__code">{toast.joinCode}</span>
              </span>
            )}
            <button
              type="button"
              className="leagues-toast__dismiss"
              onClick={() => setToast(null)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {loadError && <div className="leagues-error">{loadError}</div>}

        {leagues === null && !loadError && (
          <div className="leagues-loading">Loading your leagues…</div>
        )}

        {leagues !== null && leagues.length === 0 && (
          <div className="leagues-empty">
            <h1 className="leagues-empty__title">
              You're not in any leagues yet
            </h1>
            <p className="leagues-empty__subtitle">
              Create a league to invite friends, or join one that's already
              running.
            </p>
            {/* Creating a league starts on the globe: you pick the competition
                there, then name the league. */}
            <div className="leagues-ctas">
              <Link to="/leagues/discover" className="leagues-cta leagues-cta--primary">
                Create a League
              </Link>
              <Link to="/leagues/join" className="leagues-cta leagues-cta--secondary">
                Join a League
              </Link>
            </div>
          </div>
        )}

        {leagues !== null && leagues.length > 0 && (
          <>
            <h2 className="leagues-list-heading">Your Leagues</h2>
            <ul className="leagues-list">
              {leagues.map((league) => (
                <li key={league.id} className="league-row-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    className="league-row"
                    onClick={() => navigate(`/leagues/${league.id}`)}
                    style={{ flexGrow: 1 }}
                  >
                    <span className="league-row__name">{league.name}</span>
                    <span
                      className={`league-row__badge league-row__badge--${league.visibility.toLowerCase()}`}
                    >
                      {league.visibility}
                    </span>
                  </button>
                  <button 
                    type="button" 
                    className="leagues-cta leagues-cta--secondary leagues-cta--compact"
                    style={{ backgroundColor: '#ff4d4f', color: '#fff', border: 'none' }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Are you sure you want to leave ${league.name}?`)) {
                        try {
                          await leaveLeague(league.id);
                          await refreshLeagues();
                          setLeagues(leagues.filter(l => l.id !== league.id));
                          setToast({ message: `Successfully left ${league.name}` });
                        } catch (err) {
                          alert(err instanceof Error ? err.message : "Error leaving league");
                        }
                      }
                    }}
                  >
                    Leave
                  </button>
                </li>
              ))}
            </ul>

            <div className="leagues-ctas leagues-ctas--split">
              <Link to="/leagues/discover" className="leagues-cta leagues-cta--primary">
                Create a League
              </Link>
              <Link to="/leagues/join" className="leagues-cta leagues-cta--secondary">
                Join a League
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
