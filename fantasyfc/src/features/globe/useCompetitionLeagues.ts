import { useEffect, useState } from 'react'
import { listCompetitions, listPublicLeagues, type PublicLeague } from '../leagues/leaguesApi'
import { competitionFor } from './globeData'
import type { League } from './leagues'

export type CompetitionLeagues =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; leagues: PublicLeague[] }

/**
 * The public leagues of the selected globe league's competition (#31).
 * Competitions are fetched once; each selection then loads its own list.
 */
export function useCompetitionLeagues(selected: League | null): CompetitionLeagues {
  const [state, setState] = useState<CompetitionLeagues>({ status: 'idle' })

  useEffect(() => {
    if (!selected?.live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setState({ status: 'loading' })

    loadCompetitions()
      .then((competitions) => {
        const competition = competitionFor(selected, competitions)
        if (!competition) throw new Error(`${selected.league} isn't set up yet.`)
        return listPublicLeagues(competition.id)
      })
      .then((leagues) => {
        if (!cancelled) setState({ status: 'ready', leagues })
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : "Couldn't load leagues.",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [selected])

  return state
}

let competitionsPromise: ReturnType<typeof listCompetitions> | null = null

function loadCompetitions() {
  competitionsPromise ??= listCompetitions().catch((err) => {
    // Let the next selection retry rather than caching the failure.
    competitionsPromise = null
    throw err
  })
  return competitionsPromise
}
