import { useState } from 'react'
import { Environment, Lightformer, PerformanceMonitor, SoftShadows } from '@react-three/drei'

// Lo que la V2 añade a la escena. Se carga aparte (import dinámico): la V1 no descarga nada de esto.
// - Luz de estudio: un entorno hecho con paneles de luz (sin ficheros HDR). Se calcula una vez (frames=1), no por fotograma.
// - Sombras suaves (PCSS) con penumbra. Es lo único que cuesta por fotograma: si el equipo baja de FPS, se quitan.
// - Niebla muy suave al fondo, del color del fondo, para dar profundidad.
export default function Extras({ span, background }: { span: number; background: string }) {
  const [soft, setSoft] = useState(true)
  return (
    <>
      <fog attach="fog" args={[background, span * 1.4, span * 3.2]} />
      <Environment resolution={256} frames={1} environmentIntensity={0.4}>
        <Lightformer form="rect" intensity={2.2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 24, 1]} />
        <Lightformer form="rect" intensity={1} position={[-22, 5, 0]} rotation-y={Math.PI / 2} scale={[40, 6, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[22, 5, 0]} rotation-y={-Math.PI / 2} scale={[40, 6, 1]} />
        <Lightformer form="rect" color="#ffe2bf" intensity={1.4} position={[0, 4, 24]} scale={[30, 4, 1]} />
      </Environment>
      <PerformanceMonitor onDecline={() => setSoft(false)} flipflops={1}>
        {soft && <SoftShadows size={14} samples={10} focus={0.5} />}
      </PerformanceMonitor>
    </>
  )
}
