// Resolves FPL players to football_players rows for S2-08b's stats ingestion.
//
// FPL's element id is a different provider's id space than
// football_players.id (football-data.org, ingested by S2-06) - the two
// don't correspond, so writing FPL's id straight into player_id either
// violates the FK or, worse, silently lands on an unrelated player whose
// football-data.org id happens to collide with the FPL element id. So
// identity is resolved by name, scoped to the player's club through
// public.club (fpl_team_id -> club.id), so two players who share a name at
// different clubs can't be confused. A name shared by two players at the
// same club is ambiguous and left unmatched rather than guessed.
//
// Two passes, both within the club:
//  1. Exact: normalized full name, then web_name.
//  2. Name variants, for the ~50 players the two providers spell differently.
//     FPL uses full legal names ("David Raya Martín", "Gabriel dos Santos
//     Magalhães", "Dominic Solanke-Mitchell") and its own short forms ("Oli",
//     "Micky"); football-data.org uses common names ("David Raya", "Oliver
//     McBurnie", "Mickey van de Ven"). A player matches when one name's words
//     are all contained in the other's, or when the surnames agree and the
//     first names share an initial.
//  3. Surname only, for nicknames and transliterations ("Tino"/"Valentino
//     Livramento", "Chema Andrés", "Yehor Yarmoliuk"/"Yegor Yarmolyuk"): our
//     surname appears among the FPL player's names, allowing one letter of
//     spelling difference.
// Passes 2 and 3 only accept a match when exactly one unclaimed player at the
// club fits, and no other FPL element fits that same player.

export interface FplElement {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  // FPL team id - resolved to a club via club.fpl_team_id.
  team: number;
}

export interface FootballPlayer {
  id: number;
  name: string;
  club_id: number | null;
}

export interface MatchResult {
  // FPL element id -> football_players.id
  matched: Map<number, number>;
  // FPL team has no club.fpl_team_id yet (run ingest:fixtures first).
  noClub: FplElement[];
  // Name matches two or more players at the same club.
  ambiguous: FplElement[];
  // No player of that name at that club.
  notFound: FplElement[];
}

// Letters that aren't a base letter plus an accent, so NFD leaves them alone
// and the [^a-z] strip below would delete them ("Rønnow" -> "rnnow").
const LETTER_FOLDS: Record<string, string> = {
  ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i",
};

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => LETTER_FOLDS[c])
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// A player id, or null when the key is shared by more than one player.
type NameIndex = Map<string, number | null>;

function key(clubId: number, name: string): string {
  return `${clubId}|${normalizeName(name)}`;
}

/** Words of a name, normalized; hyphenated parts count as separate words. */
export function nameTokens(name: string): string[] {
  return normalizeName(name.replace(/-/g, " ")).split(" ").filter(Boolean);
}

function isSubset(a: string[], b: Set<string>): boolean {
  return a.length > 0 && a.every((t) => b.has(t));
}

function variantMatches(el: FplElement, playerName: string): boolean {
  const db = nameTokens(playerName);
  if (db.length === 0) return false;
  const legal = nameTokens(`${el.first_name} ${el.second_name}`);
  const everyFplWord = new Set([...legal, ...nameTokens(el.web_name)]);

  // "David Raya" within "David Raya Martín" (+ web_name "Raya"), or
  // "Ryan Giles" within "Ryan John Giles".
  if (isSubset(db, everyFplWord) || isSubset(legal, new Set(db))) return true;

  // "Oliver McBurnie" / "Oli McBurnie", "Mickey van de Ven" / "Micky van de Ven".
  const dbSurname = db[db.length - 1];
  const fplSurnames = [
    nameTokens(el.second_name).at(-1),
    nameTokens(el.web_name).at(-1),
  ];
  const fplFirst = nameTokens(el.first_name)[0];
  return (
    db.length > 1 &&
    fplFirst !== undefined &&
    fplSurnames.includes(dbSurname) &&
    db[0][0] === fplFirst[0]
  );
}

/** Levenshtein distance, capped: returns max + 1 as soon as it's exceeded. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    if (Math.min(...cur) > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function surnameMatches(el: FplElement, playerName: string): boolean {
  const surname = nameTokens(playerName).at(-1);
  // Short surnames ("Ba", "Cho") are too collision-prone to match on alone.
  if (surname === undefined || surname.length < 4) return false;
  const fplWords = [
    ...nameTokens(`${el.first_name} ${el.second_name}`),
    ...nameTokens(el.web_name),
  ];
  const tolerance = surname.length >= 6 ? 1 : 0;
  return fplWords.some((w) => editDistance(w, surname, tolerance) <= tolerance);
}

export function matchFplPlayers(
  elements: FplElement[],
  players: FootballPlayer[],
  clubByFplTeam: Map<number, number>,
): MatchResult {
  const index: NameIndex = new Map();
  for (const p of players) {
    if (p.club_id === null) continue;
    const k = key(p.club_id, p.name);
    index.set(k, index.has(k) ? null : p.id);
  }

  const result: MatchResult = {
    matched: new Map(),
    noClub: [],
    ambiguous: [],
    notFound: [],
  };

  const playersByClub = new Map<number, FootballPlayer[]>();
  for (const p of players) {
    if (p.club_id === null) continue;
    playersByClub.set(p.club_id, [...(playersByClub.get(p.club_id) ?? []), p]);
  }

  // Pass 1: exact names.
  const unresolved: { el: FplElement; clubId: number }[] = [];
  for (const el of elements) {
    const clubId = clubByFplTeam.get(el.team);
    if (clubId === undefined) {
      result.noClub.push(el);
      continue;
    }
    const fullName = key(clubId, `${el.first_name} ${el.second_name}`);
    const webName = key(clubId, el.web_name);
    const hit = index.has(fullName) ? index.get(fullName) : index.get(webName);
    if (hit === undefined) {
      unresolved.push({ el, clubId });
    } else if (hit === null) {
      result.ambiguous.push(el);
    } else {
      result.matched.set(el.id, hit);
    }
  }

  // Passes 2 and 3, each among players earlier passes didn't claim. An
  // element that is ambiguous in pass 2 stays ambiguous: a looser rule
  // can't make it less so.
  let remaining = unresolved;
  for (const fits of [variantMatches, surnameMatches]) {
    const claimed = new Set(result.matched.values());
    const proposals = new Map<FplElement, number>();
    const claimsPerPlayer = new Map<number, number>();
    const next: typeof unresolved = [];
    for (const entry of remaining) {
      const candidates = (playersByClub.get(entry.clubId) ?? []).filter(
        (p) => !claimed.has(p.id) && fits(entry.el, p.name),
      );
      if (candidates.length === 0) {
        next.push(entry);
      } else if (candidates.length > 1) {
        result.ambiguous.push(entry.el);
      } else {
        const playerId = candidates[0].id;
        proposals.set(entry.el, playerId);
        claimsPerPlayer.set(playerId, (claimsPerPlayer.get(playerId) ?? 0) + 1);
      }
    }
    // Two FPL players both fitting one of ours means we can't tell which it is.
    for (const [el, playerId] of proposals) {
      if (claimsPerPlayer.get(playerId) === 1) result.matched.set(el.id, playerId);
      else result.ambiguous.push(el);
    }
    remaining = next;
  }
  result.notFound.push(...remaining.map(({ el }) => el));

  return result;
}
