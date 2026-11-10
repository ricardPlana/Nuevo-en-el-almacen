import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './hub.css'
import Gate from './Gate.tsx'

// Hub (/hub/): página aparte de la vista 3D. No importa three.js ni los estilos de la vista 3D.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
)
