// Pure helpers for scripts/seed-leagues.ts (S3-42). They live here, away from
// the script, because the script reads env vars and exits at import time, so
// a test can't load it.

/**
 * Same alphabet as create_league_rpc's join codes: no 0/O or 1/I, so a code
 * read out loud or off a projector can't be misread.
 */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 6;

/**
 * A join code that isn't in `used`, which it then adds the code to. `rand`
 * is injectable so a test can force a collision.
 */
export function makeJoinCode(used: Set<string>, rand: () => number = Math.random): string {
  const capacity = JOIN_CODE_ALPHABET.length ** JOIN_CODE_LENGTH;
  if (used.size >= capacity) throw new Error("No join codes left.");
  let code: string;
  do {
    code = "";
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
      code += JOIN_CODE_ALPHABET[Math.floor(rand() * JOIN_CODE_ALPHABET.length)];
    }
  } while (used.has(code));
  used.add(code);
  return code;
}

/**
 * How many more of each kind to create so a re-run tops up to the targets
 * and never goes past them.
 */
export function leaguesToCreate(
  existing: { public: number; private: number },
  target: { public: number; private: number },
): { public: number; private: number } {
  return {
    public: Math.max(0, target.public - existing.public),
    private: Math.max(0, target.private - existing.private),
  };
}

/**
 * Reads `--name=N` from the CLI args: `fallback` when the flag is absent, and
 * an error for anything that isn't a whole number from 0 up, rather than a
 * silent NaN that makes the run do nothing.
 */
export function countArg(args: string[], name: string, fallback: number): number {
  const prefix = `--${name}=`;
  const arg = args.find((a) => a.startsWith(prefix));
  if (arg === undefined) return fallback;
  const raw = arg.slice(prefix.length);
  if (!/^\d+$/.test(raw)) throw new Error(`--${name} needs a whole number, got "${raw}".`);
  return Number(raw);
}

/**
 * Reads `--competition=CODE` (a competition.code such as PD or MLS), upper
 * cased. The Premier League when the flag is absent, so a run without it
 * seeds what it always has.
 */
export function competitionArg(args: string[], fallback = "PL"): string {
  const prefix = "--competition=";
  const arg = args.find((a) => a.startsWith(prefix));
  if (arg === undefined) return fallback;
  const raw = arg.slice(prefix.length).trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(raw)) {
    throw new Error(`--competition needs a competition code such as PD or MLS, got "${raw}".`);
  }
  return raw;
}

/**
 * When seeded squads count as drafted: an hour before the season's first
 * deadline. league_standings only scores gameweeks whose deadline is after
 * `drafted_at`, so a squad stamped with the time of the run scores nothing
 * until the next gameweek is played. Null when no gameweeks are loaded yet.
 */
export function seasonDraftTime(deadlines: string[]): string | null {
  if (deadlines.length === 0) return null;
  const first = Math.min(...deadlines.map((d) => Date.parse(d)));
  return new Date(first - 60 * 60 * 1000).toISOString();
}

export interface DemoLeagueCandidate {
  id: number;
  memberCount: number;
  maxTeams: number;
  hasDemoUser: boolean;
}

/**
 * The seeded league to put the demo account in. One it's already in wins, so
 * a re-run doesn't add it to a second league of the same kind. Otherwise the
 * fullest league with a free spot, since a longer table reads better on a
 * projector. Null when every league is full.
 */
export function pickDemoLeague(candidates: DemoLeagueCandidate[]): number | null {
  const joined = candidates.find((c) => c.hasDemoUser);
  if (joined) return joined.id;
  const open = candidates
    .filter((c) => c.memberCount < c.maxTeams)
    .sort((a, b) => b.memberCount - a.memberCount || a.id - b.id);
  return open[0]?.id ?? null;
}

export interface ChatLine {
  authorIndex: number;
  content: string;
  createdAt: string;
}

const CHAT_LINES = [
  "Welcome everyone, good luck this season!",
  "Who else went big on midfielders?",
  "My keeper let me down this weekend.",
  "That captain pick paid off nicely.",
  "Anyone watching the late kickoff tonight?",
  "Top of the table won't last, enjoy it while you can.",
  "Forgot to check my squad before the deadline again...",
  "Great gameweek for the defenders.",
];

/**
 * A short chat history for a demo league: `count` lines, oldest first,
 * spread over the last few days before `now` and shared out between the
 * `authors` (indexes into the caller's member list). Empty without authors.
 */
export function demoChatHistory(authors: number, now: Date, count = 6): ChatLine[] {
  if (authors === 0) return [];
  const lines: ChatLine[] = [];
  for (let i = 0; i < count; i++) {
    // Oldest first, ~10 hours apart, the newest an hour ago.
    const hoursAgo = (count - i) * 10 - 9;
    lines.push({
      authorIndex: i % authors,
      content: CHAT_LINES[i % CHAT_LINES.length],
      createdAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000).toISOString(),
    });
  }
  return lines;
}
