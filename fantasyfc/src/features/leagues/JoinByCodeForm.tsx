import { useState, type FormEvent } from "react";
import { joinByCode } from "./leaguesApi";
import { useCurrentLeague } from "../../contexts/CurrentLeagueContext";

type Props = {
  /** Called with the joined league's id, after the league list is refreshed. */
  onJoined: (leagueId: number) => void;
  /** Focus the code field on mount, for when the form opens in a panel. */
  autoFocus?: boolean;
  /** Class names for the field and button, so the form fits either surface. */
  inputClassName?: string;
  buttonClassName?: string;
  errorClassName?: string;
};

/**
 * The join-code form. The Join a League page and the globe's side panel both
 * use it, so a code is checked and joined the same way from either.
 */
export function JoinByCodeForm({
  onJoined,
  autoFocus = false,
  inputClassName = "leagues-field__input",
  buttonClassName = "leagues-join-btn",
  errorClassName = "leagues-error",
}: Props) {
  const { refreshLeagues } = useCurrentLeague();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError("Enter a join code.");
      return;
    }

    setSubmitting(true);
    try {
      const leagueId = await joinByCode(trimmedCode);
      await refreshLeagues();
      onJoined(leagueId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid join code.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="leagues-join-code-row">
        <input
          className={inputClassName}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Join code"
          aria-label="Join code"
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
        <button type="submit" className={buttonClassName} disabled={submitting}>
          {submitting ? "Joining…" : "Join"}
        </button>
      </div>
      {error && (
        <div className={errorClassName} role="alert">
          {error}
        </div>
      )}
    </form>
  );
}
