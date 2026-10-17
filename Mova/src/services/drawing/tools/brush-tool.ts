import Konva from "konva"
import type { DrawingTool, DrawingToolConfig } from "../types"

export function createBrushTool(): DrawingTool {
  let currentLine: Konva.Line | null = null
  let lastPoint = { x: 0, y: 0 }

  return {
    name: "brush",
    cursor: "crosshair",
    onMouseDown(_e, stage, config: DrawingToolConfig, point) {
      const layer = stage.findOne(".drawing-layer") as Konva.Layer
      if (!layer) return

      lastPoint = { x: point.x, y: point.y }
      currentLine = new Konva.Line({
        points: [point.x, point.y],
        stroke: config.color,
        strokeWidth: config.size,
        lineCap: "round",
        lineJoin: "round",
        name: "brush-stroke",
        perfectDrawEnabled: false,
      })

      layer.add(currentLine)
      layer.batchDraw()
    },
    onMouseMove(_e, _stage, config: DrawingToolConfig, point) {
      if (!currentLine) return

      const minDistance = Math.max(0.5, config.size * 0.08)
      const dx = point.x - lastPoint.x
      const dy = point.y - lastPoint.y
      if (dx * dx + dy * dy < minDistance * minDistance) return
      lastPoint = { x: point.x, y: point.y }

      const points = currentLine.points()
      points.push(point.x, point.y)
      currentLine.points(points)
      currentLine.stroke(config.color)
      currentLine.strokeWidth(config.size)
      currentLine.getLayer()?.batchDraw()
    },
    onMouseUp() {
      currentLine = null
    },
  }
}
