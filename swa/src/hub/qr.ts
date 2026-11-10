// Generador de códigos QR (modo byte, corrección M), sin dependencias. Sigue el algoritmo de referencia de Nayuki
// (QR Code generator library, MIT, https://www.nayuki.io/page/qr-code-generator-library), recortado a lo que hace
// falta aquí: URLs de hasta ~270 caracteres (versiones 1–15).

// Corrección M: códigos de corrección por bloque y número de bloques, por versión (índice 0 sin usar).
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24]
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10]
const MAX_VERSION = ECC_PER_BLOCK.length - 1
const FORMAT_M = 0 // bits de formato del nivel M

// Matriz de módulos (true = negro), fila a fila.
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)]
  let ver = 1
  for (; ver <= MAX_VERSION; ver++) {
    const bits = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8
    if (bits <= numDataCodewords(ver) * 8) break
  }
  if (ver > MAX_VERSION) throw new Error('Texto demasiado largo para el QR')

  // Datos: modo byte (0100), longitud, bytes; terminador, relleno a byte y bytes de relleno 0xEC/0x11.
  const capacity = numDataCodewords(ver) * 8
  const bb: number[] = []
  const append = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1)
  }
  append(4, 4)
  append(bytes.length, ver <= 9 ? 8 : 16)
  for (const b of bytes) append(b, 8)
  append(0, Math.min(4, capacity - bb.length))
  append(0, (8 - (bb.length % 8)) % 8)
  for (let pad = 0xec; bb.length < capacity; pad ^= 0xec ^ 0x11) append(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bb.length; i += 8) data.push(bb.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  const size = ver * 4 + 17
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const isFunction = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const setFunction = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark
    isFunction[y][x] = true
  }

  // Patrones fijos: temporización, buscadores, alineación, formato (provisional) y versión.
  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0)
    setFunction(i, 6, i % 2 === 0)
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4)
      }
    }
  }
  const align = alignmentPositions(ver, size)
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }
  const drawFormat = (mask: number) => {
    const d = (FORMAT_M << 3) | mask
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((d << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) setFunction(8, i, bit(i))
    setFunction(8, 7, bit(6))
    setFunction(8, 8, bit(7))
    setFunction(7, 8, bit(8))
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, bit(i))
    setFunction(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunction(a, b, dark)
      setFunction(b, a, dark)
    }
  }

  // Datos con su corrección, en zigzag de dos columnas desde abajo a la derecha.
  const codewords = addEcc(data, ver)
  let k = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x] && k < codewords.length * 8) {
          modules[y][x] = ((codewords[k >>> 3] >>> (7 - (k & 7))) & 1) !== 0
          k++
        }
      }
    }
  }

  // La máscara con menos penalización.
  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isFunction[y][x] && maskBit(mask, x, y)) modules[y][x] = !modules[y][x]
      }
    }
  }
  let best = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask)
    drawFormat(mask)
    const score = penalty(modules)
    if (score < bestScore) {
      best = mask
      bestScore = score
    }
    applyMask(mask)
  }
  applyMask(best)
  drawFormat(best)
  return modules
}

// SVG (path) con 4 módulos de margen, como pide el estándar.
export function qrSvgPath(matrix: boolean[][]): { path: string; size: number } {
  const n = matrix.length
  let path = ''
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) if (matrix[y][x]) path += `M${x + 4},${y + 4}h1v1h-1z`
  }
  return { path, size: n + 8 }
}

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function numDataCodewords(ver: number): number {
  return Math.floor(numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver]
}

function alignmentPositions(ver: number, size: number): number[] {
  if (ver === 1) return []
  const numAlign = Math.floor(ver / 7) + 2
  const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2
  const result = [6]
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
  return result
}

function addEcc(data: number[], ver: number): number[] {
  const numBlocks = NUM_BLOCKS[ver]
  const eccLen = ECC_PER_BLOCK[ver]
  const raw = Math.floor(numRawDataModules(ver) / 8)
  const numShort = numBlocks - (raw % numBlocks)
  const shortLen = Math.floor(raw / numBlocks)
  const divisor = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const result: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortLen - eccLen || j >= numShort) result.push(block[i])
    })
  }
  return result
}

function rsDivisor(degree: number): number[] {
  const result: number[] = Array<number>(degree - 1).fill(0)
  result.push(1)
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMul(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = rsMul(root, 0x02)
  }
  return result
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => (result[i] ^= rsMul(coef, factor)))
  }
  return result
}

function rsMul(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  }
}

// Penalización (reglas 1, 2 y 4 del estándar): rachas de 5+ iguales, bloques 2×2 y proporción de negro.
function penalty(m: boolean[][]): number {
  const n = m.length
  let score = 0
  for (let a = 0; a < n; a++) {
    let runRow = 1
    let runCol = 1
    for (let b = 1; b < n; b++) {
      if (m[a][b] === m[a][b - 1]) runRow++
      else {
        if (runRow >= 5) score += runRow - 2
        runRow = 1
      }
      if (m[b][a] === m[b - 1][a]) runCol++
      else {
        if (runCol >= 5) score += runCol - 2
        runCol = 1
      }
    }
    if (runRow >= 5) score += runRow - 2
    if (runCol >= 5) score += runCol - 2
  }
  let dark = 0
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) dark++
      if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3
    }
  }
  score += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10
  return score
}
