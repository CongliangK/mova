import Konva from "konva"
import type { DrawingTool, DrawingToolConfig } from "../types"

export type ShapeMode = "rect" | "ellipse"

export interface ShapeToolConfig extends DrawingToolConfig {
  mode: ShapeMode
  fillColor: string
  strokeColor: string
  strokeWidth: number
}

export function createShapeTool(): DrawingTool {
  let currentShape: Konva.Rect | Konva.Ellipse | null = null
  let startPos = { x: 0, y: 0 }

  return {
    name: "shape",
    cursor: "crosshair",
    onMouseDown(_e, stage, config: DrawingToolConfig, point) {
      const layer = stage.findOne(".drawing-layer") as Konva.Layer
      if (!layer) return

      startPos = { x: point.x, y: point.y }

      const shapeConfig = config as ShapeToolConfig
      const mode = shapeConfig.mode ?? "rect"

      if (mode === "ellipse") {
        currentShape = new Konva.Ellipse({
          x: point.x,
          y: point.y,
          radiusX: 0,
          radiusY: 0,
          fill: shapeConfig.fillColor ?? config.color,
          stroke: shapeConfig.strokeColor ?? config.color,
          strokeWidth: shapeConfig.strokeWidth ?? 2,
          name: "shape-ellipse",
          perfectDrawEnabled: false,
        })
      } else {
        currentShape = new Konva.Rect({
          x: point.x,
          y: point.y,
          width: 0,
          height: 0,
          fill: shapeConfig.fillColor ?? config.color,
          stroke: shapeConfig.strokeColor ?? config.color,
          strokeWidth: shapeConfig.strokeWidth ?? 2,
          name: "shape-rect",
          perfectDrawEnabled: false,
        })
      }

      layer.add(currentShape)
      layer.batchDraw()
    },
    onMouseMove(_e, _stage, config: DrawingToolConfig, point) {
      if (!currentShape) return

      const shapeConfig = config as ShapeToolConfig
      const mode = shapeConfig.mode ?? "rect"

      if (mode === "ellipse") {
        const ellipse = currentShape as Konva.Ellipse
        const rx = Math.abs(point.x - startPos.x) / 2
        const ry = Math.abs(point.y - startPos.y) / 2
        const cx = (point.x + startPos.x) / 2
        const cy = (point.y + startPos.y) / 2
        ellipse.x(cx)
        ellipse.y(cy)
        ellipse.radiusX(rx)
        ellipse.radiusY(ry)
      } else {
        const rect = currentShape as Konva.Rect
        const x = Math.min(point.x, startPos.x)
        const y = Math.min(point.y, startPos.y)
        const width = Math.abs(point.x - startPos.x)
        const height = Math.abs(point.y - startPos.y)
        rect.x(x)
        rect.y(y)
        rect.width(width)
        rect.height(height)
      }

      currentShape.getLayer()?.batchDraw()
    },
    onMouseUp() {
      currentShape = null
    },
  }
}
