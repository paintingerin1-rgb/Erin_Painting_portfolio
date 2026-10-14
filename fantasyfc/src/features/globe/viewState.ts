/** The geo coordinate currently facing the camera, plus camera distance. */
export type ViewState = {
  lat: number
  lon: number
  dist: number
}

export const DIST_MIN = 2.1
export const DIST_MAX = 4.7
export const DIST_START = 7.4
export const DIST_SELECTED = 2.45

/** Markers begin fading in below DIST_MARKERS_HIDDEN and are full by DIST_MARKERS_VISIBLE. */
export const DIST_MARKERS_HIDDEN = 3.9
export const DIST_MARKERS_VISIBLE = 3.0

export const LAT_LIMIT = 78

/** A timed camera move that overrides the frame-by-frame smoothing while it runs. */
export type Flight = {
  active: boolean
  elapsed: number
  duration: number
  from: ViewState
  to: ViewState
}

export const FLIGHT_TO_LEAGUE = 1.0
export const FLIGHT_BACK = 0.75

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Longitude is unbounded — dragging accumulates it past ±180 — so a raw tween
 * to a league's anchor can spin the long way round the globe. Rewrite the
 * destination to whichever equivalent angle is nearest the current heading.
 */
export function nearestLon(from: number, to: number): number {
  let delta = (to - from) % 360
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return from + delta
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** Frame-rate independent smoothing — `k` is roughly "how fast", not per-frame. */
export function damp(current: number, goal: number, k: number, dt: number): number {
  return current + (goal - current) * (1 - Math.exp(-k * dt))
}
