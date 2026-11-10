import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { rendererName } from './gpu'

// ?perf=1: publica en window.__wh3dPerf (cada segundo) FPS, draw calls, triángulos y objetos, y lo enseña en un
// marcador en la esquina del 3D (PerfOverlay) junto con el nombre del renderizador (la GPU o "Basic Render Driver"
// si el navegador pinta por software). Sirve para medir antes/después de optimizar.
export type PerfStats = { fps: number; drawCalls: number; triangles: number; objects: number; textures: number; dpr: number; renderer: string }

const EVENT = 'wh3d-perf'

// Fuera del Canvas: pinta las últimas cifras. Se actualiza con el evento que lanza PerfProbe.
export function PerfOverlay() {
  const [stats, setStats] = useState<PerfStats | null>(null)
  useEffect(() => {
    const on = (e: Event) => setStats((e as CustomEvent<PerfStats>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  if (!stats) return null
  return (
    <div className="perf-overlay">
      <b>{stats.fps > 0 ? `${stats.fps} fps` : 'bajo demanda'}</b> · {stats.drawCalls} draw calls · {(stats.triangles / 1000).toFixed(0)}k tri · dpr {stats.dpr} · {window.innerWidth}×{window.innerHeight}
      <br />
      {stats.renderer}
    </div>
  )
}

export default function PerfProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const frameloop = useThree((s) => s.frameloop)
  const acc = useRef({ frames: 0, since: 0 })

  const publish = (fps: number) => {
    let objects = 0
    scene.traverse((o) => {
      if ('isMesh' in o || 'isLine' in o || 'isSprite' in o) objects++
    })
    const stats: PerfStats = {
      fps,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      objects,
      textures: gl.info.memory.textures,
      dpr: gl.getPixelRatio(),
      renderer: rendererName(gl.getContext() as WebGLRenderingContext),
    }
    ;(window as unknown as { __wh3dPerf?: PerfStats }).__wh3dPerf = stats
    window.dispatchEvent(new CustomEvent(EVENT, { detail: stats }))
  }

  useFrame((state) => {
    const a = acc.current
    a.frames++
    const now = state.clock.elapsedTime
    // Bajo demanda solo hay fotogramas cuando algo cambia: se publica cada uno (los fps no significan nada),
    // leyendo los contadores justo después de pintar (useFrame corre antes del render del fotograma).
    if (frameloop === 'demand') {
      setTimeout(() => publish(0), 0)
      return
    }
    if (now - a.since < 1) return
    publish(Math.round(a.frames / (now - a.since)))
    a.frames = 0
    a.since = now
  })

  return null
}
