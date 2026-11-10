import { useEffect, useMemo } from 'react'
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Vec3 } from './coords'

// Etiquetas dibujadas en un canvas: sin DOM ni fuentes externas.
// (El <Html> de drei pierde la primera instancia montada con React 19; por eso no lo usamos.)

type Props = {
  text: string
  position: Vec3
  height?: number
  color?: string
  background?: string
  // pill: rectángulo redondeado; circle: insignia redonda (números de paso).
  shape?: 'pill' | 'circle'
  ring?: string
  // flat: pintada en el suelo. Si no, sprite que siempre mira a la cámara y queda por encima de todo.
  flat?: boolean
  rotation?: number // solo flat: giro en el plano del suelo
  layer?: number // orden de pintado de los sprites (más alto, más encima)
}

export default function Label3D({
  text,
  position,
  height = 0.6,
  color = '#ffffff',
  background,
  shape = 'pill',
  ring,
  flat = false,
  rotation = 0,
  layer = 10,
}: Props) {
  const { texture, aspect } = useMemo(() => makeTexture(text, color, background, shape, ring), [text, color, background, shape, ring])
  useEffect(() => () => texture.dispose(), [texture])

  if (flat) {
    return (
      <mesh position={position} rotation={[-Math.PI / 2, 0, rotation]} renderOrder={1}>
        <planeGeometry args={[height * aspect, height]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    )
  }
  return (
    <sprite position={position} scale={[height * aspect, height, 1]} renderOrder={layer}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

// Se pinta a 128 px para que al reducirse siga nítida.
const FONT_PX = 128
const PAD_X = 44
const PAD_Y = 20

function makeTexture(text: string, color: string, background: string | undefined, shape: 'pill' | 'circle', ring?: string) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `700 ${FONT_PX}px system-ui, "Segoe UI", Roboto, sans-serif`
  ctx.font = font
  const textW = Math.ceil(ctx.measureText(text).width)
  const h = FONT_PX + PAD_Y * 2
  const w = shape === 'circle' ? Math.max(h, textW + PAD_X) : textW + PAD_X * 2
  const ringW = ring ? 14 : 0
  canvas.width = w + ringW * 2
  canvas.height = h + ringW * 2
  const cx = canvas.width / 2
  const cy = canvas.height / 2

  if (background) {
    ctx.beginPath()
    if (shape === 'circle') ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2)
    else ctx.roundRect(ringW, ringW, w, h, h * 0.3)
    ctx.fillStyle = background
    ctx.fill()
    if (ring) {
      ctx.lineWidth = ringW
      ctx.strokeStyle = ring
      ctx.stroke()
    }
  }
  ctx.font = font
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, cx, cy + 6)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 16
  return { texture, aspect: canvas.width / canvas.height }
}
