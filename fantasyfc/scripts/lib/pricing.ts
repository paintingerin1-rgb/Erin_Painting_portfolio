// Player prices (#36): varied, and reflecting how good a player is.
//
// Premier League players take FPL's own price (now_cost) wherever the name
// matcher finds them. Everyone else - the other nine leagues, and PL players
// FPL doesn't list - is priced by rank: players are ordered within their
// league and position by a status score, and the order is laid over FPL's
// real price spread for that position. So each league's best striker costs
// what a top PL striker does, its fringe defenders about £4m, and a £100m
// budget is as tight in every league as it is in FPL.
//
// Status score, 0..1: mostly the player's season points (FPL rules, from our
// match stats), the rest their club's form (points per game from completed
// fixtures), which also separates players who haven't played yet.

export type Position = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export const POSITIONS: Position[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

/** Share of the status score that comes from club form rather than points. */
export const CLUB_WEIGHT = 0.4;

export interface PricedPlayer {
  id: number;
  competitionId: number;
  position: string;
  clubId: number | null;
  /** Season points so far under FPL rules; 0 if they haven't played. */
  points: number;
}

export interface CompletedFixture {
  home_club_id: number;
  away_club_id: number;
  home_score: number | null;
  away_score: number | null;
}

/** Each club's points per game (0..3) over its completed fixtures. */
export function clubForm(fixtures: CompletedFixture[]): Map<number, number> {
  const totals = new Map<number, { points: number; games: number }>();
  const add = (club: number, points: number) => {
    const t = totals.get(club) ?? { points: 0, games: 0 };
    t.points += points;
    t.games += 1;
    totals.set(club, t);
  };
  for (const f of fixtures) {
    if (f.home_score == null || f.away_score == null) continue;
    const home = f.home_score > f.away_score ? 3 : f.home_score === f.away_score ? 1 : 0;
    const away = f.away_score > f.home_score ? 3 : f.home_score === f.away_score ? 1 : 0;
    add(f.home_club_id, home);
    add(f.away_club_id, away);
  }
  return new Map([...totals].map(([club, t]) => [club, t.points / t.games]));
}

/**
 * The price at a player's rank: rank 0 (best) gets the template's top price,
 * the last rank its bottom one, and everyone in between the price at the
 * same position in the spread. `template` must be sorted ascending.
 */
export function priceAtRank(template: number[], rank: number, count: number): number {
  if (template.length === 0) throw new Error("Empty price template.");
  const fromTop = count <= 1 ? 0 : rank / (count - 1);
  return template[Math.round((1 - fromTop) * (template.length - 1))];
}

/**
 * New prices for every player with a known position. `fixed` holds prices
 * that win outright (FPL's own for matched PL players); everyone else is
 * priced by rank within their competition and position.
 */
export function priceByStatus(
  players: PricedPlayer[],
  form: Map<number, number>,
  templates: Record<Position, number[]>,
  fixed: Map<number, number> = new Map(),
): Map<number, number> {
  const prices = new Map<number, number>();
  const groups = new Map<string, PricedPlayer[]>();

  // Fixed-price players still take part in the ranking, so a PL player FPL
  // doesn't list is ranked against the whole PL, not just the other unlisted.
  for (const p of players) {
    if (!POSITIONS.includes(p.position as Position)) continue;
    const price = fixed.get(p.id);
    if (price !== undefined) prices.set(p.id, price);
    const key = `${p.competitionId}:${p.position}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  for (const group of groups.values()) {
    const maxPoints = Math.max(1, ...group.map((p) => p.points));
    const score = (p: PricedPlayer) =>
      (1 - CLUB_WEIGHT) * (Math.max(0, p.points) / maxPoints) +
      CLUB_WEIGHT * ((p.clubId !== null ? (form.get(p.clubId) ?? 0) : 0) / 3);

    const ranked = group
      .map((p) => ({ p, s: score(p) }))
      .sort((a, b) => b.s - a.s || b.p.points - a.p.points || a.p.id - b.p.id);

    const template = templates[group[0].position as Position];
    ranked.forEach(({ p }, rank) => {
      if (!fixed.has(p.id)) prices.set(p.id, priceAtRank(template, rank, ranked.length));
    });
  }

  return prices;
}
