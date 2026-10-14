import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./DraftPage.css";
import Toast from "../../components/Toast/Toast";
import { describeError } from "../../lib/dataAccess";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import {
  PICK_TABS,
  POSITION_LIMITS,
  pickTabLabel,
  picksForTab,
  sortByPrice,
  type PickTab,
  type PriceSort,
} from "./draftLogic";

interface Player {
  id: number;
  name: string;
  position: string;
  real_team: string;
  price: number;
}


export default function DraftPage() {
  const {
    currentTeam: team,
    currentCompetitionId,
    isLoading: isLeagueLoading,
    refreshTeam,
  } = useCurrentLeague();
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftedPlayers, setDraftedPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTab, setSelectedTab] = useState<string>("All");
  const [draftedTab, setDraftedTab] = useState<PickTab>("GK");
  const [teamFilter, setTeamFilter] = useState<string>("");
  // null = no cap. The slider tops out at the dearest player (#36 prices go
  // past £15m), so "all the way right" never hides anyone.
  const [priceFilter, setPriceFilter] = useState<number | null>(null);
  const [priceSort, setPriceSort] = useState<PriceSort>("desc");

  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const getDraftedCount = (pos: string) => {
    return draftedPlayers.filter((p) => p.position === pos).length;
  };

  const loadDraftRoom = useCallback(async (showLoading = true) => {
    if (!team || currentCompetitionId === null) return;

    if (showLoading) setLoading(true);

    const { data: draftedRefs } = await supabase
      .from("drafted_players")
      .select("player_id")
      .eq("team_id", team.id);

    const draftedIds = draftedRefs?.map((r) => r.player_id) || [];

    // Only the league's own competition can be drafted from (#44; the
    // drafted_players trigger enforces the same rule server-side). Paged,
    // because Supabase returns at most 1,000 rows a request and MLS alone
    // has ~960 players; id breaks price ties so pages don't overlap.
    const PAGE = 1000;
    const allPlayers: Player[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("football_players")
        .select("*")
        .eq("competition_id", currentCompetitionId)
        .order("price", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        setToast({ message: describeError(error, "the players"), type: "error" });
        break;
      }
      allPlayers.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    // Picks stay in the available list, marked as picked (#38).
    setPlayers(allPlayers);
    setDraftedPlayers(allPlayers.filter((p) => draftedIds.includes(p.id)));
    
    if (showLoading) setLoading(false);
  }, [team, currentCompetitionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDraftRoom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, currentCompetitionId]);

  const handleDraftPlayer = async (player: Player) => {
    if (!team) return;
    try {
      // draft_player() enforces the lock, budget, squad size and position
      // limits; its exceptions are already written for users.
      const { error: draftErr } = await supabase.rpc("draft_player", {
        p_team_id: team.id,
        p_player_id: player.id,
      });

      if (draftErr) throw new Error(describeError(draftErr, "That pick"));

      // Success! Fetch the latest DB state (Write-then-refresh)
      await Promise.all([loadDraftRoom(false), refreshTeam()]);
    } catch (err) {
      console.error(err);
      setToast({
        message:
          err instanceof Error
            ? err.message
            : "Could not draft that player. Please try again.",
        type: "error",
      });
    }
  };

  const handleRemovePlayer = async (player: Player) => {
    if (!team) return;

    try {
      const { error: releaseErr } = await supabase.rpc("release_player", {
        p_team_id: team.id,
        p_player_id: player.id,
      });

      if (releaseErr) {
        throw new Error(describeError(releaseErr, "removing that player"));
      }

      await Promise.all([loadDraftRoom(false), refreshTeam()]);
    } catch (err) {
      console.error(err);
      setToast({
        message:
          err instanceof Error
            ? err.message
            : "Could not remove that player. Please try again.",
        type: "error",
      });
    }
  };

  const filteredPlayers = players.filter((p) => {
    if (selectedTab !== "All" && p.position !== selectedTab) return false;

    if (teamFilter) {
      const query = teamFilter.toLowerCase();
      const matchesName = p.name.toLowerCase().includes(query);
      const matchesTeam = p.real_team.toLowerCase().includes(query);
      if (!matchesName && !matchesTeam) return false;
    }

    if (priceFilter !== null && p.price > priceFilter) return false;
    return true;
  });
  const priceCeiling = Math.max(15, Math.ceil(Math.max(0, ...players.map((p) => p.price))));
  const shownPlayers = sortByPrice(filteredPlayers, priceSort).slice(0, 50);
  const pickedIds = new Set(draftedPlayers.map((p) => p.id));
  const tabPicks = picksForTab(draftedPlayers, draftedTab);

  if (isLeagueLoading || (loading && team))
    return (
      <div className="draft-page">
        <p style={{ color: "white", padding: "2rem" }}>Loading Draft Room...</p>
      </div>
    );
  if (!team)
    return (
      <div className="draft-page">
        <p style={{ color: "white", padding: "2rem" }}>
          You need to Create or Join a league first!
        </p>
      </div>
    );

  return (
    <div className="draft-page">
      <main
        className="draft-page__main"
        style={{ display: "flex", gap: "24px", minWidth: 0, width: "100%" }}
      >
        {/* LEFT PANEL */}
        <div
          className="league-card"
          style={{
            flex: 1,
            minWidth: 0,
            height: "84vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 className="league-card__heading draft-list-heading">
            Available <span>Players</span>
          </h2>

          <div className="draft-tabs" style={{ marginBottom: "16px" }}>
            {["All", "Goalkeeper", "Defender", "Midfielder", "Forward"].map(
              (tab) => (
                <button
                  key={tab}
                  className={`draft-tab ${selectedTab === tab ? "draft-tab--active" : ""}`}
                  onClick={() => setSelectedTab(tab)}
                >
                  {tab}
                </button>
              ),
            )}
          </div>

          <div className="draft-filters">
            <input
              type="text"
              className="draft-filter-input"
              placeholder="Search by Player or Team..."
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              style={{ flex: 1 }}
            />
            <div
              style={{
                // Grows to fill the row, and drops below the search box
                // (.draft-filters wraps) before the slider gets squeezed.
                flex: "1 1 220px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                color: "white",
                fontSize: "12px",
              }}
            >
              <span style={{ fontWeight: 600, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                MAX PRICE: {priceFilter === null ? "ANY" : `$${priceFilter.toFixed(1)}M`}
              </span>
              <input
                type="range"
                min="3.5"
                max={priceCeiling}
                step="0.1"
                value={priceFilter ?? priceCeiling}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  setPriceFilter(value >= priceCeiling ? null : value);
                }}
                className="league-slider"
                style={{ width: "100%" }}
              />
            </div>
            <button
              type="button"
              className="draft-sort"
              onClick={() => setPriceSort((d) => (d === "desc" ? "asc" : "desc"))}
              aria-label={`Sort by price, ${priceSort === "desc" ? "highest" : "lowest"} first. Click to reverse.`}
            >
              Price {priceSort === "desc" ? "↓" : "↑"}
            </button>
          </div>

          <div className="draft-player-list">
            {shownPlayers.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.5)", padding: "20px" }}>
                No players match your filters.
              </p>
            ) : (
              shownPlayers.map((player) => {
                const isPicked = pickedIds.has(player.id);
                const isPositionFull =
                  getDraftedCount(player.position) >= (POSITION_LIMITS[player.position] || 0);
                const isLocked = team.is_draft_complete || isPicked || isPositionFull;
                const buttonText = isPicked
                  ? "PICKED"
                  : team.is_draft_complete
                    ? "LOCKED"
                    : isPositionFull
                      ? "FULL"
                      : "DRAFT";

                return (
                  <div
                    key={player.id}
                    className={`draft-player-row${isPicked ? " draft-player-row--picked" : ""}`}
                  >
                    <span className="draft-player-row__price">${player.price}M</span>
                    <span className="draft-player-row__pos">{player.position}</span>
                    <span className="draft-player-row__who">
                      <span className="draft-player-row__name">{player.name}</span>
                      <span className="draft-player-row__team">{player.real_team}</span>
                    </span>
                    <button
                      className="draft-player-row__action"
                      onClick={() => handleDraftPlayer(player)}
                      disabled={isLocked}
                    >
                      {buttonText}
                    </button>
                  </div>
                );
              })
            )}
            {filteredPlayers.length > shownPlayers.length && (
              <p className="draft-player-list__more">
                Showing {shownPlayers.length} of {filteredPlayers.length}. Search or lower the
                max price to see the rest.
              </p>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div
          className="league-card"
          style={{
            flex: "0 0 340px",
            height: "84vh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 className="league-card__heading">{team.team_name}</h2>

          <div
            style={{
              background: "rgba(0,0,0,0.3)",
              padding: "20px",
              borderRadius: "12px",
              marginBottom: "20px",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <span
              style={{
                color: "#fff",
                display: "block",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                opacity: 0.6,
                marginBottom: "8px",
              }}
            >
              Remaining Budget
            </span>
            <strong
              style={{
                fontFamily: '"Oswald", sans-serif',
                fontSize: "32px",
                color: team.remaining_budget > 20 ? "#4ade80" : "#f87171",
              }}
            >
              ${team.remaining_budget.toFixed(2)}M
            </strong>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "8px" }}>
            {(Object.keys(PICK_TABS) as PickTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setDraftedTab(tab)}
                style={{
                  background: draftedTab === tab ? "rgba(255,255,255,0.1)" : "transparent",
                  color: draftedTab === tab ? "white" : "rgba(255,255,255,0.5)",
                  border: "none",
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: "bold",
                  borderRadius: "4px"
                }}
              >
                {pickTabLabel(draftedPlayers, tab)}
              </button>
            ))}
          </div>

          <div style={{ overflowY: "auto", flex: 1, paddingRight: "8px" }}>
            {tabPicks.length === 0 ? (
              <p
                style={{
                  color: "white",
                  opacity: 0.5,
                  fontSize: "14px",
                  textAlign: "center",
                  marginTop: "20px",
                }}
              >
                No players drafted yet.
              </p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {tabPicks.map((p) => (
                  <li key={p.id} className="squad-list-item">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      {/* NEW: The Remove Button! */}
                      {!team.is_draft_complete && (
                        <button
                          onClick={() => handleRemovePlayer(p)}
                          style={{
                            background: "rgba(255,0,0,0.2)",
                            color: "#ff4d4d",
                            border: "1px solid rgba(255,0,0,0.3)",
                            borderRadius: "50%",
                            width: "24px",
                            height: "24px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontWeight: "bold",
                            fontSize: "10px",
                          }}
                        >
                          X
                        </button>
                      )}
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "white",
                            marginBottom: "4px",
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "rgba(255,255,255,0.5)",
                          }}
                        >
                          {p.position}
                        </div>
                      </div>
                    </div>
                    <strong
                      style={{
                        fontFamily: '"Oswald", sans-serif',
                        color: "#c7b6e8",
                      }}
                    >
                      ${p.price}M
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>

	  {toast && (
	    <Toast
		  message={toast.message}
		  type={toast.type}
		  onClose={() => setToast(null)}
		/>
	  )}
    </div>
  );
}
