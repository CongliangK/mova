import Konva from "konva"
import type { DrawingTool, DrawingToolConfig } from "../types"

function getPixelColor(data: Uint8ClampedArray, x: number, y: number, width: number): [number, number, number, number] {
  const idx = (y * width + x) * 4
  return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]
}

function setPixelColor(data: Uint8ClampedArray, x: number, y: number, width: number, color: [number, number, number, number]) {
  const idx = (y * width + x) * 4
  data[idx] = color[0]
  data[idx + 1] = color[1]
  data[idx + 2] = color[2]
  data[idx + 3] = color[3]
}

function colorsMatch(a: [number, number, number, number], b: [number, number, number, number], tolerance: number): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance &&
    Math.abs(a[3] - b[3]) <= tolerance
  )
}

function hexToRgba(hex: string): [number, number, number, number] {
  const clean = hex.replace("#", "")
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return [r, g, b, 255]
}

export function createFillTool(): DrawingTool {
  return {
    name: "fill",
    cursor: "crosshair",
    onMouseDown(_e, stage, config: DrawingToolConfig, point) {
      const layer = stage.findOne(".drawing-layer") as Konva.Layer
      if (!layer) return

      // Get the canvas element from the layer
      const canvas = layer.getCanvas()._canvas as HTMLCanvasElement
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const width = canvas.width
      const height = canvas.height
      const imageData = ctx.getImageData(0, 0, width, height)
      const data = imageData.data

      const startX = Math.floor(point.x)
      const startY = Math.floor(point.y)

      if (startX < 0 || startX >= width || startY < 0 || startY >= height) return

      const targetColor = getPixelColor(data, startX, startY, width)
      const fillColor = hexToRgba(config.color)
      const tolerance = 32

      if (colorsMatch(targetColor, fillColor, tolerance)) return

      // Flood fill using stack-based algorithm
      const stack: [number, number][] = [[startX, startY]]
      const visited = new Set<number>()

      while (stack.length > 0) {
        const [x, y] = stack.pop()!
        const key = y * width + x
        if (visited.has(key)) continue
        visited.add(key)

        const currentColor = getPixelColor(data, x, y, width)
        if (!colorsMatch(currentColor, targetColor, tolerance)) continue

        setPixelColor(data, x, y, width, fillColor)

        if (x > 0) stack.push([x - 1, y])
        if (x < width - 1) stack.push([x + 1, y])
        if (y > 0) stack.push([x, y - 1])
        if (y < height - 1) stack.push([x, y + 1])
      }

      ctx.putImageData(imageData, 0, 0)
      layer.batchDraw()
    },
    onMouseMove() {
      // No-op for fill tool
    },
    onMouseUp() {
      // No-op for fill tool
    },
  }
}
