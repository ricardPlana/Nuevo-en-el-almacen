// Código de barras Code 128 (juego B: ASCII imprimible), sin dependencias. Es el que lee la app móvil de almacén de
// F&O al escanear una ubicación. Anchos de barra/espacio de cada símbolo: tabla del estándar (la misma que ZXing,
// Apache-2.0).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132',
  '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212',
  '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311',
  '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212',
  '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113',
  '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]
const START_B = 104
const STOP = 106

// ¿Se puede codificar en el juego B? (caracteres 32–126)
export const code128Ok = (text: string): boolean => text.length > 0 && [...text].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126)

// Barras como [x, ancho] en módulos, con 10 módulos de margen a cada lado (zona de silencio).
export function code128Bars(text: string): { bars: [number, number][]; width: number } {
  if (!code128Ok(text)) throw new Error('Code 128 B: solo ASCII imprimible')
  const values = [...text].map((c) => c.charCodeAt(0) - 32)
  const check = (START_B + values.reduce((sum, v, i) => sum + v * (i + 1), 0)) % 103
  const symbols = [START_B, ...values, check, STOP]
  const bars: [number, number][] = []
  let x = 10
  for (const s of symbols) {
    const widths = PATTERNS[s]
    for (let i = 0; i < widths.length; i++) {
      const w = Number(widths[i])
      if (i % 2 === 0) bars.push([x, w])
      x += w
    }
  }
  return { bars, width: x + 10 }
}
