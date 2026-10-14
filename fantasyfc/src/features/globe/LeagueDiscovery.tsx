import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GlobeCanvas } from './GlobeCanvas'
import { AmbientBackdrop } from './AmbientBackdrop'
import { RegionPanel } from './RegionPanel'
import { buildGlobeDots } from './geo'
import type { League } from './leagues'
import { LEAGUES } from './leagues'
import { toPanelLeagues, type PanelLeague } from './globeData'
import { useCompetitionLeagues } from './useCompetitionLeagues'
import { joinPublicLeague } from '../leagues/leaguesApi'
import { useCurrentLeague } from '../../contexts/CurrentLeagueContext'

// The app is dark-only. The globe components still take a theme so the
// prototype's shaders keep working unchanged.
const THEME = 'dark'

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

export function LeagueDiscovery() {
  const navigate = useNavigate()
  const dots = useMemo(() => buildGlobeDots(), [])
  const reducedMotion = usePrefersReducedMotion()
  const [selected, setSelected] = useState<League | null>(null)
  const [zoomedIn, setZoomedIn] = useState(false)
  const chromeHidden = selected !== null || zoomedIn

  const { leagues: myLeagues, refreshLeagues, setLeagueId } = useCurrentLeague()
  const competitionLeagues = useCompetitionLeagues(selected)
  const rows = useMemo(
    () =>
      competitionLeagues.status === 'ready'
        ? toPanelLeagues(competitionLeagues.leagues, myLeagues)
        : [],
    [competitionLeagues, myLeagues],
  )
  const [joiningId, setJoiningId] = useState<number | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)

  const select = (league: League | null) => {
    setSelected(league)
    setJoinError(null)
    setCodeOpen(false)
  }

  // The same calls the Join page makes, then the joined league becomes the
  // current one and the user lands on it.
  const join = async (row: PanelLeague) => {
    setJoiningId(row.id)
    setJoinError(null)
    try {
      await joinPublicLeague(row.id)
      await refreshLeagues()
      setLeagueId(row.id)
      navigate(`/leagues/${row.id}`)
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Couldn't join that league.")
      setJoiningId(null)
    }
  }

  const open = (row: PanelLeague) => {
    setLeagueId(row.id)
    navigate(`/leagues/${row.id}`)
  }

  // A code can be for a league in any competition, so land on whichever it was.
  const joinedByCode = (leagueId: number) => {
    setLeagueId(leagueId)
    navigate(`/leagues/${leagueId}`)
  }

  // Escape steps back one level: the code form first, then the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (codeOpen) setCodeOpen(false)
      else setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [codeOpen])

  return (
    <div
      className="globe-discovery"
      // Dedicated variable so the vignette can tint without leaking into the
      // chips and panel actions, which set their own --accent.
      style={{ '--vig': selected ? `var(--${selected.token})` : 'var(--globe-vignette)' } as React.CSSProperties}
    >
      <AmbientBackdrop league={selected} />

      <GlobeCanvas
        dots={dots}
        selected={selected}
        onSelect={select}
        onZoomedChange={setZoomedIn}
        theme={THEME}
        reducedMotion={reducedMotion}
      />

      <header className="globe-discovery-head" data-dim={chromeHidden || undefined}>
        <p className="globe-kicker">Find a league</p>
        <h1 className="globe-discovery-title">Pick a league</h1>
        <p className="globe-discovery-lede">
          Ten leagues are live. Pick a country to join a league or start your own.
        </p>
      </header>

      <div className="globe-discovery-hint" data-dim={chromeHidden || undefined}>
        <span>Drag to spin</span>
        <span className="globe-dot-sep" aria-hidden="true" />
        <span>Scroll to zoom in</span>
      </div>

      <nav className="globe-quick-jump" data-dim={selected ? true : undefined} aria-label="Jump to a league">
        {LEAGUES.map((league) => (
          <button
            key={league.slug}
            type="button"
            className="globe-chip"
            data-soon={league.live ? undefined : true}
            title={league.live ? league.league : `${league.league}: coming soon`}
            style={{ '--accent': `var(--${league.token})` } as React.CSSProperties}
            onClick={() => select(league)}
          >
            {league.short}
          </button>
        ))}
      </nav>

      <RegionPanel
        league={selected}
        leagues={competitionLeagues}
        rows={rows}
        joiningId={joiningId}
        joinError={joinError}
        onJoin={join}
        onOpen={open}
        onDismiss={() => select(null)}
        onShowLive={() => select(LEAGUES.find((l) => l.live) ?? null)}
        codeOpen={codeOpen}
        onOpenCode={() => setCodeOpen(true)}
        onCloseCode={() => setCodeOpen(false)}
        onCodeJoined={joinedByCode}
      />
    </div>
  )
}
