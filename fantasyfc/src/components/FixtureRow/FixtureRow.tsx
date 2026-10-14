import type { FixtureRow as Fixture } from "../../features/matchCenter/matchCenterApi";
import { formatKickoff } from "../../lib/dateFormat";
import { hasScore, scoreLine, teamResult, type TeamResult } from "./fixtureResult";
import "./FixtureRow.css";

const RESULT_LABEL: Record<TeamResult, string> = {
  won: "Won",
  drawn: "Drew",
  lost: "Lost",
};

/**
 * One fixture (#32), shared by Dashboard and Match Center: kickoff time, then
 * the teams either side of a centred "vs" or score, e.g. "Fulham 1 – 1 Man
 * United". A finished match has a dot by each team: green won, grey drew,
 * red lost.
 */
export default function FixtureRow({ fixture: f }: { fixture: Fixture }) {
  const scored = hasScore(f);
  const live = f.status === "LIVE";

  return (
    <div className="frow">
      <div className="frow__time">
        {formatKickoff(f.kickoff_at)}
        {live && (
          <span className="frow__live">
            <span className="frow__live-dot" aria-hidden="true" />
            Live
          </span>
        )}
      </div>

      <div className="frow__match" aria-label={scoreLine(f)}>
        <span className="frow__team frow__team--home">
          <ResultDot result={teamResult(f, "home")} team={f.home_team} />
          <span className="frow__name">{f.home_team}</span>
        </span>

        <span
          className={`frow__centre${scored ? " frow__centre--score" : ""}${live ? " frow__centre--live" : ""}`}
          aria-hidden="true"
        >
          {scored ? `${f.home_score} – ${f.away_score}` : "vs"}
        </span>

        <span className="frow__team frow__team--away">
          <span className="frow__name">{f.away_team}</span>
          <ResultDot result={teamResult(f, "away")} team={f.away_team} />
        </span>
      </div>
    </div>
  );
}

function ResultDot({ result, team }: { result: TeamResult | null; team: string }) {
  if (!result) return null;
  const label = `${team}: ${RESULT_LABEL[result]}`;
  return (
    <span
      className={`frow__dot frow__dot--${result}`}
      data-result={result}
      title={label}
      aria-label={label}
      role="img"
    />
  );
}
