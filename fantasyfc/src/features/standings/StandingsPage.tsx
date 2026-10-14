import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  getCurrentGameweek,
  getLeagueName,
  getLeagueStandings,
  rankMovement,
  type CurrentGameweek,
  type StandingRow,
} from "./standingsApi";
import "./StandingsPage.css";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";

// The selected league is controlled via CurrentLeagueContext.
export default function StandingsPage() {
  const { currentLeagueId, currentCompetitionId, isLoading: isLeagueLoading } = useCurrentLeague();
  const [gameweek, setGameweek] = useState<CurrentGameweek | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Only a label; the page is still useful without it.
    getCurrentGameweek(currentCompetitionId ?? null)
      .then((gw) => {
        if (!cancelled) setGameweek(gw);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [currentCompetitionId]);

  return (
    <div className="standings-page">
      <main className="standings-page__main">
        {isLeagueLoading ? (
          <p className="standings-page__status">Loading standings...</p>
        ) : currentLeagueId ? (
          <LeagueStandingsDetail
            key={currentLeagueId}
            leagueId={currentLeagueId}
            gameweek={gameweek}
          />
        ) : (
          <div className="standings-empty">
            <p className="standings-empty__title">No league selected</p>
            <p className="standings-empty__body">
              Please select a league from the sidebar or create a new one to
              view its standings.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function GameweekChip({ gameweek }: { gameweek: CurrentGameweek | null }) {
  if (!gameweek) return null;
  return (
    <span className="standings-page__gw-chip">Gameweek {gameweek.number}</span>
  );
}

function Movement({
  rank,
  previousRank,
}: {
  rank: number;
  previousRank: number | null;
}) {
  const delta = rankMovement(rank, previousRank);
  if (delta === null) return null;
  if (delta > 0) {
    return (
      <span
        className="movement movement--up"
        title={`Up ${delta} this gameweek`}
      >
        ▲{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span
        className="movement movement--down"
        title={`Down ${-delta} this gameweek`}
      >
        ▼{-delta}
      </span>
    );
  }
  return (
    <span className="movement movement--same" title="No change this gameweek">
      –
    </span>
  );
}

// "i" icon next to the title that explains how points are worked out.
function ScoringTooltip() {
  return (
    <span className="scoring-tooltip" tabIndex={0}>
      <span className="scoring-tooltip__icon" aria-hidden="true">
        i
      </span>
      <span className="scoring-tooltip__panel" role="tooltip">
        Points come from official FPL scoring rules - appearance, goals,
        assists, clean sheets, saves, cards, defensive contribution and bonus -
        calculated from each player's real match stats.
      </span>
    </span>
  );
}

type SortColumn = "gameweekPoints" | "totalPoints";
type SortDirection = "asc" | "desc";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

function sortRows(rows: StandingRow[], sort: SortState | null): StandingRow[] {
  if (!sort) return rows;
  const { column, direction } = sort;
  const sorted = [...rows].sort((a, b) => a[column] - b[column]);
  return direction === "asc" ? sorted : sorted.reverse();
}

/**
 * Sortable column header. The whole cell is the button - it fills the <th>
 * and highlights on hover - so the clickable area matches what looks
 * clickable. The stacked ▲▼ shows the column is sortable even before it's
 * been used, and lights up the active direction once it has.
 */
function SortableHeader({
  label,
  column,
  sort,
  onSort,
}: {
  label: string;
  column: SortColumn;
  sort: SortState | null;
  onSort: (column: SortColumn) => void;
}) {
  const isActive = sort?.column === column;
  const direction = isActive ? sort!.direction : null;
  const ariaSort: "none" | "ascending" | "descending" =
    direction === "asc"
      ? "ascending"
      : direction === "desc"
        ? "descending"
        : "none";

  return (
    <th
      className="standings-table__center standings-table__sortable"
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={`standings-table__sort-btn${isActive ? " standings-table__sort-btn--active" : ""}`}
        onClick={() => onSort(column)}
      >
        {label}
        <span className="standings-table__arrows" aria-hidden="true">
          <span
            className={
              direction === "asc" ? "standings-table__arrow--lit" : undefined
            }
          >
            ▲
          </span>
          <span
            className={
              direction === "desc" ? "standings-table__arrow--lit" : undefined
            }
          >
            ▼
          </span>
        </span>
      </button>
    </th>
  );
}

function LeagueStandingsDetail({
  leagueId,
  gameweek,
}: {
  leagueId: number;
  gameweek: CurrentGameweek | null;
}) {
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [rows, setRows] = useState<StandingRow[] | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getLeagueStandings(leagueId),
      getLeagueName(leagueId),
      supabase.auth.getSession(),
    ])
      .then(([standings, name, { data }]) => {
        if (cancelled) return;
        setRows(standings);
        setLeagueName(name);
        setCurrentUserId(data.session?.user.id ?? null);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  // Same column again flips direction; a new column starts at desc, since
  // highest-first is what you want to see first for points.
  function handleSort(column: SortColumn) {
    setSort((prev) => {
      if (prev?.column === column) {
        return { column, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { column, direction: "desc" };
    });
  }

  const noPointsYet = rows !== null && rows.every((r) => r.totalPoints === 0);
  const displayRows = rows ? sortRows(rows, sort) : [];

  return (
    <>
      <div className="standings-page__header">
        <p className="standings-page__eyebrow">League Standings</p>
        <div className="standings-page__title-row">
          <h1 className="standings-page__title">{leagueName ?? "League"}</h1>
          <ScoringTooltip />
          <GameweekChip gameweek={gameweek} />
        </div>
      </div>

      {error ? (
        <p className="standings-page__error" role="alert">
          {error}
        </p>
      ) : rows === null ? (
        <p className="standings-page__status">Loading table…</p>
      ) : noPointsYet ? (
        // A table of zeros reads as broken; say what's happening instead.
        <div className="standings-empty">
          <p className="standings-empty__title">No gameweeks scored yet</p>
          <p className="standings-empty__body">
            Scores appear after the next gameweek deadline, once match stats are in.
          </p>
        </div>
      ) : (
        <>
          <div className="standings-table-card">
            <table className="standings-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  <SortableHeader
                    label="GW"
                    column="gameweekPoints"
                    sort={sort}
                    onSort={handleSort}
                  />
                  <SortableHeader
                    label="Total"
                    column="totalPoints"
                    sort={sort}
                    onSort={handleSort}
                  />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const isYou = r.userId === currentUserId;
                  return (
                    <tr
                      key={r.userId}
                      className={isYou ? "standings-table__row--you" : ""}
                    >
                      <td className="standings-table__rank">
                        <span>{r.rank}</span>
                        <Movement rank={r.rank} previousRank={r.previousRank} />
                      </td>
                      <td>
                        <div className="manager-cell">
                          {r.avatarUrl ? (
                            <img
                              className="manager-cell__avatar"
                              src={r.avatarUrl}
                              alt=""
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="manager-cell__avatar">
                              {r.username.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <div className="manager-cell__text">
                            <span className="manager-cell__team">
                              {r.teamName ?? "No team"}
                            </span>
                            <span
                              className={
                                isYou
                                  ? "manager-cell__name manager-cell__name--you"
                                  : "manager-cell__name"
                              }
                            >
                              {r.username}
                            </span>
                          </div>
                          {isYou && (
                            <span className="manager-cell__you-tag">YOU</span>
                          )}
                          {!r.isDraftComplete && (
                            <span
                              className="manager-cell__draft-tag"
                              title="This manager hasn't completed their draft"
                            >
                              Drafting
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="standings-table__center standings-table__gw">
                        {r.gameweekPoints}
                      </td>
                      <td className="standings-table__center standings-table__total">
                        {r.totalPoints}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="standings-page__note">
            Only your starting XI scores, and your captain's points count double.
            A player scores for your team from the first gameweek whose deadline
            falls after you drafted them. Click a GW or Total heading to sort by
            it, and again to flip the order.
          </p>
        </>
      )}
    </>
  );
}
