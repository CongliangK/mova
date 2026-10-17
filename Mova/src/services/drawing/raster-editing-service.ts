import { HistoryManager } from "./history-manager"

export interface RasterEditDocument {
  width: number
  height: number
  pixels: Uint8ClampedArray
  readonly originalPixels: Uint8ClampedArray
  readonly originalPngBytes: number[]
  readonly history: HistoryManager<Uint8ClampedArray>
}

export interface RasterPoint {
  x: number
  y: number
}

export interface RasterBrushConfig {
  color: [number, number, number, number]
  size: number
}

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]

export function createRasterEditDocument(params: {
  width: number
  height: number
  pixels: Uint8ClampedArray
  originalPngBytes: number[]
  historyDepth?: number
}): RasterEditDocument {
  const expectedLength = params.width * params.height * 4
  if (params.pixels.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} RGBA bytes, received ${params.pixels.length}`)
  }

  const pixels = new Uint8ClampedArray(params.pixels)
  const history = new HistoryManager<Uint8ClampedArray>(params.historyDepth)
  history.push(new Uint8ClampedArray(pixels))

  return {
    width: params.width,
    height: params.height,
    pixels,
    originalPixels: new Uint8ClampedArray(pixels),
    originalPngBytes: [...params.originalPngBytes],
    history,
  }
}

export function applyBrushStroke(document: RasterEditDocument, point: RasterPoint, config: RasterBrushConfig): void {
  mutateCircle(document, point, config.size, (pixelIndex) => {
    document.pixels[pixelIndex] = config.color[0]
    document.pixels[pixelIndex + 1] = config.color[1]
    document.pixels[pixelIndex + 2] = config.color[2]
    document.pixels[pixelIndex + 3] = config.color[3]
  })
  document.history.push(new Uint8ClampedArray(document.pixels))
}

export function applyEraserStroke(document: RasterEditDocument, point: RasterPoint, size: number): void {
  mutateCircle(document, point, size, (pixelIndex) => {
    document.pixels[pixelIndex + 3] = 0
  })
  document.history.push(new Uint8ClampedArray(document.pixels))
}

export function undoRasterEdit(document: RasterEditDocument): boolean {
  const previous = document.history.undo()
  if (!previous) return false

  document.pixels = new Uint8ClampedArray(previous)
  return true
}

export function redoRasterEdit(document: RasterEditDocument): boolean {
  const next = document.history.redo()
  if (!next) return false

  document.pixels = new Uint8ClampedArray(next)
  return true
}

export function discardRasterEdits(document: RasterEditDocument): void {
  document.pixels = new Uint8ClampedArray(document.originalPixels)
  document.history.clear()
  document.history.push(new Uint8ClampedArray(document.pixels))
}

export function getRasterPixel(document: RasterEditDocument, x: number, y: number): [number, number, number, number] {
  const pixelIndex = getPixelIndex(document, x, y)
  return [
    document.pixels[pixelIndex],
    document.pixels[pixelIndex + 1],
    document.pixels[pixelIndex + 2],
    document.pixels[pixelIndex + 3],
  ]
}

export function exportRasterPngBytes(document: RasterEditDocument): number[] {
  const rawRows: number[] = []
  for (let y = 0; y < document.height; y++) {
    rawRows.push(0)
    const rowStart = y * document.width * 4
    for (let offset = 0; offset < document.width * 4; offset++) {
      rawRows.push(document.pixels[rowStart + offset])
    }
  }

  return [
    ...pngSignature,
    ...createPngChunk("IHDR", [
      ...uint32Bytes(document.width),
      ...uint32Bytes(document.height),
      8,
      6,
      0,
      0,
      0,
    ]),
    ...createPngChunk("IDAT", createZlibStoredBlock(rawRows)),
    ...createPngChunk("IEND", []),
  ]
}

function mutateCircle(
  document: RasterEditDocument,
  point: RasterPoint,
  size: number,
  updatePixel: (pixelIndex: number) => void,
): void {
  const radius = Math.max(0, Math.floor(size / 2))
  const centerX = Math.round(point.x)
  const centerY = Math.round(point.y)

  for (let y = centerY - radius; y <= centerY + radius; y++) {
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      if (x < 0 || y < 0 || x >= document.width || y >= document.height) continue
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2) continue
      updatePixel(getPixelIndex(document, x, y))
    }
  }
}

function getPixelIndex(document: RasterEditDocument, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= document.width || y >= document.height) {
    throw new Error(`Pixel (${x}, ${y}) is outside ${document.width}x${document.height}`)
  }
  return (y * document.width + x) * 4
}

function createZlibStoredBlock(data: number[]): number[] {
  const blocks: number[] = [0x78, 0x01]
  let offset = 0

  while (offset < data.length) {
    const blockLength = Math.min(0xffff, data.length - offset)
    const isFinalBlock = offset + blockLength >= data.length
    blocks.push(isFinalBlock ? 0x01 : 0x00)
    blocks.push(blockLength & 0xff, (blockLength >> 8) & 0xff)
    const invertedLength = blockLength ^ 0xffff
    blocks.push(invertedLength & 0xff, (invertedLength >> 8) & 0xff)
    blocks.push(...data.slice(offset, offset + blockLength))
    offset += blockLength
  }

  blocks.push(...uint32Bytes(adler32(data)))
  return blocks
}

function createPngChunk(type: string, data: number[]): number[] {
  const typeBytes = [...type].map((char) => char.charCodeAt(0))
  return [...uint32Bytes(data.length), ...typeBytes, ...data, ...uint32Bytes(crc32([...typeBytes, ...data]))]
}

function uint32Bytes(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function adler32(bytes: number[]): number {
  let first = 1
  let second = 0

  for (const byte of bytes) {
    first = (first + byte) % 65521
    second = (second + first) % 65521
  }

  return ((second << 16) | first) >>> 0
}

function crc32(bytes: number[]): number {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}
