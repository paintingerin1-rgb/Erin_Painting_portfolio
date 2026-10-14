import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getMyLeagues,
  joinPublicLeague,
  listCompetitions,
  listPublicLeagues,
  type PublicLeague,
} from "./leaguesApi";
import { JoinByCodeForm } from "./JoinByCodeForm";
import { filterPublicLeagues } from "./joinSearch";
import "./leagues.css";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";

export default function JoinLeaguePage() {
  const navigate = useNavigate();
  const { refreshLeagues } = useCurrentLeague();

  const [publicLeagues, setPublicLeagues] = useState<PublicLeague[] | null>(null);
  const [competitionNames, setCompetitionNames] = useState<Map<number, string>>(new Map());
  const [myLeagueIds, setMyLeagueIds] = useState<Set<number>>(new Set());
  const [listError, setListError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPublicLeagues(), getMyLeagues(), listCompetitions()])
      .then(([leagues, mine, competitions]) => {
        if (cancelled) return;
        setPublicLeagues(leagues);
        setMyLeagueIds(new Set(mine.map((l) => l.id)));
        setCompetitionNames(new Map(competitions.map((c) => [c.id, c.name])));
      })
      .catch((err) => {
        if (!cancelled) setListError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleLeagues = useMemo(
    () => (publicLeagues ? filterPublicLeagues(publicLeagues, query, competitionNames) : []),
    [publicLeagues, query, competitionNames],
  );

  const goToHubWithToast = (message: string) => {
    navigate("/leagues", { state: { toast: { message } } });
  };

  const handleJoinPublic = async (league: PublicLeague) => {
    setJoiningId(league.id);
    setListError(null);
    try {
      await joinPublicLeague(league.id);
      await refreshLeagues();
      goToHubWithToast(`Joined ${league.name}.`);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : "Couldn't join that league.",
      );
      setJoiningId(null);
    }
  };

  return (
    <div className="leagues-page">
      <main className="leagues-main leagues-main--join">
        <Link to="/leagues" className="leagues-back-link">
          ← Back to your leagues
        </Link>
        <h1 className="leagues-form-title">Join a League</h1>

        <div className="leagues-join-layout">
          {/*
            First in the markup so it sits above the list on a phone, where
            scrolling past every public league to reach it was the problem.
          */}
          <aside className="leagues-join-code-panel" aria-labelledby="join-code-heading">
            <h2 id="join-code-heading" className="leagues-join-code-panel__title">
              Have a code?
            </h2>
            <p className="leagues-join-code-panel__sub">
              Private leagues are joined with the 6 character code their commissioner shares.
            </p>
            <JoinByCodeForm onJoined={() => goToHubWithToast("Joined league.")} />
          </aside>

          <section className="leagues-join-public" aria-labelledby="public-leagues-heading">
            <h2 id="public-leagues-heading" className="leagues-join-section-title">
              Public leagues
            </h2>

            <input
              className="leagues-field__input leagues-join-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by league or competition"
              aria-label="Search public leagues"
            />

            {listError && <div className="leagues-error">{listError}</div>}

            {publicLeagues === null && !listError && (
              <div className="leagues-loading">Loading public leagues…</div>
            )}

            {publicLeagues !== null && publicLeagues.length === 0 && (
              <div className="leagues-empty-list">No public leagues yet.</div>
            )}

            {publicLeagues !== null && publicLeagues.length > 0 && (
              <>
                <p className="leagues-join-count" aria-live="polite">
                  {query.trim()
                    ? `${visibleLeagues.length} of ${publicLeagues.length} leagues match`
                    : `${publicLeagues.length} leagues`}
                </p>
                {visibleLeagues.length === 0 ? (
                  <div className="leagues-empty-list">No public leagues match “{query.trim()}”.</div>
                ) : (
                  <ul className="leagues-list">
                    {visibleLeagues.map((league) => {
                      const alreadyJoined = myLeagueIds.has(league.id);
                      const competition = competitionNames.get(league.competitionId);
                      return (
                        <li key={league.id} className="league-row league-row--static">
                          <span className="league-row__text">
                            <span className="league-row__name">{league.name}</span>
                            {competition && (
                              <span className="league-row__competition">{competition}</span>
                            )}
                          </span>
                          {alreadyJoined ? (
                            <span className="leagues-joined-pill">Joined</span>
                          ) : (
                            <button
                              type="button"
                              className="leagues-join-btn"
                              disabled={joiningId === league.id}
                              onClick={() => handleJoinPublic(league)}
                            >
                              {joiningId === league.id ? "Joining…" : "Join"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
