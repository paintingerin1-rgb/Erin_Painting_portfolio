import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  createLeague,
  listCompetitions,
  type Competition,
  type Visibility,
} from "./leaguesApi";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";
import "./leagues.css";

export default function CreateLeaguePage() {
  const navigate = useNavigate();
  const { refreshLeagues, setLeagueId } = useCurrentLeague();
  // ?competition=BL1 preselects a competition (e.g. linked from the globe).
  const [searchParams] = useSearchParams();
  const requestedCode = searchParams.get("competition")?.toUpperCase() ?? "PL";

  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionId, setCompetitionId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [maxTeams, setMaxTeams] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCompetitions()
      .then((rows) => {
        if (cancelled) return;
        setCompetitions(rows);
        const preselected = rows.find((c) => c.code === requestedCode) ?? rows[0];
        setCompetitionId(preselected?.id ?? null);
      })
      // Without the list the league is still created, in the Premier League.
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [requestedCode]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("League name is required.");
      return;
    }

    const parsedMaxTeams = maxTeams.trim() === "" ? 20 : Number(maxTeams);
    if (
      !Number.isInteger(parsedMaxTeams) ||
      parsedMaxTeams < 1 ||
      parsedMaxTeams > 20
    ) {
      setError("Max teams must be a whole number between 1 and 20.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createLeague({
        name: trimmedName,
        visibility,
        maxTeams: parsedMaxTeams,
        competitionId: competitionId ?? undefined,
      });

      await refreshLeagues();
      setLeagueId(result.id);

      navigate("/leagues", {
        state: {
          toast: {
            message: "League created.",
            joinCode: result.joinCode ?? undefined,
          },
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the league.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="leagues-page">
      <main className="leagues-main">
        <Link to="/leagues" className="leagues-back-link">
          ← Back to your leagues
        </Link>
        <h1 className="leagues-form-title">Create a League</h1>

        <form onSubmit={handleSubmit}>
          <div className="leagues-field">
            <label className="leagues-field__label" htmlFor="league-name">
              League name
            </label>
            <input
              id="league-name"
              className="leagues-field__input"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Office Champions"
            />
          </div>

          {competitions.length > 0 && (
            <div className="leagues-field">
              <label className="leagues-field__label" htmlFor="competition">
                Competition
              </label>
              <select
                id="competition"
                className="leagues-field__input"
                value={competitionId ?? ""}
                onChange={(e) => setCompetitionId(Number(e.target.value))}
              >
                {competitions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.country ? `${c.name} (${c.country})` : c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="leagues-field">
            <span className="leagues-field__label">Visibility</span>
            <div className="leagues-visibility">
              <button
                type="button"
                className={`leagues-visibility__option${visibility === "PUBLIC" ? " leagues-visibility__option--active" : ""}`}
                onClick={() => setVisibility("PUBLIC")}
              >
                Public
              </button>
              <button
                type="button"
                className={`leagues-visibility__option${visibility === "PRIVATE" ? " leagues-visibility__option--active" : ""}`}
                onClick={() => setVisibility("PRIVATE")}
              >
                Private
              </button>
            </div>
          </div>

          <div className="leagues-field">
            <label className="leagues-field__label" htmlFor="max-teams">
              Max teams
            </label>
            <input
              id="max-teams"
              className="leagues-field__input"
              type="number"
              min={1}
              max={20}
              value={maxTeams}
              onChange={(e) => setMaxTeams(e.target.value)}
              placeholder="20"
            />
          </div>

          <button type="submit" className="leagues-submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create League"}
          </button>

          {error && <div className="leagues-error">{error}</div>}
        </form>
      </main>
    </div>
  );
}
