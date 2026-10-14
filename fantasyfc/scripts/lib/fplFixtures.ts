// Pure helpers for scripts/s2-07-ingest-fixtures.ts. They live here, away
// from the script, because the script reads env vars and exits at import
// time, so a test can't load it.

export interface FplFixtureState {
  started: boolean;
  finished: boolean;
  /** Optional: older cached payloads may not have it. */
  finished_provisional?: boolean;
}

/**
 * A fixture's status from the FPL feed. `finished` only turns true once FPL
 * has confirmed the whole gameweek (bonus points included), which can be days
 * after the match, so a played match read off `finished` alone sat in Live
 * until then. `finished_provisional` is the full-time whistle.
 */
export function fplFixtureStatus(f: FplFixtureState): "UPCOMING" | "LIVE" | "COMPLETED" {
  if (f.finished || f.finished_provisional) return "COMPLETED";
  if (f.started) return "LIVE";
  return "UPCOMING";
}
