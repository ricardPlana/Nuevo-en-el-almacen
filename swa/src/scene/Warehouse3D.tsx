import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { BoxGeometry, BufferGeometry, EdgesGeometry, Float32BufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, NeutralToneMapping, Vector3, type DirectionalLight, type PerspectiveCamera } from 'three'
import { Edges, OrbitControls } from '@react-three/drei'
import type { Layout, LayoutZone, Location, LocationStock } from '../types'
import { heatColor, theme, zoneColor, type SceneMode } from '../theme'
import { formatQty } from '../format'
import { boxSize, layoutCenter, layoutSize, levelHeight, locationBase, locationCenter, locationTop, type Vec3 } from './coords'
import { walkGrid } from './walk'
import Label3D from './Label3D'
import PerfProbe, { PerfOverlay } from './PerfProbe'
import { rendererName } from './gpu'
import { v2 } from './look'
import { cardboardTexture, palletMaterial, shadeTexture } from './v2/textures'

// Solo en V2: luz de estudio, sombras suaves y niebla. Va en su propio fichero JS, que la V1 no descarga.
const Extras = lazy(() => import('./v2/Extras'))

const params = new URLSearchParams(window.location.search)
const perf = params.get('perf') === '1'
// Mandos de calidad para medir y para equipos flojos (por defecto, todo como siempre):
//   ?dpr=1 (píxeles por punto; por defecto 1,5–2) · ?shadows=0 (sin sombras) · ?aa=0 (sin antialias).
const dprParam = Number(params.get('dpr'))
// Sin GPU (VM, escritorio remoto): el navegador pinta por software y cada píxel cuesta; se baja a 1 píxel por punto.
const software = /Basic Render|SwiftShader|llvmpipe|Software/i.test(detectRenderer())
const quality = {
  dpr: dprParam > 0 ? ([dprParam, dprParam] as [number, number]) : software ? ([1, 1] as [number, number]) : ([1.5, 2] as [number, number]),
  shadows: params.get('shadows') !== '0',
  antialias: params.get('aa') !== '0',
}

function detectRenderer(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    return gl ? rendererName(gl) : ''
  } catch {
    return ''
  }
}

// Una sola geometría para todas las cajas (cada mesh la escala a su tamaño) y sus aristas.
const UNIT_BOX = new BoxGeometry(1, 1, 1)
const UNIT_EDGES = new EdgesGeometry(UNIT_BOX)

// Vista de almacén: stock por ubicación y la cantidad de la más llena (escala del mapa de calor).
export type StockView = { byLocation: ReadonlyMap<string, LocationStock>; maxQty: number }

type Props = {
  layout: Layout
  mode: SceneMode
  selectedId: string | null
  // Ubicaciones a resaltar (ruta o búsqueda). Si hay alguna, el resto queda en segundo plano.
  emphasis?: ReadonlySet<string>
  // Si viene, las cajas pintan el stock (altura y color) y los huecos vacíos salen como caja fantasma.
  stock?: StockView
  onSelect: (locationId: string | null) => void
  present?: boolean
  labelScale?: number
  children?: ReactNode
}

export default function Warehouse3D({ layout, mode, selectedId, emphasis, stock, onSelect, present = false, labelScale = 1, children }: Props) {
  const colors = theme.scene[mode]
  const center = layoutCenter(layout)
  const { width, depth } = layoutSize(layout)
  const cameraPos: Vec3 = [center[0], Math.max(width, depth) * 0.62, center[2] + depth * 0.82]
  const span = Math.max(width, depth)
  const light = useRef<DirectionalLight>(null)
  // Dónde se pulsó: al soltar tras arrastrar para girar la cámara, el navegador también lanza "click"; si se ha movido,
  // no es un clic y no debe quitar la selección.
  const down = useRef<{ x: number; y: number } | null>(null)

  return (
    <>
    {perf && <PerfOverlay />}
    <Canvas
      shadows={quality.shadows}
      gl={{ antialias: quality.antialias }}
      // V1 flat: sin tone mapping (ACES lava colores y texto). V2: tone mapping Neutral (Khronos), que respeta los colores
      // y deja sumar la luz de estudio sin quemar el blanco; carteles y ruta van con toneMapped=false.
      // dpr ≥ 1,5: supermuestreo en pantallas al 100 %.
      flat={!v2}
      onCreated={({ gl }) => {
        if (v2) gl.toneMapping = NeutralToneMapping
      }}
      // near 0,5 (no 0,1): 5 veces más precisión de profundidad; la cámara nunca se acerca a menos de 8 m.
      camera={{ position: cameraPos, fov: theme.camera.fov, near: 0.5, far: 500 }}
      dpr={quality.dpr}
      // Vista de almacén: nada se mueve, así que solo se pinta cuando cambia algo (cámara, ratón, datos).
      // Con ruta, siempre: las flechas y el muñeco están animados.
      frameloop={stock ? 'demand' : 'always'}
      onPointerDownCapture={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerMissed={(e) => {
        const d = down.current
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) return
        onSelect(null)
      }}
      style={{ background: present ? colors.presentBackground : colors.background }}
    >
      {/* V2: menos luz ambiente (la pone el entorno de estudio) y más luz directa, para que se marquen las sombras. */}
      <hemisphereLight args={[mode === 'dark' ? '#9fb3c8' : '#ffffff', mode === 'dark' ? '#1b1f24' : '#aab4bf', (mode === 'dark' ? 0.75 : 1.0) * (v2 ? 0.45 : 1)]} />
      <directionalLight
        castShadow
        position={[center[0] - span * 0.35, span * 1.1, center[2] + span * 0.55]}
        intensity={(mode === 'dark' ? 1.0 : 1.25) * (v2 ? 1.5 : 1)}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        // normalBias: sin él, con la cámara rasante el suelo se llena de rayas de sombra (shadow acne).
        shadow-normalBias={0.03}
        shadow-camera-left={-span * 0.8}
        shadow-camera-right={span * 0.8}
        shadow-camera-top={span * 0.8}
        shadow-camera-bottom={-span * 0.8}
        shadow-camera-far={span * 4}
        // El mapa de sombras se calcula una vez y solo se rehace cuando cambia la escena (StaticShadows):
        // nada de lo que proyecta sombra se mueve de un fotograma a otro.
        shadow-autoUpdate={false}
        ref={light}
      >
        <object3D attach="target" position={center} />
      </directionalLight>
      <StaticShadows light={light} deps={[layout, mode, stock]} />
      <Floor layout={layout} mode={mode} />
      <Racks layout={layout} mode={mode} labelScale={labelScale} />
      {stock ? (
        <StockLocations layout={layout} mode={mode} stock={stock} selectedId={selectedId} emphasis={emphasis} onSelect={onSelect} labelScale={labelScale} />
      ) : (
        <Locations layout={layout} mode={mode} selectedId={selectedId} emphasis={emphasis} onSelect={onSelect} />
      )}
      <PutAreas layout={layout} />
      <FloorLabels layout={layout} mode={mode} labelScale={labelScale} />
      {selectedId && <SelectedLabel layout={layout} locationId={selectedId} labelScale={labelScale} />}
      {children}
      <Controls layout={layout} />
      <CameraFit layout={layout} />
      {v2 && (
        <Suspense fallback={null}>
          <Extras span={span} background={present ? colors.presentBackground : colors.background} />
        </Suspense>
      )}
      {perf && <PerfProbe />}
    </Canvas>
    </>
  )
}

// Rehace el mapa de sombras una vez por cambio de escena (y pide un fotograma, por si el bucle es bajo demanda).
function StaticShadows({ light, deps }: { light: RefObject<DirectionalLight | null>; deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (light.current) light.current.shadow.needsUpdate = true
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return null
}

// Suelo con carriles de paso pintados (uno por estantería y los dos transversales) y bordes amarillos.
function Floor({ layout, mode }: { layout: Layout; mode: SceneMode }) {
  const colors = theme.scene[mode]
  const center = layoutCenter(layout)
  const { width, depth } = layoutSize(layout)
  const grid = useMemo(() => walkGrid(layout), [layout])
  const w = theme.sizes.laneWidth
  const lanes: { x: number; y: number; sx: number; sy: number }[] = [
    ...grid.lanes.map((x) => ({ x, y: (grid.frontY + grid.backY) / 2, sx: w, sy: grid.backY - grid.frontY + w })),
    // Con nave, los transversales van de pared a pared; sin ella, sobresalen medio carril por cada lado.
    ...[grid.frontY, grid.backY].map((y) => ({ x: (grid.minX + grid.maxX) / 2, y, sx: grid.maxX - grid.minX + (layout.building ? 0 : w), sy: w })),
  ]
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[center[0], -0.01, center[2]]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={colors.floor} roughness={0.95} />
      </mesh>
      {layout.building && <Building layout={layout} mode={mode} />}
      {lanes.map((l, i) => (
        <group key={i}>
          <mesh rotation-x={-Math.PI / 2} position={[l.x, theme.floor.lane, -l.y]} receiveShadow>
            <planeGeometry args={[l.sx, l.sy]} />
            <meshStandardMaterial color={colors.lane} roughness={0.9} />
          </mesh>
          {/* bordes amarillos */}
          {(l.sx < l.sy ? [-1, 1].map((s) => [l.x + (s * l.sx) / 2, l.y, 0.06, l.sy] as const) : [-1, 1].map((s) => [l.x, l.y + (s * l.sy) / 2, l.sx, 0.06] as const)).map(
            ([x, y, sx, sy], j) => (
              <mesh key={j} rotation-x={-Math.PI / 2} position={[x, theme.floor.laneEdge, -y]}>
                <planeGeometry args={[sx, sy]} />
                <meshBasicMaterial color={colors.laneEdge} />
              </mesh>
            ),
          )}
        </group>
      ))}
    </group>
  )
}

// Nave: bandas de color por zona (con su nombre pintado en el suelo, al fondo) y un murete en el perímetro.
function Building({ layout, mode }: { layout: Layout; mode: SceneMode }) {
  const b = layout.bounds
  const wall = theme.wall[mode]
  const h = 0.35
  const t = 0.15
  const walls: [number, number, number, number][] = [
    [(b.minX + b.maxX) / 2, b.minY, b.maxX - b.minX, t],
    [(b.minX + b.maxX) / 2, b.maxY, b.maxX - b.minX, t],
    [b.minX, (b.minY + b.maxY) / 2, t, b.maxY - b.minY],
    [b.maxX, (b.minY + b.maxY) / 2, t, b.maxY - b.minY],
  ]
  return (
    <group>
      {(layout.zones ?? []).map((z) => {
        const color = theme.zoneFunction[z.function] ?? theme.zone.default
        return (
          <group key={z.number}>
            <mesh rotation-x={-Math.PI / 2} position={[z.x + z.length / 2, theme.floor.band, -z.width / 2]}>
              <planeGeometry args={[z.length, z.width]} />
              <meshBasicMaterial color={color} transparent opacity={theme.zoneBand[mode]} depthWrite={false} />
            </mesh>
            {z.x > b.minX + 0.01 && (
              <mesh rotation-x={-Math.PI / 2} position={[z.x, theme.floor.zoneLine, -z.width / 2]}>
                <planeGeometry args={[0.08, z.width]} />
                <meshBasicMaterial color={color} />
              </mesh>
            )}
            {/* En zonas estrechas el nombre no cabe a lo ancho: se escribe a lo largo de la banda. */}
            <Label3D
              text={`${z.number} · ${z.name}`}
              position={narrow(z) ? [z.x + z.length / 2, theme.floor.label, -z.width / 2] : [z.x + z.length / 2, theme.floor.label, -(z.width - 2)]}
              height={narrow(z) ? Math.min(1.4, z.length * 0.16) : Math.min(1.6, Math.max(0.8, z.length / 7))}
              rotation={narrow(z) ? Math.PI / 2 : 0}
              color="#ffffff"
              background={color}
              flat
            />
          </group>
        )
      })}
      {walls.map(([x, y, sx, sy], i) => (
        <mesh key={i} position={[x, h / 2, -y]} castShadow receiveShadow>
          <boxGeometry args={[sx, h, sy]} />
          <meshStandardMaterial color={wall} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function narrow(z: LayoutZone): boolean {
  return z.length < 12
}

// Estantería de palets: postes azules entre huecos y largueros naranjas en cada nivel.
// Si su nivel más alto pasa de la altura libre de la nave (o, sin ella, de la de estanterías), va toda en rojo
// con un cartel: casi siempre es un dato mal metido en F&O (perfil, Z o medidas de la nave).
function Racks({ layout, mode, labelScale }: { layout: Layout; mode: SceneMode; labelScale: number }) {
  const racks = useMemo(() => buildRacks(layout), [layout])
  const colors = theme.scene[mode]
  const limit = heightLimit(layout)
  const over = (r: Rack) => limit !== null && r.top > limit.value + 0.01
  // Un cartel por estantería física: las dos caras de un doble fondo (≤ 2,6 m) comparten el de la primera.
  const labelled = new Set<string>()
  let lastX = -Infinity
  for (const r of racks.filter(over).sort((a, b) => a.x - b.x)) {
    if (r.x - lastX > 2.6) labelled.add(r.key)
    lastX = r.x
  }
  // Postes y largueros de todas las estanterías en 4 mallas instanciadas (normal/rojo × poste/larguero) en vez de
  // una malla por pieza: ~500 llamadas de dibujo menos (y otras tantas en el pase de sombras).
  const bars = useMemo(() => {
    const posts: Bar[] = []
    const postsOver: Bar[] = []
    const beams: Bar[] = []
    const beamsOver: Bar[] = []
    const labels: { r: Rack; height: number; midZ: number }[] = []
    for (const r of racks) {
      const height = r.top + 0.15
      const half = layout.aisles ? r.slot / 2 : 1.25
      const edges = [...r.slots.map((y) => y - half), r.slots[r.slots.length - 1] + half]
      // Con nave, un poste cada ~2,4 m (como una estantería real), no uno por hueco.
      const every = layout.aisles ? Math.max(1, Math.round(2.4 / r.slot)) : 1
      const ps = edges.filter((_, i) => i % every === 0 || i === edges.length - 1)
      const length = ps[ps.length - 1] - ps[0]
      const midZ = -(ps[0] + ps[ps.length - 1]) / 2
      const tooTall = over(r)
      for (const y of ps) for (const sx of [-1, 1]) (tooTall ? postsOver : posts).push([r.x + sx * r.depth, height / 2, -y, 0.09, height, 0.09])
      for (const z of r.beams) for (const sx of [-1, 1]) (tooTall ? beamsOver : beams).push([r.x + sx * r.depth, z + (z === 0 ? 0.06 : 0), midZ, 0.07, 0.12, length])
      if (tooTall) labels.push({ r, height, midZ })
    }
    return { posts, postsOver, beams, beamsOver, labels }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [racks, layout.aisles, limit?.value])
  return (
    <group>
      <Bars bars={bars.posts} color={colors.upright} roughness={0.6} />
      <Bars bars={bars.postsOver} color={theme.rackOver.upright} roughness={0.6} />
      <Bars bars={bars.beams} color={colors.beam} roughness={0.5} />
      <Bars bars={bars.beamsOver} color={theme.rackOver.beam} roughness={0.5} />
      {limit &&
        bars.labels
          .filter(({ r }) => labelled.has(r.key))
          .map(({ r, height, midZ }) => (
            <Label3D
              key={r.key}
              text={`⚠ ${fmtM(r.top)} m > ${limit.label} ${fmtM(limit.value)} m`}
              position={[r.x, height + 0.6 * labelScale, midZ]}
              height={0.5 * labelScale}
              background={theme.rackOver.label}
              layer={6}
            />
          ))}
    </group>
  )
}

// Una pieza: centro (x, y, z) y tamaño (sx, sy, sz), en coordenadas de three.
type Bar = [number, number, number, number, number, number]

// Palé de una ubicación: debajo de la caja, un pelín más ancho que ella.
function palletBar(loc: Location, lh: number): Bar {
  const [sx, sy, sz] = shrink(boxSize(loc))
  const [x, y, z] = locationCenter(loc, lh)
  return [x, y - sy / 2 - 0.05, z, sx * 1.02, 0.1, sz * 1.02]
}

// Todos los palés en una malla instanciada (antes, una malla por caja: 480 llamadas de dibujo en CH01).
function Pallets({ locs, lh }: { locs: Location[]; lh: number }) {
  const bars = useMemo(() => locs.map((l) => palletBar(l, lh)), [locs, lh])
  return <Bars bars={bars} color="#8a6a45" roughness={0.9} metalness={0} material={v2 ? palletMaterial() : undefined} />
}

// Todas las piezas del mismo color en una sola malla instanciada (una llamada de dibujo).
function Bars({ bars, color, roughness, metalness = 0.2, material }: { bars: Bar[]; color: string; roughness: number; metalness?: number; material?: MeshStandardMaterial }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    const mat = new Matrix4()
    bars.forEach(([x, y, z, sx, sy, sz], i) => {
      mat.makeScale(sx, sy, sz).setPosition(x, y, z)
      m.setMatrixAt(i, mat)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [bars])
  if (bars.length === 0) return null
  return (
    <instancedMesh key={bars.length} ref={ref} args={[UNIT_BOX, material, bars.length]} castShadow receiveShadow>
      {!material && <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />}
    </instancedMesh>
  )
}

// Altura máxima de la nave en F&O: la libre (D365_AlturaLibre) o, si no está, la de estanterías. null = sin dato.
function heightLimit(layout: Layout): { value: number; label: string } | null {
  const b = layout.building
  if (b && b.clearHeight > 0) return { value: b.clearHeight, label: 'altura libre' }
  if (b && b.rackHeight > 0) return { value: b.rackHeight, label: 'altura de estanterías' }
  return null
}

const fmtM = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 })

// Una fila de estantería. En pasillos de doble cara hay dos filas por pasillo (una a cada lado).
// beams: altura de cada larguero (donde empieza cada nivel); top: hasta dónde llega el nivel más alto.
type Rack = { key: string; aisle: string; x: number; depth: number; slots: number[]; slot: number; beams: number[]; top: number; minY: number }

function storageByAisle(layout: Layout): Map<string, Location[]> {
  const puts = new Set(layout.putLocations)
  const byAisle = new Map<string, Location[]>()
  for (const loc of layout.locations) {
    if (puts.has(loc.locationId)) continue
    const list = byAisle.get(loc.aisle) ?? []
    list.push(loc)
    byAisle.set(loc.aisle, list)
  }
  return byAisle
}

function buildRacks(layout: Layout): Rack[] {
  const lh = levelHeight(layout)
  // Con alturas reales (baseZ), el hueco mide lo que dice el perfil (sizeZ); si no, una altura de nivel.
  const heightOf = (l: Location) => (l.baseZ != null ? (l.sizeZ ?? lh) : lh)
  return [...storageByAisle(layout)].flatMap(([aisle, all]) => {
    // Con plano de nave, cada cara del pasillo es una fila; sin él, una fila por pasillo (como venía de F&O).
    const rows = layout.aisles ? groupBy(all, (l) => String(l.x)) : new Map([[aisle, all]])
    return [...rows].map(([row, locs]) => {
      const slots = [...new Set(locs.map((l) => l.y))].sort((a, b) => a - b)
      return {
        key: `${aisle}|${row}`,
        aisle,
        x: locs.reduce((s, l) => s + l.x, 0) / locs.length,
        depth: layout.aisles ? Math.max(...locs.map((l) => l.sizeX ?? 1.1)) / 2 + 0.05 : 0.65,
        slots,
        slot: Math.max(...locs.map((l) => l.sizeY ?? theme.sizes.defaultBox.y)) / 0.95,
        beams: [...new Set(locs.map((l) => round2(locationBase(l, lh))))].sort((a, b) => a - b),
        top: Math.max(...locs.map((l) => locationBase(l, lh) + heightOf(l))),
        minY: slots[0],
      }
    })
  })
}

const round2 = (n: number) => Math.round(n * 100) / 100

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const it of items) map.set(key(it), [...(map.get(key(it)) ?? []), it])
  return map
}

// Cajas de cartón sobre palé. Las de la ruta brillan; el resto se queda en segundo plano.
function Locations({
  layout,
  mode,
  selectedId,
  emphasis,
  onSelect,
}: {
  layout: Layout
  mode: SceneMode
  selectedId: string | null
  emphasis?: ReadonlySet<string>
  onSelect: (id: string) => void
}) {
  const [hovered, onHover] = useHover()
  const dimming = !!emphasis && emphasis.size > 0
  const lh = levelHeight(layout)
  const storage = useStorage(layout)
  // Las aristas de las cajas normales van todas en una sola geometría (como los huecos vacíos de la vista de
  // almacén); solo las de la ruta y la seleccionada, que cambian de color, pintan las suyas.
  const plain = useMemo(
    () => storage.filter((l) => !(dimming && emphasis.has(l.locationId)) && l.locationId !== selectedId),
    [storage, dimming, emphasis, selectedId],
  )

  return (
    <group>
      <Pallets locs={storage} lh={lh} />
      <MergedEdges locs={plain} lh={lh} color="#7a6650" />
      {storage.map((loc) => {
        const id = loc.locationId
        return (
          <LocationBox
            key={id}
            loc={loc}
            lh={lh}
            mode={mode}
            isSelected={id === selectedId}
            isHovered={hovered === id}
            onRoute={dimming && emphasis.has(id)}
            dimmed={dimming}
            onSelect={onSelect}
            onHover={onHover}
          />
        )
      })}
    </group>
  )
}

// Cada caja es un componente memorizado: al pasar el ratón solo se vuelven a pintar las dos que cambian,
// no las 300 del almacén.
type BoxEvents = { onSelect: (id: string) => void; onHover: (id: string, over: boolean) => void }

const LocationBox = memo(function LocationBox({
  loc,
  lh,
  mode,
  isSelected,
  isHovered,
  onRoute,
  dimmed,
  onSelect,
  onHover,
}: BoxEvents & { loc: Location; lh: number; mode: SceneMode; isSelected: boolean; isHovered: boolean; onRoute: boolean; dimmed: boolean }) {
  const id = loc.locationId
  const colors = theme.scene[mode]
  const color = isSelected
    ? theme.location.selected
    : isHovered
      ? theme.location.hover
      : onRoute
        ? theme.location.onRoute
        : dimmed
          ? colors.boxDim
          : v2
            ? colors.boxV2
            : colors.box
  const [sx, sy, sz] = shrink(boxSize(loc))
  const [x, y, z] = locationCenter(loc, lh)
  return (
    <group position={[x, y, z]}>
      <mesh geometry={UNIT_BOX} scale={[sx, sy - 0.1, sz]} castShadow receiveShadow {...boxEvents(id, onSelect, onHover)}>
        {(onRoute || isSelected) && <Edges color="#8a3b00" lineWidth={1} />}
        <meshStandardMaterial
          color={color}
          map={v2 ? cardboardTexture() : null}
          roughness={0.85}
          emissive={onRoute || isSelected ? color : '#000000'}
          emissiveIntensity={onRoute || isSelected ? 0.35 : 0}
        />
      </mesh>
    </group>
  )
})

// Vista de almacén: la caja crece y se oscurece con la cantidad (relativa a la ubicación más llena).
// Hueco vacío = caja fantasma que se puede pinchar. Insignia roja = picks pendientes en esa ubicación.
function StockLocations({
  layout,
  mode,
  stock,
  selectedId,
  emphasis,
  onSelect,
  labelScale,
}: {
  layout: Layout
  mode: SceneMode
  stock: StockView
  selectedId: string | null
  emphasis?: ReadonlySet<string>
  onSelect: (id: string) => void
  labelScale: number
}) {
  const [hovered, onHover] = useHover()
  const dimming = !!emphasis && emphasis.size > 0
  const lh = levelHeight(layout)
  const storage = useStorage(layout)
  // Las cajas fantasma comparten material (mismo color y opacidad) y pintan sus aristas en una sola geometría:
  // 2 llamadas de dibujo en vez de 2 por hueco vacío. Las resaltadas (ratón o selección) van por su cuenta.
  const ghost = useMemo(() => ghostMaterial(mode, theme.stock.ghostOpacity), [mode])
  const ghostFaded = useMemo(() => ghostMaterial(mode, 0.05), [mode])
  useEffect(() => () => ghost.dispose(), [ghost])
  useEffect(() => () => ghostFaded.dispose(), [ghostFaded])
  const ghostLocs = useMemo(
    () => storage.filter((l) => !stock.byLocation.get(l.locationId)?.qty && l.locationId !== hovered && l.locationId !== selectedId),
    [storage, stock, hovered, selectedId],
  )
  const withStock = useMemo(() => storage.filter((l) => (stock.byLocation.get(l.locationId)?.qty ?? 0) > 0), [storage, stock])

  return (
    <group>
      <Pallets locs={withStock} lh={lh} />
      {storage.map((loc) => {
        const id = loc.locationId
        const s = stock.byLocation.get(id)
        const qty = s?.qty ?? 0
        const matched = dimming && emphasis.has(id)
        return (
          <StockBox
            key={id}
            loc={loc}
            lh={lh}
            mode={mode}
            qty={qty}
            picks={s?.openPicks.length ?? 0}
            ratio={stock.maxQty > 0 ? qty / stock.maxQty : 0}
            isSelected={id === selectedId}
            isHovered={hovered === id}
            matched={matched}
            faded={dimming && !matched}
            ghost={ghost}
            ghostFaded={ghostFaded}
            labelScale={labelScale}
            onSelect={onSelect}
            onHover={onHover}
          />
        )
      })}
      <MergedEdges locs={ghostLocs} lh={lh} color={theme.stock.ghost[mode]} />
    </group>
  )
}

const StockBox = memo(function StockBox({
  loc,
  lh,
  mode,
  qty,
  picks,
  ratio,
  isSelected,
  isHovered,
  matched,
  faded,
  ghost,
  ghostFaded,
  labelScale,
  onSelect,
  onHover,
}: BoxEvents & {
  loc: Location
  lh: number
  mode: SceneMode
  qty: number
  picks: number
  ratio: number
  isSelected: boolean
  isHovered: boolean
  matched: boolean
  faded: boolean
  ghost: MeshStandardMaterial
  ghostFaded: MeshStandardMaterial
  labelScale: number
}) {
  const id = loc.locationId
  const colors = theme.scene[mode]
  const [sx, sy, sz] = shrink(boxSize(loc))
  const [x, y, z] = locationCenter(loc, lh)
  const full = sy - 0.1
  const h = qty > 0 ? full * (theme.stock.minFill + (1 - theme.stock.minFill) * ratio) : full
  const top = -full / 2 + h
  const color = isSelected
    ? theme.location.selected
    : isHovered
      ? theme.location.hover
      : faded
        ? colors.boxDim
        : qty > 0
          ? heatColor(ratio, mode)
          : theme.stock.ghost[mode]
  const glow = isSelected || matched
  const events = boxEvents(id, onSelect, onHover)
  return (
    <group position={[x, y, z]}>
      {qty > 0 ? (
        <mesh position={[0, top - h / 2, 0]} geometry={UNIT_BOX} scale={[sx, h, sz]} castShadow receiveShadow {...events}>
          {(!v2 || glow) && <Edges color={glow ? '#8a3b00' : '#0d2a4d'} lineWidth={1} />}
          <meshStandardMaterial
            color={color}
            map={v2 ? shadeTexture() : null}
            roughness={0.8}
            emissive={glow ? color : '#000000'}
            emissiveIntensity={glow ? 0.3 : 0}
          />
        </mesh>
      ) : isSelected ? (
        // Vacía y seleccionada: el hueco entero en naranja opaco y brillante, un poco más grande que el hueco para que
        // asome entre las barras del rack (que también son naranjas) y no se confunda con los cubos fantasma.
        <mesh geometry={UNIT_BOX} scale={[sx * 1.06, h * 1.04, sz * 1.06]} castShadow receiveShadow {...events}>
          <Edges color="#5c2700" lineWidth={2} />
          <meshStandardMaterial color={color} roughness={0.5} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      ) : isHovered ? (
        <mesh geometry={UNIT_BOX} scale={[sx, h, sz]} receiveShadow {...events}>
          <Edges color={color} lineWidth={1} />
          <meshStandardMaterial color={color} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ) : (
        <mesh geometry={UNIT_BOX} scale={[sx, h, sz]} material={faded ? ghostFaded : ghost} receiveShadow {...events} />
      )}
      {picks > 0 && !faded && !isSelected && (
        <Label3D
          text={String(picks)}
          shape="circle"
          position={[0, top + 0.45 * labelScale, 0]}
          height={0.5 * labelScale}
          background={theme.stock.pick}
          ring="#ffffff"
          layer={8}
        />
      )}
      {isHovered && !isSelected && (
        <Label3D
          text={`${id} · ${qty > 0 ? formatQty(qty) : 'vacía'}`}
          position={[0, top + (picks > 0 ? 1.05 : 0.5) * labelScale, 0]}
          height={0.42 * labelScale}
          background={theme.stock.tooltip}
          layer={12}
        />
      )}
    </group>
  )
})

function ghostMaterial(mode: SceneMode, opacity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: theme.stock.ghost[mode], transparent: true, opacity, depthWrite: false })
}

// Aristas de muchas cajas en un solo lineSegments (una llamada de dibujo en vez de una por caja).
function MergedEdges({ locs, lh, color }: { locs: Location[]; lh: number; color: string }) {
  const geometry = useMemo(() => {
    const src = UNIT_EDGES.getAttribute('position')
    const out = new Float32Array(src.count * 3 * locs.length)
    let k = 0
    for (const loc of locs) {
      const [sx, sy, sz] = shrink(boxSize(loc))
      const [x, y, z] = locationCenter(loc, lh)
      for (let i = 0; i < src.count; i++) {
        out[k++] = x + src.getX(i) * sx
        out[k++] = y + src.getY(i) * (sy - 0.1)
        out[k++] = z + src.getZ(i) * sz
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(out, 3))
    return g
  }, [locs, lh])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (locs.length === 0) return null
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

// Ubicaciones de almacenaje (sin muelles ni staging), en el orden del layout.
function useStorage(layout: Layout): Location[] {
  return useMemo(() => {
    const puts = new Set(layout.putLocations)
    return layout.locations.filter((loc) => !puts.has(loc.locationId))
  }, [layout])
}

function useHover() {
  const [hovered, setHovered] = useState<string | null>(null)
  // Estable entre renders para que las cajas memorizadas no se repinten. Al salir solo se borra si sigue
  // siendo la misma: al pasar a la caja vecina, su "over" llega antes que nuestro "out".
  const onHover = useCallback((id: string, over: boolean) => {
    if (over) setHovered(id)
    else setHovered((h) => (h === id ? null : h))
    document.body.style.cursor = over ? 'pointer' : ''
  }, [])
  return [hovered, onHover] as const
}

// Más de esto entre pulsar y soltar es arrastrar (girar o mover la cámara), no un clic.
const DRAG_PX = 6

function boxEvents(id: string, onSelect: (id: string) => void, onHover: (id: string, over: boolean) => void) {
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (e.delta > DRAG_PX) return
      onSelect(id)
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover(id, true)
    },
    onPointerOut: () => onHover(id, false),
  }
}

// Un pelín más pequeñas que el hueco para que se vean los niveles separados.
function shrink([x, y, z]: Vec3): Vec3 {
  return [x * 0.85, y * 0.82, z * 0.85]
}

// Muelles y staging pintados en el suelo, con el nombre encima.
function PutAreas({ layout }: { layout: Layout }) {
  const puts = layout.locations.filter((l) => layout.putLocations.includes(l.locationId))
  return (
    <group>
      {puts.map((p) => {
        const [sx, , sz] = boxSize(p)
        const color = zoneColor(p.zone)
        return (
          <group key={p.locationId} position={[p.x, 0, -p.y]}>
            <mesh rotation-x={-Math.PI / 2} position={[0, theme.floor.putArea, 0]} receiveShadow>
              <planeGeometry args={[sx, sz]} />
              <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            {/* Muelle contra una pared lateral (más fondo que ancho): el nombre va a lo largo. */}
            <Label3D
              text={p.locationId}
              position={[0, theme.floor.label, 0]}
              height={sz > sx ? Math.min(0.8, sx * 0.7) : Math.min(0.55, sz * 0.6)}
              rotation={sz > sx ? Math.PI / 2 : 0}
              color="#ffffff"
              flat
            />
          </group>
        )
      })}
    </group>
  )
}

// Cartel colgado sobre la cabecera de cada estantería, como en un almacén real.
function FloorLabels({ layout, mode, labelScale }: { layout: Layout; mode: SceneMode; labelScale: number }) {
  const racks = useMemo(() => buildRacks(layout), [layout])
  const colors = theme.scene[mode]
  if (layout.aisles) {
    return (
      <group>
        {layout.aisles.map((a) => {
          const top = Math.max(levelHeight(layout), ...racks.filter((r) => r.aisle === a.aisleId).map((r) => r.top))
          return (
            <Label3D
              key={a.aisleId}
              text={`Pasillo ${a.name}`}
              position={[a.x, top + 1.1, -(a.minY - 0.6)]}
              height={0.5 * labelScale}
              layer={5}
              color="#ffffff"
              background={colors.upright}
            />
          )
        })}
      </group>
    )
  }
  return (
    <group>
      {racks.map((r) => (
        <Label3D
          key={r.key}
          text={`Pasillo ${r.aisle}`}
          position={[r.x, r.top + 1.1, -(r.minY - 1.25)]}
          height={0.5 * labelScale}
          layer={5}
          color="#ffffff"
          background={colors.upright}
        />
      ))}
    </group>
  )
}

function SelectedLabel({ layout, locationId, labelScale }: { layout: Layout; locationId: string; labelScale: number }) {
  const loc = layout.locations.find((l) => l.locationId === locationId)
  if (!loc) return null
  const [x, y, z] = locationTop(loc, levelHeight(layout))
  return (
    <Label3D text={loc.locationId} position={[x, y + 0.6, z]} height={0.6 * labelScale} background={theme.location.selected} />
  )
}

// Encuadra todo el almacén (muelles incluidos) según la proporción del visor: en F&O el iframe es más bajo
// y estrecho que en Teams. Se recalcula al cambiar de tamaño; entre medias, la cámara es del usuario.
// V2: la primera vez la cámara entra desde arriba y de lado (1,8 s); si el usuario la toca, se corta.
type Fly = { from: Vector3; to: Vector3; center: Vector3; t: number }

function CameraFit({ layout }: { layout: Layout }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useThree((s) => s.controls) as
    | { target?: Vector3; update?: () => void; addEventListener?: (e: string, f: () => void) => void; removeEventListener?: (e: string, f: () => void) => void }
    | null
  const intro = useRef(v2)
  const fly = useRef<Fly | null>(null)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    const center = new Vector3(...layoutCenter(layout))
    const { width, depth } = layoutSize(layout)
    const vfov = (camera.fov * Math.PI) / 180
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (size.width / size.height))
    const distance = Math.max((width * theme.camera.fitWidth) / Math.tan(hfov / 2), (depth * theme.camera.fitDepth) / Math.tan(vfov / 2))
    const dir = new Vector3(0, theme.camera.elevation[0], theme.camera.elevation[1]).normalize()
    const to = center.clone().addScaledVector(dir, distance)
    if (intro.current && controls) {
      intro.current = false
      const span = Math.max(width, depth)
      const from = center.clone().add(new Vector3(-span * 0.55, span * 1.25, span * 0.15))
      fly.current = { from, to, center, t: 0 }
      camera.position.copy(from)
    } else {
      fly.current = null
      camera.position.copy(to)
    }
    camera.lookAt(center)
    controls?.target?.copy(center)
    controls?.update?.()
    invalidate()
  }, [camera, controls, size.width, size.height, layout, invalidate])
  useEffect(() => {
    const stop = () => (fly.current = null)
    controls?.addEventListener?.('start', stop)
    return () => controls?.removeEventListener?.('start', stop)
  }, [controls])
  useFrame((_, dt) => {
    const f = fly.current
    if (!f) return
    f.t = Math.min(1, f.t + dt / 1.8)
    const k = 1 - Math.pow(1 - f.t, 3)
    camera.position.lerpVectors(f.from, f.to, k)
    camera.lookAt(f.center)
    controls?.update?.()
    if (f.t >= 1) fly.current = null
  })
  return null
}

function Controls({ layout }: { layout: Layout }) {
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null)
  const center = layoutCenter(layout)
  const b = layout.bounds
  // No dejar que el objetivo se salga del almacén al hacer pan.
  const clamp = () => {
    const c = ref.current
    if (!c) return
    c.target.x = Math.min(Math.max(c.target.x, b.minX), b.maxX)
    c.target.z = Math.min(Math.max(c.target.z, -b.maxY), -b.minY)
    c.target.y = 0
  }
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      target={center}
      enableDamping
      minDistance={theme.camera.minDistance}
      maxDistance={Math.max(theme.camera.maxDistance, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 1.8)}
      maxPolarAngle={theme.camera.maxPolarAngle}
      onChange={clamp}
    />
  )
}
