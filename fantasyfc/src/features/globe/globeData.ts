import type { Competition, MyLeague, PublicLeague } from '../leagues/leaguesApi'
import type { League } from './leagues'

/** One row in the globe panel's list of public leagues. */
export type PanelLeague = {
  id: number
  name: string
  /** Already a member: the row opens the league instead of joining it. */
  joined: boolean
}

/** The database competition behind a globe league, matched on its code. */
export function competitionFor(league: League, competitions: Competition[]): Competition | null {
  return competitions.find((c) => c.code === league.code) ?? null
}

/**
 * Public leagues for the panel, ones the user can still join first. Within
 * each group the API's order (newest first) is kept.
 */
export function toPanelLeagues(
  publicLeagues: PublicLeague[],
  myLeagues: Pick<MyLeague, 'id'>[],
): PanelLeague[] {
  const mine = new Set(myLeagues.map((l) => l.id))
  const rows = publicLeagues.map((l) => ({ id: l.id, name: l.name, joined: mine.has(l.id) }))
  return [...rows.filter((r) => !r.joined), ...rows.filter((r) => r.joined)]
}

/** The create form, with this league's competition preselected. */
export function createLeagueHref(league: League): string {
  return `/leagues/create?competition=${encodeURIComponent(league.code)}`
}
