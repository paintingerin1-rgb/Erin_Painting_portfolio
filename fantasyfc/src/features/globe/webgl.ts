/**
 * True when the browser can create a WebGL context. The globe needs one; old
 * hardware, some VMs and locked-down browsers can't provide it.
 */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}
