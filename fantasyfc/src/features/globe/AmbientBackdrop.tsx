import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { League } from './leagues'
import './ambientBackdrop.css'

const FADE_MS = 900

type Layer = { id: number; league: League | null }

/**
 * Horizon wash — light pools below the globe with a faint rim above it and one
 * slow drifting field in the upper corner, in the selected league's colours.
 *
 * League changes cross-fade rather than snap: each change pushes a new layer on
 * top and the stack collapses to one once the fade has finished.
 */
export function AmbientBackdrop({ league }: { league: League | null }) {
  const [stack, setStack] = useState<Layer[]>([{ id: 0, league: null }])
  const nextId = useRef(1)
  const shown = useRef<League | null>(null)

  useEffect(() => {
    if (shown.current === league) return
    shown.current = league

    const id = nextId.current++
    setStack((prev) => [...prev, { id, league }])

    // Collapse to the newest layer once it has finished covering the old one.
    const timer = window.setTimeout(() => {
      setStack((prev) => {
        const i = prev.findIndex((l) => l.id === id)
        return i === -1 ? prev : prev.slice(i)
      })
    }, FADE_MS)

    return () => window.clearTimeout(timer)
  }, [league])

  return (
    <div className="globe-ambient" aria-hidden="true">
      {stack.map(({ id, league: l }) => (
        <div
          key={id}
          className="globe-ambient-layer"
          // Layer 0 is already in place at mount; only later ones fade in.
          data-enter={id > 0 || undefined}
          style={
            {
              '--accent': l ? `var(--${l.token})` : 'var(--globe-soon)',
              '--accent-2': l ? `var(--${l.token2})` : 'var(--globe-soon-2)',
              // Quoted: inlined SVG data URIs carry commas and quotes that
              // would terminate a bare url() token.
              '--crest': l ? `url("${l.logo}")` : 'none',
              '--crest-scale': l ? l.crestScale : 1,
            } as CSSProperties
          }
        >
          <div className="globe-ambient-floor" />
          <div className="globe-ambient-rim" />
          <div className="globe-ambient-drift" />
          {l && <div className="globe-ambient-crest" />}
        </div>
      ))}
    </div>
  )
}
