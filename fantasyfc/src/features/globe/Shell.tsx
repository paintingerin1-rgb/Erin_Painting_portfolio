import { useEffect, useMemo, useRef } from 'react'
import { BackSide, ShaderMaterial } from 'three'
import { readColor } from './palette'

const oceanVertex = /* glsl */ `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const oceanFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uRim;
  varying vec3 vNormalView;

  void main() {
    float facing = clamp(dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
    float rim = pow(1.0 - facing, 3.0);
    // Light from the upper left, kept subtle so the dots stay the focus.
    float lambert = clamp(dot(normalize(vNormalView), normalize(vec3(-0.4, 0.55, 0.75))), 0.0, 1.0);

    vec3 col = uBase * (0.88 + 0.16 * lambert);
    col = mix(col, uRim, rim * 0.5);

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

const glowVertex = /* glsl */ `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec3 vNormalView;

  void main() {
    float intensity = pow(0.66 - dot(normalize(vNormalView), vec3(0.0, 0.0, 1.0)), 3.0);
    float alpha = clamp(intensity, 0.0, 1.0) * uStrength;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`

export function Shell({ theme }: { theme: string }) {
  const oceanRef = useRef<ShaderMaterial>(null)
  const glowRef = useRef<ShaderMaterial>(null)

  const oceanUniforms = useMemo(
    () => ({ uBase: { value: readColor('globe-ocean') }, uRim: { value: readColor('globe-rim') } }),
    [],
  )
  const glowUniforms = useMemo(
    () => ({ uColor: { value: readColor('globe-glow') }, uStrength: { value: 0.36 } }),
    [],
  )

  // Written through the refs because three clones the uniforms object it is given.
  useEffect(() => {
    const ocean = oceanRef.current?.uniforms
    if (ocean) {
      ocean.uBase.value.copy(readColor('globe-ocean'))
      ocean.uRim.value.copy(readColor('globe-rim'))
    }
    const glow = glowRef.current?.uniforms
    if (glow) {
      glow.uColor.value.copy(readColor('globe-glow'))
      glow.uStrength.value = theme === 'dark' ? 0.40 : 0.34
    }
  }, [theme])

  return (
    <>
      {/* Slightly inside the dot shell so back-facing dots are depth-culled. */}
      <mesh>
        <sphereGeometry args={[0.988, 96, 96]} />
        <shaderMaterial
          ref={oceanRef}
          vertexShader={oceanVertex}
          fragmentShader={oceanFragment}
          uniforms={oceanUniforms}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[1.16, 64, 64]} />
        <shaderMaterial
          ref={glowRef}
          vertexShader={glowVertex}
          fragmentShader={glowFragment}
          uniforms={glowUniforms}
          side={BackSide}
          transparent
          depthWrite={false}
        />
      </mesh>
    </>
  )
}
