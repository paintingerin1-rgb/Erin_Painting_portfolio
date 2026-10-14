import { useState } from "react";
import { fplBreakdown, fplPoints } from "./fplPoints";
import { GAMEWEEK_5 } from "../../data/gameweek5";
import "./ScoringPage.css";

const POS_SHORT = { Goalkeeper: "GK", Defender: "DEF", Midfielder: "MID", Forward: "FWD" } as const;

const RULES: [string, string][] = [
  ["Appearance", "1 under 60′ · 2 at 60′+"],
  ["Goal", "GK 10 · DEF 6 · MID 5 · FWD 4"],
  ["Assist", "3"],
  ["Clean sheet (60′+)", "GK and DEF 4 · MID 1"],
  ["Saves", "1 per 3"],
  ["Penalty", "saved +5 · missed −2"],
  ["Conceded (GK and DEF)", "−1 per 2"],
  ["Cards · own goal", "yellow −1 · red −3 · OG −2"],
  ["Defensive contribution", "+2 at DEF 10 · MID/FWD 12"],
  ["Bonus", "3 · 2 · 1 from the feed"],
];

/**
 * Runs the real scoring engine live, in the browser, on real gameweek 5 stat
 * lines - and puts its answer next to the points FPL actually published.
 */
export default function ScoringPage() {
  const [selected, setSelected] = useState(0);
  const results = GAMEWEEK_5.map((p) => ({ ...p, ours: fplPoints(p.stats, p.position) }));
  const allMatch = results.every((r) => r.ours === r.publishedPoints);
  const current = results[selected];
  const breakdown = fplBreakdown(current.stats, current.position);

  return (
    <div className="scoring-page">
      <header className="scoring-page__header">
        <p className="scoring-page__eyebrow">Scoring engine</p>
        <h1 className="scoring-page__title">Official FPL rules, checked against real data</h1>
        <p className="scoring-page__lede">
          Points are never stored. They're calculated from each player's raw match stats by one
          function, written twice: as a SQL function in the database, which powers the real
          standings, and as this TypeScript mirror. Below, the TypeScript version runs live on real
          gameweek 5 players, next to the points FPL actually awarded them.
        </p>
      </header>

      <div className={`scoring-page__verdict${allMatch ? "" : " scoring-page__verdict--bad"}`} role="status">
        {allMatch
          ? `${results.length} of ${results.length} players match their published FPL score exactly`
          : "Mismatch with published FPL scores"}
      </div>

      <div className="scoring-page__grid">
        <section className="scoring-page__panel" aria-labelledby="gw5-heading">
          <h2 id="gw5-heading" className="scoring-page__panel-title">Real gameweek 5 players</h2>
          <table className="scoring-page__table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Pos</th>
                <th className="scoring-page__num">Ours</th>
                <th className="scoring-page__num">FPL</th>
                <th aria-label="Match" />
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr
                  key={r.name}
                  className={i === selected ? "scoring-page__row--active" : undefined}
                >
                  <td>
                    <button
                      type="button"
                      className="scoring-page__player"
                      onClick={() => setSelected(i)}
                      aria-pressed={i === selected}
                    >
                      {r.name} <span>{r.club}</span>
                    </button>
                  </td>
                  <td>
                    <span className="scoring-page__pos">{POS_SHORT[r.position]}</span>
                  </td>
                  <td className="scoring-page__num scoring-page__ours">{r.ours}</td>
                  <td className="scoring-page__num">{r.publishedPoints}</td>
                  <td className="scoring-page__check" aria-label={r.ours === r.publishedPoints ? "matches" : "differs"}>
                    {r.ours === r.publishedPoints ? "✓" : "✗"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="scoring-page__panel" aria-labelledby="breakdown-heading">
          <h2 id="breakdown-heading" className="scoring-page__panel-title">
            How {current.name} got {current.ours}
          </h2>
          <ul className="scoring-page__breakdown">
            {breakdown.map((line) => (
              <li key={line.label}>
                <span>{line.label}</span>
                <span className={line.points < 0 ? "scoring-page__neg" : "scoring-page__pos-pts"}>
                  {line.points > 0 ? `+${line.points}` : line.points}
                </span>
              </li>
            ))}
            <li className="scoring-page__total">
              <span>Total</span>
              <span>{current.ours}</span>
            </li>
          </ul>

          <h2 className="scoring-page__panel-title scoring-page__rules-title">The rules</h2>
          <dl className="scoring-page__rules">
            {RULES.map(([event, pts]) => (
              <div key={event}>
                <dt>{event}</dt>
                <dd>{pts}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
