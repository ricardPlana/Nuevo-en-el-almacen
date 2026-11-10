// Textos del hub para los valores de F&O (estados, tipos de trabajo) y formatos.

const WORK_STATUS: Record<string, string> = {
  Open: 'Abierto',
  InProcess: 'En curso',
  PendingReview: 'Pendiente de revisión',
  Closed: 'Cerrado',
  Cancelled: 'Cancelado',
  Skipped: 'Omitido',
  Combined: 'Combinado',
}

const ORDER_TYPE: Record<string, string> = {
  Sales: 'Pedido de venta',
  Purch: 'Pedido de compra',
  TransferIssue: 'Salida de transferencia',
  TransferReceipt: 'Entrada de transferencia',
  Replenishment: 'Reaprovisionamiento',
  ProdPick: 'Picking de producción',
  ProdPut: 'Ubicación de producción',
  ProdProcessPut: 'Ubicación de proceso',
  Invent: 'Movimiento de inventario',
  CycleCount: 'Recuento cíclico',
  CycleCountAccepted: 'Recuento aceptado',
  ReturnOrder: 'Devolución',
  KanbanPick: 'Picking kanban',
  KanbanPut: 'Ubicación kanban',
  PackedContainerPicking: 'Picking de contenedor',
  CrossDocking: 'Cross-docking',
  QualityOrder: 'Pedido de calidad',
  OutboundShipmentOrder: 'Envío de salida',
  InboundShipmentOrder: 'Envío de entrada',
}

const LOAD_STATUS: Record<string, string> = {
  Open: 'Abierta',
  Posted: 'Registrada',
  Waved: 'En oleada',
  InProcess: 'En proceso',
  Loaded: 'Cargada',
  Shipped: 'Enviada',
  Received: 'Recibida',
  PartiallyShipped: 'Enviada en parte',
}

// Carga sin estado en F&O: el que sale de sus works.
const LOAD_DERIVED: Record<string, string> = { Open: 'Con works abiertos', Closed: 'Works cerrados', Cancelled: 'Cancelada' }

export type Tone = 'info' | 'warn' | 'ok' | 'muted'

export function workStatus(s: string): { label: string; tone: Tone } {
  const tone: Tone = s === 'Open' ? 'info' : s === 'InProcess' || s === 'PendingReview' ? 'warn' : s === 'Closed' ? 'ok' : 'muted'
  return { label: WORK_STATUS[s] ?? s, tone }
}

export function loadStatus(status: string, fno?: string): { label: string; tone: Tone } {
  if (fno) {
    const tone: Tone = fno === 'Shipped' || fno === 'Received' ? 'ok' : fno === 'Open' || fno === 'Posted' ? 'info' : 'warn'
    return { label: LOAD_STATUS[fno] ?? fno, tone }
  }
  return { label: LOAD_DERIVED[status] ?? status, tone: status === 'Open' ? 'info' : status === 'Closed' ? 'ok' : 'muted' }
}

export function workStage(stage: string, location?: string): { label: string; tone: Tone } {
  if (stage === 'Staged') return { label: `En ${location ?? 'zona intermedia'}`, tone: 'warn' }
  if (stage === 'Loaded') return { label: 'Cargado', tone: 'ok' }
  if (stage === 'Cancelled') return { label: 'Cancelado', tone: 'muted' }
  return { label: 'Pendiente de picking', tone: 'info' }
}

const SALES_STATUS: Record<string, string> = { Backorder: 'Pedido abierto', Delivered: 'Entregado', Invoiced: 'Facturado', Canceled: 'Cancelado' }
export const salesStatus = (s?: string): string => (s ? (SALES_STATUS[s] ?? s) : '—')

export const orderType = (t: string): string => ORDER_TYPE[t] ?? t

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })

export const date = (iso?: string): string => (iso ? dateFmt.format(new Date(iso)) : '—')
// Fecha sin hora de F&O (se guarda en UTC): no se convierte a la zona del navegador.
const dayFmt = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
export const dayOnly = (iso?: string): string => (iso ? dayFmt.format(new Date(iso)) : '—')
export const num = (n: number): string => numFmt.format(n)
