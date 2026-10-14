import { useEffect, useState } from "react";
import "./MatchCenterPage.css";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import FixtureRow from "../../components/FixtureRow/FixtureRow";
import {
  getFixtures,
  type FixtureRow as Fixture,
  type FixtureStatus,
} from "./matchCenterApi";

const TABS: { label: string; value: FixtureStatus }[] = [
  { label: "Live", value: "LIVE" },
  { label: "Upcoming", value: "SCHEDULED" },
  { label: "Completed", value: "FINISHED" },
];

export default function MatchCenterPage() {
  // The current league's competition; the Premier League when there's none.
  const { currentCompetitionId } = useCurrentLeague();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FixtureStatus>("LIVE");

  useEffect(() => {
    let cancelled = false;

    async function loadFixtures() {
      setLoading(true);
      setError(null);
      try {
        const rows = await getFixtures(currentCompetitionId);
        if (cancelled) return;
        setFixtures(rows);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setFixtures([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFixtures();
    return () => {
      cancelled = true;
    };
  }, [currentCompetitionId]);

  const counts: Record<FixtureStatus, number> = {
    LIVE: 0,
    SCHEDULED: 0,
    FINISHED: 0,
  };
  for (const f of fixtures) counts[f.status] += 1;

  const visible = fixtures.filter((f) => f.status === tab);
  // Fixtures arrive oldest kickoff first; Completed reads better newest first.
  if (tab === "FINISHED") visible.reverse();

  // Group by gameweek, keeping the order above. Fixtures with no gameweek
  // yet go in a trailing "Unscheduled" group.
  const groups: { label: string; fixtures: Fixture[] }[] = [];
  const unscheduled: Fixture[] = [];
  for (const f of visible) {
    if (f.gameweek_number === null) {
      unscheduled.push(f);
      continue;
    }
    const label = `Gameweek ${f.gameweek_number}`;
    const group = groups.find((g) => g.label === label);
    if (group) group.fixtures.push(f);
    else groups.push({ label, fixtures: [f] });
  }
  if (unscheduled.length > 0) {
    groups.push({ label: "Unscheduled", fixtures: unscheduled });
  }

  return (
    <div className="match-center">
      <main className="match-center__main">
        <div className="match-center__header">
          <div>
            <p className="match-center__eyebrow">Match Center</p>
            <h1 className="match-center__title">Fixtures</h1>
          </div>
        </div>

        <div className="match-tabs">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`match-tab${tab === t.value ? " match-tab--active" : ""}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
              <span className="match-tab__count">{counts[t.value]}</span>
            </button>
          ))}
        </div>

        {error && <p className="match-center__empty">{error}</p>}

        {!error && loading ? (
          <p className="match-center__empty">Loading fixtures…</p>
        ) : (
          !error && (
            <div className="panel">
              {visible.length === 0 ? (
                <p className="match-center__empty">
                  No {TABS.find((t) => t.value === tab)?.label.toLowerCase()}{" "}
                  fixtures.
                </p>
              ) : (
                <div className="fixtures-list">
                  {groups.map(({ label, fixtures: gwFixtures }) => (
                    <div key={label} style={{ marginBottom: "24px" }}>
                      <h2
                        style={{
                          fontSize: "1.2rem",
                          marginBottom: "16px",
                          color: "#fff",
                          borderBottom: "1px solid rgba(255,255,255,0.1)",
                          paddingBottom: "8px",
                        }}
                      >
                        {label}
                      </h2>
                      {gwFixtures.map((f) => (
                        <div className="fixture" key={f.id}>
                          <FixtureRow fixture={f} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </main>
    </div>
  );
}
