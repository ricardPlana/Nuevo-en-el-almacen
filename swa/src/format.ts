// Formato de números para el panel y las etiquetas 3D (es-ES: 1.234,5).

export function formatQty(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 2 })
}
