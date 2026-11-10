import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type { Layout, Location, Route } from '../types'
import { theme } from '../theme'
import { levelHeight, locationCenter, locationTop, type Vec3 } from './coords'
import { pathLength, pointAt, walkGrid, walkPath, walkPoint, type P2 } from './walk'
import { arrowTexture, ribbonGeometry, roundCorners } from './ribbon'
import Label3D from './Label3D'
import { v2 } from './look'

type Props = {
  route: Route
  layout: Layout
  // Paso actual: 0..n-1 son los picks, n es el muelle (put).
  step: number
  playing: boolean
  onArrive: (step: number) => void
  labelScale?: number
}

type LegState = 'done' | 'active' | 'todo'

// Dibuja la ruta EN EL ORDEN DE route.lines (el de F&O). No reordena nada: solo decide por qué
// pasillos se dibuja cada tramo (en ángulo recto, como se camina).
export default function RouteOverlay({ route, layout, step, playing, onArrive, labelScale = 1 }: Props) {
  const { stops, legs, start } = useMemo(() => buildRoute(route, layout), [route, layout])

  return (
    <group>
      {start && (
        <>
          <Leg points={start.leg} state={step < 0 ? 'active' : 'done'} />
          <Label3D
            text={`Salida · ${start.locationId}`}
            position={[start.leg[0][0], 1.6 * labelScale, -start.leg[0][1]]}
            height={0.55 * labelScale}
            background={theme.route.marker}
            layer={9}
          />
        </>
      )}
      {legs.map((leg, i) => (
        <Leg key={i} points={leg} state={i < step ? 'done' : i === step ? 'active' : 'todo'} />
      ))}
      {stops.map((s, i) =>
        s.kind === 'pick' ? (
          <group key={`${s.locationId}-${i}`}>
            <Line
              points={s.stem}
              color={i < step ? theme.route.done : theme.route.stem}
              lineWidth={2}
              dashed
              dashSize={0.18}
              gapSize={0.12}
            />
            <Label3D
              text={String(i + 1)}
              position={s.labelAt}
              height={0.85 * labelScale}
              shape="circle"
              background={i === step ? theme.route.active : i < step ? theme.route.done : theme.route.todo}
              ring="#ffffff"
            />
          </group>
        ) : null,
      )}
      <Picker legs={legs} approach={start?.leg} step={step} playing={playing} onArrive={onArrive} />
    </group>
  )
}

type Stop = {
  kind: 'pick' | 'put'
  locationId: string
  walk: P2 // por dónde pasa la persona
  stem: Vec3[] // del pasillo a la caja, subiendo hasta su nivel
  labelAt: Vec3
}

function buildRoute(route: Route, layout: Layout): { stops: Stop[]; legs: P2[][]; start: { locationId: string; leg: P2[] } | null } {
  const byId = new Map(layout.locations.map((l) => [l.locationId, l]))
  const grid = walkGrid(layout)
  const h = theme.route.height + 0.01
  const lanes = new Map((layout.aisles ?? []).map((a) => [a.aisleId, a.x]))
  // Se anda por el pasillo de la ubicación (el de su cara de picking); si no tiene, por el carril más cercano.
  // La línea trae las coordenadas de F&O (distancias); el dibujo usa la posición del plano.
  const walkTo = (loc: Location | undefined, x: number, y: number): P2 => {
    const lane = loc ? lanes.get(loc.aisle) : undefined
    return lane !== undefined ? [lane, y] : walkPoint(x, y, grid)
  }
  const picks: Stop[] = route.lines.map((line) => {
    const loc = byId.get(line.locationId)
    const [x, y] = loc ? [loc.x, loc.y] : [line.x, line.y]
    const walk = walkTo(loc, x, y)
    // El tallo sale del pasillo hacia la cara de la estantería donde está la caja.
    const face = x + Math.sign(walk[0] - x || 1) * ((loc?.sizeX ?? 1.2) / 2)
    const lh = levelHeight(layout)
    const center: Vec3 = loc ? locationCenter(loc, lh) : [x, line.z * lh + 0.5, -y]
    const top: Vec3 = loc ? locationTop(loc, lh) : [center[0], center[1] + 0.5, center[2]]
    return {
      kind: 'pick',
      locationId: line.locationId,
      walk,
      stem: [
        [walk[0], h, -walk[1]],
        [face, h, -y],
        [face, center[1], -y],
      ],
      labelAt: [top[0], top[1] + 0.95, top[2]],
    }
  })
  // Muelles y staging: se llega al borde que mira al interior de la nave, sin tapar su nombre.
  const puts = new Set(layout.putLocations)
  const pointOf = (p: { locationId: string; x: number; y: number }): P2 => {
    const loc = byId.get(p.locationId)
    const at = loc ? { x: loc.x, y: loc.y } : p
    return loc && puts.has(loc.locationId) ? putApproach(at, loc, layout) : walkTo(loc, at.x, at.y)
  }
  const p = route.putLocation
  const put: Stop = { kind: 'put', locationId: p.locationId, walk: pointOf(p), stem: [], labelAt: [p.x, 1, -p.y] }
  const stops = [...picks, put]
  const legs = stops.slice(0, -1).map((s, i) => roundCorners(walkPath(s.walk, stops[i + 1].walk, grid), theme.route.cornerRadius))
  const s = route.startLocation
  const start = s && picks.length > 0
    ? { locationId: s.locationId, leg: roundCorners(walkPath(pointOf(s), picks[0].walk, grid), theme.route.cornerRadius) }
    : null
  return { stops, legs, start }
}

function putApproach(p: { x: number; y: number }, loc: Location | undefined, layout: Layout): P2 {
  const b = layout.bounds
  const [cx, cy] = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]
  const halfX = (loc?.sizeX ?? 3) / 2 + 0.1
  const halfY = (loc?.sizeY ?? 1) / 2 + 0.1
  // Muelle contra una pared lateral (más fondo que ancho en Y): se entra por X; si no, por Y.
  if (loc && (loc.sizeY ?? 1) > (loc.sizeX ?? 3)) return [p.x + Math.sign(cx - p.x || 1) * halfX, p.y]
  return [p.x, p.y + Math.sign(cy - p.y || 1) * halfY]
}

// Tramo: cinta en el suelo (geometría propia) + flechas que avanzan (textura repetida con offset animado).
// Activo: más ancho, rojo y flechas rápidas. Pendiente: naranja y flechas lentas. Hecho: gris, sin flechas.
function Leg({ points, state }: { points: P2[]; state: LegState }) {
  const color = state === 'done' ? theme.route.done : state === 'active' ? theme.route.active : theme.route.todo
  const width = state === 'active' ? theme.route.activeWidth : theme.route.width
  // Donde se cruzan tramos, el activo queda encima, luego los pendientes y abajo los hechos (todos van a la misma altura).
  // Siempre por encima de los nombres pintados en el suelo (1) y por debajo de los carteles de pasillo (5 y más).
  const order = state === 'active' ? 4 : state === 'todo' ? 3 : 2
  const tile = width * theme.route.arrowTileRatio
  const geometry = useMemo(() => ribbonGeometry(points, width, theme.route.height, tile), [points, width, tile])
  const arrows = useMemo(() => arrowTexture(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => arrows.dispose(), [arrows])
  const arrowMaterial = useRef<MeshBasicMaterial>(null)

  useFrame((_, dt) => {
    const map = arrowMaterial.current?.map
    if (state === 'done' || !map) return
    const speed = state === 'active' ? theme.route.arrowSpeedActive : theme.route.arrowSpeedTodo
    map.offset.y -= (dt * speed) / tile
  })

  return (
    <group>
      <mesh geometry={geometry} renderOrder={order}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={state === 'done' ? 0.5 : 0.92}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          toneMapped={false}
        />
      </mesh>
      {state !== 'done' && (
        <mesh geometry={geometry} renderOrder={order + 0.5}>
          <meshBasicMaterial
            ref={arrowMaterial}
            map={arrows}
            transparent
            opacity={state === 'active' ? 0.95 : 0.7}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-3}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}

// La persona que recorre la ruta: cuerpo + cabeza + halo en el suelo.
// Paso -1: está en la ubicación de inicio y su tramo es el de llegada al primer pick (approach).
function Picker({
  legs,
  approach,
  step,
  playing,
  onArrive,
}: {
  legs: P2[][]
  approach?: P2[]
  step: number
  playing: boolean
  onArrive: (s: number) => void
}) {
  const ref = useRef<Group>(null)
  const halo = useRef<Mesh>(null)
  const travelled = useRef(0)
  const waiting = useRef(0) // segundos que le quedan parado en la parada antes de seguir
  const last = legs.length // índice del muelle

  useEffect(() => {
    travelled.current = 0
  }, [step, legs])

  useEffect(() => {
    if (!playing) waiting.current = 0
  }, [playing])

  useFrame((state, dt) => {
    const g = ref.current
    if (!g) return
    const i = Math.min(step, last)
    const leg = (i < 0 ? approach : legs[Math.min(i, last - 1)]) ?? [[0, 0] as P2]
    let s = i >= last ? pathLength(leg) : travelled.current
    let walking = false
    if (playing && i < last) {
      if (waiting.current > 0) {
        waiting.current -= dt
      } else {
        const len = pathLength(leg) || 1
        travelled.current = Math.min(len, travelled.current + dt * theme.route.speed)
        walking = true
        s = travelled.current
        if (travelled.current >= len) {
          travelled.current = 0
          waiting.current = theme.route.dwell
          onArrive(i + 1)
        }
      }
    }
    const { p, dir } = pointAt(leg, s)
    // V2: al andar, un pequeño rebote de paso.
    g.position.set(p[0], v2 && walking ? Math.abs(Math.sin(state.clock.elapsedTime * 9)) * 0.07 : 0, -p[1])
    g.rotation.y = Math.atan2(dir[0], dir[1])
    if (halo.current) {
      const k = 1 + 0.25 * Math.sin(state.clock.elapsedTime * 4)
      halo.current.scale.set(k, k, k)
    }
  })

  return (
    <group ref={ref}>
      <mesh ref={halo} rotation-x={-Math.PI / 2} position={[0, theme.route.height + 0.01, 0]}>
        <ringGeometry args={[0.45, 0.62, 40]} />
        <meshBasicMaterial color={theme.route.markerHalo} transparent opacity={0.6} />
      </mesh>
      {/* Sin sombra: el mapa de sombras es estático y el muñeco se mueve (su halo ya lo pega al suelo). */}
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.22, 0.6, 6, 16]} />
        <meshStandardMaterial color={theme.route.marker} roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <sphereGeometry args={[0.17, 20, 16]} />
        <meshStandardMaterial color="#f1c27d" roughness={0.6} />
      </mesh>
      {/* chaleco reflectante */}
      <mesh position={[0, 0.72, 0]}>
        <cylinderGeometry args={[0.235, 0.235, 0.12, 20]} />
        <meshStandardMaterial color="#d9f227" emissive="#d9f227" emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}
