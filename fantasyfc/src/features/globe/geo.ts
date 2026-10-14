import { geoEquirectangular, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { LEAGUES } from './leagues'

const RASTER_W = 2048
const RASTER_H = RASTER_W / 2

const OCEAN = 0
const OTHER_LAND = 1

/*
  Distinct, well-separated stamp colors so a nearest-match lookup still resolves
  correctly on antialiased country borders, where the canvas blends two fills.
*/
const STAMPS: [number, number, number][] = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [255, 255, 0],
  [255, 0, 255],
  [0, 255, 255],
  [255, 128, 0],
  [255, 255, 255],
  [0, 0, 128],
  [128, 64, 0],
]

const LAND_FILL: [number, number, number] = [70, 70, 70]

export type GlobeDots = {
  positions: Float32Array
  /** 0 = unaffiliated land, otherwise the league id from the leagues config. */
  regions: Float32Array
  count: number
}

function rasterizeWorld(): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = RASTER_W
  canvas.height = RASTER_H
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context unavailable — cannot build globe.')

  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, RASTER_W, RASTER_H)

  const topology = world as unknown as Topology
  const countries = feature(
    topology,
    topology.objects.countries,
  ) as FeatureCollection<Geometry, { name: string }>

  const projection = geoEquirectangular()
    .scale(RASTER_W / (2 * Math.PI))
    .translate([RASTER_W / 2, RASTER_H / 2])
  const path = geoPath(projection, ctx)

  // All land first, then stamp each league's country over it.
  ctx.fillStyle = `rgb(${LAND_FILL.join(',')})`
  ctx.beginPath()
  path(countries)
  ctx.fill()

  LEAGUES.forEach((league, i) => {
    const match = countries.features.find((f) => Number(f.id) === league.id)
    if (!match) return
    ctx.fillStyle = `rgb(${STAMPS[i].join(',')})`
    ctx.beginPath()
    path(match)
    ctx.fill()
  })

  return ctx.getImageData(0, 0, RASTER_W, RASTER_H).data
}

function classify(r: number, g: number, b: number): number {
  if (r < 24 && g < 24 && b < 24) return OCEAN

  let best = OTHER_LAND
  let bestDist = (r - LAND_FILL[0]) ** 2 + (g - LAND_FILL[1]) ** 2 + (b - LAND_FILL[2]) ** 2

  for (let i = 0; i < STAMPS.length; i++) {
    const [sr, sg, sb] = STAMPS[i]
    const dist = (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = LEAGUES[i].id
    }
  }
  return best
}

/**
 * Fibonacci-sphere sampling, keeping only points that land on a continent.
 * `samples` is the pre-mask count; roughly 29% survive.
 */
export function buildGlobeDots(samples = 92000): GlobeDots {
  const pixels = rasterizeWorld()
  const positions: number[] = []
  const regions: number[] = []

  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < samples; i++) {
    const y = 1 - (i / (samples - 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius

    const lat = Math.asin(y) * (180 / Math.PI)
    const lon = Math.atan2(x, z) * (180 / Math.PI)

    const px = Math.min(RASTER_W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * RASTER_W)))
    const py = Math.min(RASTER_H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * RASTER_H)))
    const idx = (py * RASTER_W + px) * 4

    const region = classify(pixels[idx], pixels[idx + 1], pixels[idx + 2])
    if (region === OCEAN) continue

    positions.push(x, y, z)
    regions.push(region === OTHER_LAND ? 0 : region)
  }

  return {
    positions: new Float32Array(positions),
    regions: new Float32Array(regions),
    count: regions.length,
  }
}

/** Matches the sampling convention above: lon 0 faces +Z, i.e. toward the camera. */
export function latLonToVec3(lat: number, lon: number, radius = 1): [number, number, number] {
  const phi = (lat * Math.PI) / 180
  const lambda = (lon * Math.PI) / 180
  return [
    Math.cos(phi) * Math.sin(lambda) * radius,
    Math.sin(phi) * radius,
    Math.cos(phi) * Math.cos(lambda) * radius,
  ]
}
