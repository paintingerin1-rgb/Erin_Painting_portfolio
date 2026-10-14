import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Group } from 'three'
import type { GlobeDots } from './geo'
import type { League } from './leagues'
import { DotGlobe } from './DotGlobe'
import { Shell } from './Shell'
import { Markers } from './Markers'
import { MarkerLabels } from './MarkerLabels'
import type { Flight, ViewState } from './viewState'
import {
  DIST_MARKERS_HIDDEN,
  DIST_MAX,
  DIST_MIN,
  DIST_SELECTED,
  DIST_START,
  FLIGHT_BACK,
  FLIGHT_TO_LEAGUE,
  LAT_LIMIT,
  clamp,
  damp,
  easeInOutCubic,
  nearestLon,
} from './viewState'

const AUTO_ROTATE_DEG_PER_SEC = 3.2
const IDLE_BEFORE_AUTOROTATE = 1.6

type SceneProps = {
  dots: GlobeDots
  viewRef: React.RefObject<ViewState>
  targetRef: React.RefObject<ViewState>
  flightRef: React.RefObject<Flight>
  idleForRef: React.RefObject<number>
  draggingRef: React.RefObject<boolean>
  labelsRef: React.RefObject<(HTMLDivElement | null)[]>
  selectedId: number | null
  onZoomedChange: (zoomed: boolean) => void
  theme: string
  reducedMotion: boolean
}

function Scene({
  dots,
  viewRef,
  targetRef,
  flightRef,
  idleForRef,
  draggingRef,
  labelsRef,
  selectedId,
  onZoomedChange,
  theme,
  reducedMotion,
}: SceneProps) {
  const groupRef = useRef<Group>(null)
  const zoomedRef = useRef(false)

  useFrame(({ camera }, delta) => {
    const step = Math.min(delta, 0.05)
    const f = flightRef.current

    if (!draggingRef.current) idleForRef.current += step
    else idleForRef.current = 0

    if (f.active) {
      // A selection change owns the camera outright until it lands, so the
      // move reads as one deliberate gesture rather than a decay curve.
      f.elapsed += step
      const t = Math.min(1, f.elapsed / f.duration)
      const e = easeInOutCubic(t)

      viewRef.current.lat = f.from.lat + (f.to.lat - f.from.lat) * e
      viewRef.current.lon = f.from.lon + (f.to.lon - f.from.lon) * e
      viewRef.current.dist = f.from.dist + (f.to.dist - f.from.dist) * e

      // Keep the goal in step so there is nothing left to settle on landing.
      targetRef.current.lat = viewRef.current.lat
      targetRef.current.lon = viewRef.current.lon
      targetRef.current.dist = viewRef.current.dist

      idleForRef.current = 0
      if (t >= 1) f.active = false
    } else {
      const canAutoRotate =
        !reducedMotion &&
        !draggingRef.current &&
        !selectedId &&
        idleForRef.current > IDLE_BEFORE_AUTOROTATE
      if (canAutoRotate) {
        targetRef.current.lon -= AUTO_ROTATE_DEG_PER_SEC * step
      }

      if (reducedMotion) {
        viewRef.current.lat = targetRef.current.lat
        viewRef.current.lon = targetRef.current.lon
        viewRef.current.dist = targetRef.current.dist
      } else {
        // Distance settles a little slower than heading, which gives the zoom
        // some weight instead of everything arriving at once.
        viewRef.current.lat = damp(viewRef.current.lat, targetRef.current.lat, 9, step)
        viewRef.current.lon = damp(viewRef.current.lon, targetRef.current.lon, 9, step)
        viewRef.current.dist = damp(viewRef.current.dist, targetRef.current.dist, 6.5, step)
      }
    }

    if (groupRef.current) {
      groupRef.current.rotation.set(
        (viewRef.current.lat * Math.PI) / 180,
        (-viewRef.current.lon * Math.PI) / 180,
        0,
      )
    }

    camera.position.set(0, 0, viewRef.current.dist)
    camera.lookAt(0, 0, 0)

    // Hysteresis so the chrome doesn't flicker while hovering the threshold.
    const d = viewRef.current.dist
    const zoomed = zoomedRef.current ? d < DIST_MARKERS_HIDDEN + 0.3 : d < DIST_MARKERS_HIDDEN
    if (zoomed !== zoomedRef.current) {
      zoomedRef.current = zoomed
      onZoomedChange(zoomed)
    }
  })

  return (
    <group ref={groupRef}>
      <Shell theme={theme} />
      <DotGlobe
        dots={dots}
        selectedId={selectedId}
        theme={theme}
        reducedMotion={reducedMotion}
      />
      <Markers view={viewRef} selectedId={selectedId} labelsRef={labelsRef} />
    </group>
  )
}

type Props = {
  dots: GlobeDots
  selected: League | null
  onSelect: (league: League) => void
  onZoomedChange: (zoomed: boolean) => void
  theme: string
  reducedMotion: boolean
}

export function GlobeCanvas({
  dots,
  selected,
  onSelect,
  onZoomedChange,
  theme,
  reducedMotion,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const view = useRef<ViewState>({ lat: 30, lon: -30, dist: DIST_START })
  const target = useRef<ViewState>({ lat: 32, lon: 4, dist: DIST_MAX })
  const flight = useRef<Flight>({
    active: false,
    elapsed: 0,
    duration: FLIGHT_TO_LEAGUE,
    from: { lat: 0, lon: 0, dist: 0 },
    to: { lat: 0, lon: 0, dist: 0 },
  })
  const idleFor = useRef(0)
  const dragging = useRef(false)
  const pointer = useRef({ x: 0, y: 0, id: -1, moved: 0 })
  /** Stays false until the first real selection, so mount doesn't fly. */
  const hasSelected = useRef(false)
  const labels = useRef<(HTMLDivElement | null)[]>([])

  // Reduced motion skips the fly-in entirely rather than easing it faster.
  useEffect(() => {
    if (reducedMotion) {
      view.current = { ...target.current }
    }
  }, [reducedMotion])

  useEffect(() => {
    // The opening fly-in is already set up as a damped move from DIST_START to
    // the resting target; a flight here would overwrite it on mount.
    if (!hasSelected.current) {
      if (!selected) return
      hasSelected.current = true
    }

    // Going back keeps the heading you were on and just pulls out to the
    // whole globe — the point is to see the others from where you are.
    const to: ViewState = selected
      ? {
          lat: selected.anchor.lat,
          lon: nearestLon(view.current.lon, selected.anchor.lon),
          dist: DIST_SELECTED,
        }
      : { lat: view.current.lat, lon: view.current.lon, dist: DIST_MAX }

    idleFor.current = 0

    if (reducedMotion) {
      view.current = { ...to }
      target.current = { ...to }
      flight.current.active = false
      return
    }

    flight.current = {
      active: true,
      elapsed: 0,
      duration: selected ? FLIGHT_TO_LEAGUE : FLIGHT_BACK,
      from: { ...view.current },
      to,
    }
  }, [selected, reducedMotion])

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      // Touching the controls hands the camera back to you mid-flight.
      flight.current.active = false
      const scale = e.deltaMode === 1 ? 0.05 : 0.0022
      target.current.dist = clamp(target.current.dist + e.deltaY * scale, DIST_MIN, DIST_MAX)
      idleFor.current = 0
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handlers = useMemo(
    () => ({
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        dragging.current = true
        // Grabbing cancels an in-flight move and picks up from where it got to.
        flight.current.active = false
        target.current = { ...view.current }
        pointer.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }
        e.currentTarget.setPointerCapture(e.pointerId)
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current || e.pointerId !== pointer.current.id) return
        const dx = e.clientX - pointer.current.x
        const dy = e.clientY - pointer.current.y
        pointer.current.x = e.clientX
        pointer.current.y = e.clientY
        pointer.current.moved += Math.abs(dx) + Math.abs(dy)

        // Scale with zoom so the surface tracks the cursor at any distance.
        const k = 0.24 * (view.current.dist / DIST_MAX)
        target.current.lon -= dx * k
        target.current.lat = clamp(target.current.lat + dy * k, -LAT_LIMIT, LAT_LIMIT)
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        dragging.current = false
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId)
        }
      },
    }),
    [],
  )

  return (
    <div
      ref={wrapperRef}
      className="globe-canvas"
      {...handlers}
      onPointerCancel={handlers.onPointerUp}
    >
      <Canvas
        camera={{ position: [0, 0, DIST_START], fov: 38, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene
          dots={dots}
          viewRef={view}
          targetRef={target}
          flightRef={flight}
          idleForRef={idleFor}
          draggingRef={dragging}
          labelsRef={labels}
          selectedId={selected?.id ?? null}
          onZoomedChange={onZoomedChange}
          theme={theme}
          reducedMotion={reducedMotion}
        />
      </Canvas>
      <MarkerLabels labelsRef={labels} selectedId={selected?.id ?? null} onSelect={onSelect} />
    </div>
  )
}
