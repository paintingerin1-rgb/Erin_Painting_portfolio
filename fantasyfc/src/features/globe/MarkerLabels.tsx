import { LEAGUES } from './leagues'
import type { League } from './leagues'
import { labelLayout } from './markerLayout'

type Props = {
  /** Filled with one element per league, in LEAGUES order. Markers moves them. */
  labelsRef: React.RefObject<(HTMLDivElement | null)[]>
  selectedId: number | null
  onSelect: (league: League) => void
}

/**
 * The league labels, as plain DOM laid over the canvas. Markers (inside the 3D
 * scene) projects each league's point to the screen every frame and writes the
 * position and fade straight onto these elements.
 *
 * They live in the page's own React tree rather than in drei's <Html>, which
 * gives each label its own React root; those roots can't be torn down cleanly
 * when the route changes, and leaving the page threw.
 */
export function MarkerLabels({ labelsRef, selectedId, onSelect }: Props) {
  return (
    <div className="globe-marker-layer">
      {LEAGUES.map((league, i) => {
        const { offset, leader } = labelLayout(league)
        return (
          <div
            key={league.id}
            className="globe-marker"
            data-selected={league.id === selectedId || undefined}
            data-soon={league.live ? undefined : true}
            ref={(el) => {
              labelsRef.current[i] = el
            }}
            style={
              {
                opacity: 0,
                pointerEvents: 'none',
                '--accent': `var(--${league.token})`,
              } as React.CSSProperties
            }
          >
            <span
              className="globe-marker-leader"
              aria-hidden="true"
              style={{
                width: `${leader.length}px`,
                transform: `rotate(${leader.angle}deg)`,
              }}
            />
            <span className="globe-marker-pin" aria-hidden="true" />
            <button
              type="button"
              className="globe-marker-button"
              style={{
                transform: `translate(-50%, -50%) translate(${offset[0]}px, ${offset[1]}px)`,
              }}
              // Keep the press from reaching the canvas, which would start a drag.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelect(league)}
            >
              <span className="globe-marker-league">{league.league}</span>
              <span className={league.live ? 'globe-badge globe-badge--live' : 'globe-badge'}>
                {league.live ? 'Live' : 'Coming soon'}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
