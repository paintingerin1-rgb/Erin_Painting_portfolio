import { useEffect, useState } from "react";
import "./PlayersPage.css";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import { listCompetitions, type Competition } from "../leagues/leaguesApi";
import {
  listPlayers,
  DEFAULT_PLAYERS_PAGE_SIZE,
  type Player,
  type PlayerPosition,
} from "./playersApi";

const POSITION_TABS: { label: string; value: PlayerPosition | null }[] = [
  { label: "All", value: null },
  { label: "Forwards", value: "Forward" },
  { label: "Midfielders", value: "Midfielder" },
  { label: "Defenders", value: "Defender" },
  { label: "Goalkeepers", value: "Goalkeeper" },
];

function formatPrice(price: number): string {
  return `£${price.toFixed(1)}m`;
}

export default function PlayersPage() {
  // Free-text input is debounced into `search`, which is what actually
  // drives the query - keystrokes shouldn't each fire a request.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<PlayerPosition | null>(null);
  const [page, setPage] = useState(0);

  // Competition tabs (#44). Starts on the current league's competition; the
  // player query waits until the tabs have loaded so it never mixes leagues.
  const { currentCompetitionId } = useCurrentLeague();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState<number | null>(null);
  const [competitionsReady, setCompetitionsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCompetitions()
      .then((rows) => {
        if (cancelled) return;
        setCompetitions(rows);
        const start = rows.find((c) => c.id === currentCompetitionId) ?? rows[0];
        setCompetitionId(start?.id ?? null);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setCompetitionsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentCompetitionId]);

  const [players, setPlayers] = useState<Player[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function loadPlayers() {
      if (!competitionsReady) return;
      setLoading(true);
      setError(null);
      try {
        const { players, total } = await listPlayers({
          competitionId: competitionId ?? undefined,
          search,
          position: position ?? undefined,
          page,
          pageSize: DEFAULT_PLAYERS_PAGE_SIZE,
        });
        if (cancelled) return;
        setPlayers(players);
        setTotal(total);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setPlayers([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [search, position, page, competitionId, competitionsReady]);

  const pageCount = Math.max(1, Math.ceil(total / DEFAULT_PLAYERS_PAGE_SIZE));
  const activeLabel =
    POSITION_TABS.find((tab) => tab.value === position)?.label ?? "All";

  return (
    <div className="players-page">
      <main className="players-page__main">
        <div className="players-page__header">
          <h1 className="players-page__title">Players</h1>
        </div>

        {/* Search sits on its own row under the header, so it gets the
            full width rather than being squeezed beside the title. */}
        <div className="players-page__search-row">
          <input
            className="players-page__search"
            type="text"
            placeholder="Search players or clubs…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        <div className="competition-tabs">
          {competitions.map((c) => (
            <button
              key={c.id}
              className={`competition-tab${c.id === competitionId ? " competition-tab--active" : ""}`}
              aria-pressed={c.id === competitionId}
              onClick={() => {
                setCompetitionId(c.id);
                setPage(0);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="competition-tabs">
          {POSITION_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              className={`competition-tab${position === tab.value ? " competition-tab--active" : ""}`}
              // .competition-tab's default cursor is not-allowed - it was
              // written for the (disabled) league tabs above. These position
              // tabs are always clickable, so override it inline rather than
              // touch the shared CSS file.
              style={{ cursor: "pointer" }}
              onClick={() => {
                setPosition(tab.value);
                setPage(0);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <p className="players-page__error">{error}</p>}

        {loading ? (
          <p className="players-page__status">Loading players…</p>
        ) : players.length === 0 ? (
          <p className="players-page__status">No players match your search.</p>
        ) : (
          <section className="position-group">
            <h2 className="position-group__title">{activeLabel}</h2>
            <div className="player-tile-grid">
              {players.map((p) => (
                <div className="player-tile" key={p.id}>
                  <div className="player-tile__top">
                    <span className="player-tile__avatar">{p.name[0]}</span>
                    <span className="player-tile__meta">
                      <p className="player-tile__name" title={p.name}>
                        {p.name}
                      </p>
                      <p className="player-tile__club">{p.real_team}</p>
                    </span>
                  </div>
                  <div className="player-tile__stats">
                    <div className="player-tile__stat">
                      <span className="player-tile__stat-label">Price</span>
                      <span className="player-tile__stat-value">
                        {formatPrice(p.price)}
                      </span>
                    </div>
                    <div className="player-tile__stat player-tile__stat--pts">
                      <span className="player-tile__stat-label">Pos</span>
                      <span className="player-tile__stat-value">
                        {p.position}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!loading && total > DEFAULT_PLAYERS_PAGE_SIZE && (
          <div className="players-page__pagination">
            <button
              type="button"
              className="players-page__pagination-btn"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              className="players-page__pagination-btn"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page + 1 >= pageCount}
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
