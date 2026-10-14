import type { PublicLeague } from "./leaguesApi";

/**
 * The public leagues whose name or competition contains every word of the
 * query, ignoring case and accents, so "laliga thunder" and "Ligue" both
 * find what you'd expect. An empty query keeps every league.
 */
export function filterPublicLeagues(
  leagues: PublicLeague[],
  query: string,
  competitionNames: Map<number, string>,
): PublicLeague[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return leagues;
  return leagues.filter((league) => {
    const haystack = normalise(
      `${league.name} ${competitionNames.get(league.competitionId) ?? ""}`,
    );
    return words.every((word) => haystack.includes(word));
  });
}

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
