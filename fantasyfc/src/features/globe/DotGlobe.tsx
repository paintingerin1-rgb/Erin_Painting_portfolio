import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PerspectiveCamera, ShaderMaterial } from 'three'
import type { GlobeDots } from './geo'
import { LEAGUES } from './leagues'
import { PALETTE_SLOTS, readColor, readPalette } from './palette'

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uReveal;
  uniform float uSize;
  uniform float uScale;
  uniform float uSelected;
  uniform float uDimOthers;
  uniform vec3 uPalette[${PALETTE_SLOTS}];

  attribute float aSlot;
  attribute float aDelay;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vGlow;
  varying float vAlpha;

  void main() {
    float local = clamp((uReveal - aDelay * 0.55) / 0.45, 0.0, 1.0);
    float ease = 1.0 - pow(1.0 - local, 3.0);

    vec3 p = position * mix(0.55, 1.0, ease);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    float isRegion = step(0.5, aSlot);
    float selected = isRegion * step(abs(aSlot - uSelected), 0.5) * step(0.5, uSelected);
    float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + aPhase * 6.2831853);

    vColor = uPalette[int(aSlot)];
    vGlow = isRegion * (0.20 + 0.22 * pulse) + selected * 0.55;

    // Fade unrelated dots back once a region is chosen, so focus reads clearly.
    float muted = uDimOthers * (1.0 - selected) * (1.0 - isRegion * 0.35);
    vAlpha = mix(mix(0.78, 1.0, isRegion), 0.30, muted) * ease;

    // uSize is a world-space diameter; uScale converts it to device pixels.
    float size = uSize * (1.0 + isRegion * 0.32 + selected * 0.55) * ease;
    gl_PointSize = max(1.0, size * uScale / max(0.001, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uEmphasis;

  varying vec3 vColor;
  varying float vGlow;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.34, d) * vAlpha;
    if (alpha < 0.01) discard;

    gl_FragColor = vec4(mix(vColor, uEmphasis, vGlow * 0.4), alpha);
    #include <colorspace_fragment>
  }
`

/**
 * Writes a uniform on the live material. Three clones the uniforms object it is
 * handed, so values have to go through the material itself; doing it here
 * keeps the mutation out of the component, where the hooks lint forbids it.
 */
function setUniform(material: ShaderMaterial | null, name: string, value: number) {
  const uniform = material?.uniforms[name]
  if (uniform) uniform.value = value
}

/** Stable pseudo-random value in [0, 1) per dot index, so renders stay pure. */
function hash01(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

type Props = {
  dots: GlobeDots
  selectedId: number | null
  theme: string
  reducedMotion: boolean
}

export function DotGlobe({ dots, selectedId, theme, reducedMotion }: Props) {
  const materialRef = useRef<ShaderMaterial>(null)
  const revealRef = useRef(reducedMotion ? 1 : 0)
  const dimRef = useRef(0)
  const timeRef = useRef(0)

  const palette = useMemo(() => new Float32Array(PALETTE_SLOTS * 3), [])

  const attributes = useMemo(() => {
    const count = dots.count
    const slots = new Float32Array(count)
    const delays = new Float32Array(count)
    const phases = new Float32Array(count)
    const slotById = new Map(LEAGUES.map((l, i) => [l.id, i + 1]))

    for (let i = 0; i < count; i++) {
      slots[i] = slotById.get(dots.regions[i]) ?? 0
      // North-to-south sweep on entrance.
      delays[i] = (1 - dots.positions[i * 3 + 1]) / 2
      phases[i] = hash01(i)
    }
    return { slots, delays, phases }
  }, [dots])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uReveal: { value: reducedMotion ? 1 : 0 },
      uSize: { value: 0.0062 },
      uScale: { value: 1000 },
      uSelected: { value: 0 },
      uDimOthers: { value: 0 },
      uEmphasis: { value: readColor('globe-emphasis') },
      uPalette: { value: palette },
    }),
    // Built once on purpose; values below are mutated in place each frame.
    [palette, reducedMotion],
  )

  useEffect(() => {
    const u = materialRef.current?.uniforms
    if (!u) return
    readPalette(u.uPalette.value)
    // Pulsing dots mix toward this, so the live country glows brighter.
    u.uEmphasis.value.copy(readColor('globe-emphasis'))
  }, [theme])

  useEffect(() => {
    const index = LEAGUES.findIndex((l) => l.id === selectedId)
    setUniform(materialRef.current, 'uSelected', index >= 0 ? index + 1 : 0)
  }, [selectedId])

  const { size, camera, gl } = useThree()
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const fov = (camera.fov * Math.PI) / 180
    setUniform(materialRef.current, 'uScale', gl.domElement.height / (2 * Math.tan(fov / 2)))
  }, [size, camera, gl])

  useFrame((_, delta) => {
    const material = materialRef.current
    if (!material) return

    const step = Math.min(delta, 0.05)
    timeRef.current += step
    setUniform(material, 'uTime', timeRef.current)

    if (revealRef.current < 1) {
      revealRef.current = Math.min(1, revealRef.current + step / 1.9)
      setUniform(material, 'uReveal', revealRef.current)
    }

    const dimTarget = selectedId ? 1 : 0
    dimRef.current += (dimTarget - dimRef.current) * Math.min(1, step * 6)
    setUniform(material, 'uDimOthers', dimRef.current)
  })

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[dots.positions, 3]} />
        <bufferAttribute attach="attributes-aSlot" args={[attributes.slots, 1]} />
        <bufferAttribute attach="attributes-aDelay" args={[attributes.delays, 1]} />
        <bufferAttribute attach="attributes-aPhase" args={[attributes.phases, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  )
}
