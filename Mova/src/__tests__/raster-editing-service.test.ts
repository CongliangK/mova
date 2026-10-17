import { describe, expect, it } from "vitest"
import {
  applyBrushStroke,
  applyEraserStroke,
  createRasterEditDocument,
  discardRasterEdits,
  exportRasterPngBytes,
  getRasterPixel,
  undoRasterEdit,
} from "../services/drawing/raster-editing-service"

function createFixturePixels(): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(4 * 4 * 4)
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const pixelIndex = (y * 4 + x) * 4
      pixels[pixelIndex] = 10 + x
      pixels[pixelIndex + 1] = 20 + y
      pixels[pixelIndex + 2] = 30
      pixels[pixelIndex + 3] = 255
    }
  }
  return pixels
}

function createFixtureDocument() {
  const pixels = createFixturePixels()
  const originalPngBytes = exportRasterPngBytes({
    width: 4,
    height: 4,
    pixels: new Uint8ClampedArray(pixels),
    originalPixels: new Uint8ClampedArray(pixels),
    originalPngBytes: [],
    history: { push: () => undefined } as never,
  })

  return createRasterEditDocument({ width: 4, height: 4, pixels, originalPngBytes })
}

function fnv1a(bytes: number[]): string {
  let hash = 0x811c9dc5
  for (const byte of bytes) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

function decodePngRgba(bytes: number[]): { width: number; height: number; pixels: Uint8Array } {
  const view = new DataView(Uint8Array.from(bytes).buffer)
  let offset = 8
  let width = 0
  let height = 0
  const idatBytes: number[] = []

  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    offset += 4
    const type = String.fromCharCode(...bytes.slice(offset, offset + 4))
    offset += 4
    const data = bytes.slice(offset, offset + length)
    offset += length + 4

    if (type === "IHDR") {
      width = new DataView(Uint8Array.from(data.slice(0, 8)).buffer).getUint32(0)
      height = new DataView(Uint8Array.from(data.slice(0, 8)).buffer).getUint32(4)
    }
    if (type === "IDAT") idatBytes.push(...data)
  }

  const inflated = inflateStoredZlib(idatBytes)
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    const sourceStart = y * (width * 4 + 1) + 1
    pixels.set(inflated.slice(sourceStart, sourceStart + width * 4), y * width * 4)
  }

  return { width, height, pixels }
}

function inflateStoredZlib(bytes: number[]): Uint8Array {
  const output: number[] = []
  let offset = 2
  let isFinalBlock = false

  while (!isFinalBlock) {
    const blockHeader = bytes[offset]
    offset += 1
    isFinalBlock = (blockHeader & 1) === 1
    expect((blockHeader >> 1) & 0b11).toBe(0)

    const length = bytes[offset] | (bytes[offset + 1] << 8)
    const invertedLength = bytes[offset + 2] | (bytes[offset + 3] << 8)
    expect((length ^ 0xffff) & 0xffff).toBe(invertedLength)
    offset += 4

    output.push(...bytes.slice(offset, offset + length))
    offset += length
  }

  return Uint8Array.from(output)
}

describe("raster editing service byte-level PNG mutations", () => {
  it("mutates a known RGBA coordinate for a red PNG brush stroke", () => {
    const document = createFixtureDocument()

    applyBrushStroke(document, { x: 2, y: 2 }, { color: [255, 0, 0, 255], size: 1 })

    expect(getRasterPixel(document, 2, 2)).toEqual([255, 0, 0, 255])
    expect(getRasterPixel(document, 1, 1)).toEqual([11, 21, 30, 255])
  })

  it("erases alpha and allows strokes partially outside PNG bounds", () => {
    const document = createFixtureDocument()

    expect(() => applyEraserStroke(document, { x: -1, y: 0 }, 3)).not.toThrow()

    expect(getRasterPixel(document, 0, 0)).toEqual([10, 20, 30, 0])
    expect(getRasterPixel(document, 3, 3)).toEqual([13, 23, 30, 255])
  })

  it("undo restores original RGBA after brush mutation", () => {
    const document = createFixtureDocument()
    const originalPixel = getRasterPixel(document, 2, 2)

    applyBrushStroke(document, { x: 2, y: 2 }, { color: [255, 0, 0, 255], size: 1 })

    expect(undoRasterEdit(document)).toBe(true)

    expect(getRasterPixel(document, 2, 2)).toEqual(originalPixel)
  })

  it("discard restores the original PNG byte hash", () => {
    const document = createFixtureDocument()
    const originalHash = fnv1a(document.originalPngBytes)

    applyBrushStroke(document, { x: 2, y: 2 }, { color: [255, 0, 0, 255], size: 1 })
    discardRasterEdits(document)

    expect(fnv1a(exportRasterPngBytes(document))).toBe(originalHash)
  })

  it("exports changed PNG bytes with the same dimensions", () => {
    const document = createFixtureDocument()

    applyBrushStroke(document, { x: 2, y: 2 }, { color: [255, 0, 0, 255], size: 1 })
    const exported = exportRasterPngBytes(document)
    const decoded = decodePngRgba(exported)

    expect(exported.slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(decoded.width).toBe(4)
    expect(decoded.height).toBe(4)
    expect([...decoded.pixels.slice((2 * 4 + 2) * 4, (2 * 4 + 3) * 4)]).toEqual([255, 0, 0, 255])
  })
})
