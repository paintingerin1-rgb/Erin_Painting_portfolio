// Shared date/time formatting.
//
// One place for the fixture/deadline format so Dashboard and Match Center
// can't drift apart (they each had their own copy of these options, with
// different fields). The locale is left to the browser on purpose, so the
// output matches whatever Match Center already shows the user; tests pin
// the locale and time zone explicitly to stay deterministic in CI.
// FixtureRow (src/components/FixtureRow) uses it for every fixture (#32).

export interface FormatKickoffOptions {
  /** Pinned in tests; left undefined in the app so it follows the browser. */
  locale?: string;
  /** Pinned in tests; left undefined in the app so it follows the browser. */
  timeZone?: string;
  /** Shown when there is no confirmed kickoff time. */
  fallback?: string;
}

/**
 * A fixture kickoff or gameweek deadline, e.g. "Sat, Oct 10, 01:30 PM".
 * Returns the fallback for a null or unparseable timestamp.
 */
export function formatKickoff(
  iso: string | null | undefined,
  { locale, timeZone, fallback = "Kickoff TBC" }: FormatKickoffOptions = {},
): string {
  if (!iso) return fallback;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback;

  return date.toLocaleString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * Time left until `targetIso`, as "2d 03h 04m" / "5h 06m 07s" / "9m 08s" /
 * "45s". Trailing units are zero-padded so the countdown doesn't jitter in
 * width as it ticks. Returns "Underway" once the target has passed.
 *
 * `now` is a parameter rather than a Date.now() call inside, so the result
 * is a pure function of its inputs and can be tested without fake timers.
 */
export function formatCountdown(
  targetIso: string,
  now: number = Date.now(),
): string {
  const diffMs = new Date(targetIso).getTime() - now;
  if (Number.isNaN(diffMs)) return "TBC";
  if (diffMs <= 0) return "Underway";

  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}
