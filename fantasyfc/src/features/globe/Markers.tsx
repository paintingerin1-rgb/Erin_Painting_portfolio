import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { LEAGUES } from './leagues'
import { latLonToVec3 } from './geo'
import { readColor } from './palette'
import type { ViewState } from './viewState'
import { DIST_MARKERS_HIDDEN, DIST_MARKERS_VISIBLE } from './viewState'

const ringVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ringFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float ring = smoothstep(0.78, 0.92, d) * (1.0 - smoothstep(0.95, 1.02, d));
    float alpha = ring * uOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`

type Props = {
  view: React.RefObject<ViewState>
  selectedId: number | null
  /** The DOM labels rendered by MarkerLabels, in LEAGUES order. */
  labelsRef: React.RefObject<(HTMLDivElement | null)[]>
}

/**
 * The pulsing ring on each league's country, plus the per-frame work for its
 * label: project the point to the screen, move the label there, and fade it
 * with zoom and with which side of the globe the point is on.
 */
export function Markers({ view, selectedId, labelsRef }: Props) {
  const anchors = useRef<(Group | null)[]>([])
  const rings = useRef<(Mesh | null)[]>([])
  const ringMaterials = useRef<(ShaderMaterial | null)[]>([])

  const placements = useMemo(
    () =>
      LEAGUES.map((league) => {
        const pos = latLonToVec3(league.anchor.lat, league.anchor.lon, 1.002)
        const dir = new Vector3(...pos).normalize()
        const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), dir)
        return { league, pos, quaternion, color: readColor(league.token) }
      }),
    [],
  )

  const world = useMemo(() => new Vector3(), [])
  const screen = useMemo(() => new Vector3(), [])
  const clock = useRef(0)

  useFrame(({ camera, size }, delta) => {
    clock.current += Math.min(delta, 0.05)
    const dist = view.current.dist

    // 0 when zoomed out, 1 once the user has come in close enough to pick.
    const zoomK = Math.min(
      1,
      Math.max(0, (DIST_MARKERS_HIDDEN - dist) / (DIST_MARKERS_HIDDEN - DIST_MARKERS_VISIBLE)),
    )

    placements.forEach((placement, i) => {
      const anchor = anchors.current[i]
      const label = labelsRef.current[i]
      if (!anchor) return

      world.setFromMatrixPosition(anchor.matrixWorld)
      const facing = world.clone().normalize().z
      const facingK = Math.min(1, Math.max(0, (facing - 0.02) / 0.33))

      const isSelected = placement.league.id === selectedId
      // Once a league is chosen, the others get out of the way.
      const crowdedOut = selectedId !== null && !isSelected
      const opacity = crowdedOut ? 0 : Math.max(zoomK * facingK, isSelected ? facingK : 0)

      if (label) {
        screen.copy(world).project(camera)
        const x = ((screen.x + 1) / 2) * size.width
        const y = ((1 - screen.y) / 2) * size.height
        label.style.transform = `translate(${x}px, ${y}px)`
        label.style.opacity = String(opacity)
        label.style.pointerEvents = opacity > 0.45 ? 'auto' : 'none'
      }

      const ring = rings.current[i]
      const material = ringMaterials.current[i]
      if (ring && material) {
        const phase = (clock.current * 0.5 + i * 0.31) % 1
        ring.scale.setScalar(0.6 + phase * 0.85)
        material.uniforms.uOpacity.value =
          (1 - phase) * (isSelected ? 0.55 : 0.32) * Math.max(opacity, crowdedOut ? 0 : zoomK * facingK)
      }
    })
  })

  return (
    <>
      {placements.map((placement, i) => (
        <group
          key={placement.league.id}
          position={placement.pos}
          quaternion={placement.quaternion}
          ref={(el) => {
            anchors.current[i] = el
          }}
        >
          <mesh
            ref={(el) => {
              rings.current[i] = el
            }}
          >
            <planeGeometry args={[0.19, 0.19]} />
            <shaderMaterial
              ref={(el) => {
                ringMaterials.current[i] = el
              }}
              vertexShader={ringVertex}
              fragmentShader={ringFragment}
              uniforms={{
                uColor: { value: placement.color },
                uOpacity: { value: 0 },
              }}
              transparent
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
