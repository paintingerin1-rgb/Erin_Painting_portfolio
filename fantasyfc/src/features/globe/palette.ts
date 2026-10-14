import { Color } from 'three'
import { LEAGUES } from './leagues'

/** Palette slot 0 is unaffiliated land; slots 1..n map to LEAGUES order. */
export const PALETTE_SLOTS = LEAGUES.length + 1

function readToken(name: string): string {
  // Tokens are scoped to the screen (globeTokens.css), not :root.
  const scope = document.querySelector('.globe-discovery') ?? document.documentElement
  const value = getComputedStyle(scope).getPropertyValue(`--${name}`).trim()
  return value || '#888888'
}

/**
 * Tokens are theme-dependent and live in CSS, so the shader palette has to be
 * re-read whenever the theme flips rather than baked in at build time.
 */
export function readPalette(target: Float32Array): Float32Array {
  const color = new Color()

  color.setStyle(readToken('globe-land'))
  target[0] = color.r
  target[1] = color.g
  target[2] = color.b

  LEAGUES.forEach((league, i) => {
    color.setStyle(readToken(league.token))
    const o = (i + 1) * 3
    target[o] = color.r
    target[o + 1] = color.g
    target[o + 2] = color.b
  })

  return target
}

export function readColor(token: string): Color {
  return new Color().setStyle(readToken(token))
}
