import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import "./SquadPage.css";
import PlayerCard from "../../components/PlayerCard/PlayerCard";
import Toast from "../../components/Toast/Toast";
import { describeError } from "../../lib/dataAccess";
import { formatKickoff } from "../../lib/dateFormat";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import {
  formationLabel,
  formationOf,
  lineupSlots,
  previewSlots,
  swapPlayers,
  toSlotsPayload,
  type LineupEntry,
  type PitchSlot,
  type SquadPlayer,
} from "./lineupLogic";
import { getLineup, saveLineup } from "./lineupApi";

/** The gameweek the lineup on screen is for. */
interface LineupGameweek {
  id: number;
  number: number;
  deadlineAt: string;
}

export default function SquadPage() {
  const { currentTeam: team, isLoading: isLeagueLoading } = useCurrentLeague();
  // The pitch is drawn from the formation (lineupLogic.pitchLayout), so any
  // legal formation fits. Before the draft is complete it's a preview.
  const [slots, setSlots] = useState<PitchSlot[]>(() => previewSlots([]));
  const [lineup, setLineup] = useState<LineupEntry[] | null>(null);
  const [gameweek, setGameweek] = useState<LineupGameweek | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftCount, setDraftCount] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Modal & Lock State
  const [isDraftComplete, setIsDraftComplete] = useState(false);
  const [showModal, setShowModal] = useState(false);

  /**
   * Loads the squad and, once the draft is complete, the saved lineup for the
   * next gameweek. Called on load and again after every save, so what's on
   * screen is always what the database holds.
   */
  const loadSquad = useCallback(async (teamId: string, draftComplete: boolean) => {
    const { data: drafts, error } = await supabase
      .from("drafted_players")
      .select(
        `
          player_id,
          football_players ( id, name, position, price, real_team )
        `,
      )
      .eq("team_id", teamId);
    if (error) throw new Error(describeError(error, "your squad"));

    const players = (drafts ?? []).map((d) => d.football_players as unknown as SquadPlayer);
    setDraftCount(players.length);

    const saved = draftComplete ? await getLineup(teamId) : null;
    if (!saved) {
      setLineup(null);
      setGameweek(null);
      setSlots(previewSlots(players));
      return;
    }

    const byId = new Map(players.map((p) => [p.id, p]));
    const entries = saved.rows
      .filter((r) => byId.has(r.playerId))
      .map((r) => ({ player: byId.get(r.playerId) as SquadPlayer, slotId: r.slotId, isCaptain: r.isCaptain }));
    setLineup(entries);
    setGameweek({ id: saved.gameweekId, number: saved.gameweekNumber, deadlineAt: saved.deadlineAt });
    setIsLocked(Date.now() >= Date.parse(saved.deadlineAt));
    setSlots(lineupSlots(entries));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSquad() {
      if (!team) return;
      setLoading(true);
      setIsDraftComplete(team.is_draft_complete);
      try {
        await loadSquad(team.id, team.is_draft_complete);
      } catch (err) {
        if (!cancelled) {
          setToast({ message: err instanceof Error ? err.message : "Could not load your squad.", type: "error" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (team) {
      fetchSquad();
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      setSlots(previewSlots([]));
      setLineup(null);
      setDraftCount(0);
    }

    return () => {
      cancelled = true;
    };
  }, [team, loadSquad]);

  // The lineup locks at the gameweek deadline, even with the page left open.
  useEffect(() => {
    if (!gameweek || isLocked) return;
    const msUntilDeadline = Date.parse(gameweek.deadlineAt) - Date.now();
    const id = setTimeout(() => setIsLocked(true), Math.max(0, msUntilDeadline));
    return () => clearTimeout(id);
  }, [gameweek, isLocked]);

  const handleSlotClick = async (slotId: string) => {
    if (!isDraftComplete) {
      setToast({
        message: "Complete your draft first, then pick your starting XI for each gameweek.",
        type: "error",
      });
      return;
    }
    if (isLocked && gameweek) {
      setToast({ message: `Locked — GW ${gameweek.number} kicked off.`, type: "error" });
      return;
    }
    if (!lineup || !gameweek || !team || isSaving) return;

    if (!selectedSlotId) {
      setSelectedSlotId(slotId);
      return;
    }
    setSelectedSlotId(null);
    if (selectedSlotId === slotId) return;

    const a = slots.find((s) => s.id === selectedSlotId)?.player;
    const b = slots.find((s) => s.id === slotId)?.player;
    if (!a || !b) return;

    const result = swapPlayers(lineup, a.id, b.id);
    if (!result.ok) {
      setToast({ message: result.reason, type: "error" });
      return;
    }

    // Save, then show what the database now holds.
    setIsSaving(true);
    try {
      await saveLineup(team.id, gameweek.id, toSlotsPayload(result.lineup));
      await loadSquad(team.id, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save your lineup.";
      if (message.startsWith("Locked")) setIsLocked(true);
      setToast({ message, type: "error" });
      await loadSquad(team.id, true).catch(() => undefined);
    } finally {
      setIsSaving(false);
    }
  };

  const getShortPosition = (pos: string): "GK" | "DEF" | "MID" | "FWD" => {
    if (pos === "Goalkeeper") return "GK";
    if (pos === "Defender") return "DEF";
    if (pos === "Midfielder") return "MID";
    return "FWD";
  };

  // Complete Draft API Call
  const handleCompleteDraft = async () => {
    if (!team) return;

    try {
      const { error } = await supabase.rpc("lock_draft", {
        p_team_id: team.id,
      });

      if (error) {
	    throw new Error(describeError(error, "completing your draft"));
	  }

      setIsDraftComplete(true);
      setShowModal(false);
      // Completing the draft creates a starting lineup server-side.
      await loadSquad(team.id, true);
    } catch (err) {
      console.error(err);
      setToast({
	    message:
		  err instanceof Error
		    ? err.message
			: "Could not complete your draft. Please try again.",
		type: "error",
	  });
    }
  };

  if (isLeagueLoading || (loading && team))
    return (
      <div style={{ color: "white", padding: "2rem" }}>
        Loading Squad Room...
      </div>
    );
    
  if (!team)
    return (
      <div style={{ color: "white", padding: "2rem" }}>
        You need to Create or Join a league first!
      </div>
    );

  return (
    <div className="squad-page">
      <div className="squad-page__main">
        <header className="squad-page__header">
          <p className="squad-page__eyebrow">
            {gameweek && lineup
              ? `GW ${gameweek.number} lineup · ${formationLabel(formationOf(lineup))} · ` +
                `deadline ${formatKickoff(gameweek.deadlineAt)}`
              : isDraftComplete
                ? "No upcoming gameweek"
                : "Your squad so far"}
          </p>
          <h1 className="squad-page__title">My Squad</h1>
          {isLocked && gameweek && (
            <p className="squad-page__locked" role="status">
              Locked — GW {gameweek.number} kicked off. Reload to pick your lineup for the next
              gameweek.
            </p>
          )}
        </header>

        <main className="squad-page__body">
          {/* Team info across the top, the draft action on its right (#35). */}
          <section className="squad-team-strip" aria-label="Team info">
            <dl className="squad-team-strip__stats">
              <div className="squad-team-strip__stat">
                <dt>Team Name</dt>
                <dd>{team.team_name || "No Team Found"}</dd>
              </div>
              <div className="squad-team-strip__stat">
                <dt>Squad Size</dt>
                <dd>{draftCount}/15</dd>
              </div>
              <div className="squad-team-strip__stat">
                <dt>Status</dt>
                <dd style={{ color: isDraftComplete ? "#4ade80" : "#fbbf24" }}>
                  {isDraftComplete ? "LOCKED" : "DRAFTING"}
                </dd>
              </div>
            </dl>

            {/* DYNAMIC DRAFT BUTTON */}
            {draftCount < 15 ? (
              <Link to="/draft" className="squad-draft-btn">
                {draftCount === 0
                  ? "BEGIN DRAFT"
                  : `CONTINUE DRAFT (${draftCount}/15)`}
              </Link>
            ) : !isDraftComplete ? (
              <button
                className="squad-draft-btn"
                onClick={() => setShowModal(true)}
                style={{
                  background: "linear-gradient(135deg, #4ade80, #16a34a)",
                }}
              >
                COMPLETE DRAFT
              </button>
            ) : (
              <div
                className="squad-draft-btn"
                style={{
                  background: "rgba(255,255,255,0.1)",
                  cursor: "default",
                  opacity: 0.7,
                }}
              >
                DRAFT LOCKED
              </div>
            )}
          </section>

          <div className="pitch-wrap">
            <div className="formation-layer">
              {slots
                .filter((s) => !s.isBench)
                .map((slot) => (
                  <div
                    key={slot.id}
                    className={`card-slot ${selectedSlotId === slot.id ? "card-slot--selected" : ""} ${isLocked ? "card-slot--locked" : ""}`}
                    style={{
                      top: slot.top,
                      left: slot.left,
                      position: "absolute",
                    }}
                    onClick={() => handleSlotClick(slot.id)}
                  >
                    {slot.isCaptain && (
                      <span className="captain-badge" title="Captain">C</span>
                    )}
                    {slot.player ? (
                      <PlayerCard
                        name={slot.player.name}
                        position={getShortPosition(slot.player.position)}
                        rating={slot.player.price}
                      />
                    ) : (
                      <div className="blank-card">
                        +<span>{slot.expectedRole}</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {/* Bench under the pitch, in one row (#35). */}
          <section className="squad-bench" aria-label="Bench">
            <h2 className="squad-bench__title">Bench</h2>
            <div className="bench-list">
              {slots
                .filter((s) => s.isBench)
                .map((slot) => (
                  <div
                    key={slot.id}
                    className={`bench-slot ${selectedSlotId === slot.id ? "bench-slot--selected" : ""} ${isLocked ? "bench-slot--locked" : ""}`}
                    onClick={() => handleSlotClick(slot.id)}
                  >
                    {slot.player ? (
                      <PlayerCard
                        name={slot.player.name}
                        position={getShortPosition(slot.player.position)}
                        rating={slot.player.price}
                      />
                    ) : (
                      <div className="blank-card">
                        +<span>Bench</span>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </section>
        </main>
      </div>

      {/* CONFIRMATION MODAL */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2
              style={{
                margin: "0 0 16px",
                color: "white",
                fontFamily: '"Oswald", sans-serif',
              }}
            >
              Confirm Draft
            </h2>
            <p
              style={{
                color: "rgba(255,255,255,0.7)",
                marginBottom: "24px",
                lineHeight: "1.5",
              }}
            >
              Are you sure you're done drafting? Your 15 players are then fixed,
              but you can still pick your starting XI before each gameweek's
              deadline.
            </p>
            <div
              style={{
                display: "flex",
                gap: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowModal(false)}
                className="modal-btn modal-btn--cancel"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteDraft}
                className="modal-btn modal-btn--confirm"
              >
                Complete Draft
              </button>
            </div>
          </div>
        </div>
      )}

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
