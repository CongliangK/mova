import { useCallback, memo } from "react"
import { Shape } from "react-konva"
import type Konva from "konva"

export type GridSize = 8 | 16 | 32

export interface GridLineConfig {
  key: string
  points: number[]
  stroke: string
  strokeWidth: number
  opacity: number
}

export interface GridOverlayProps {
  width: number
  height: number
  gridSize: GridSize
  stageScale: number
  visible: boolean
}

function getGridStrokeColor() {
  if (typeof window === "undefined") return "#d7dce5"
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--color-border")
    .trim()
  return value || "#d7dce5"
}

/**
 * React-Konva component that renders a pixel grid.
 * Place inside a <Layer> that sits above your drawing layers.
 */
export const GridOverlay = memo(function GridOverlay({ width, height, gridSize, stageScale, visible }: GridOverlayProps) {
  const drawGrid = useCallback(
    (context: Konva.Context) => {
      const ctx = context as unknown as CanvasRenderingContext2D & {
        setAttr?: (attr: string, value: unknown) => void
      }
      const setAttr = ctx.setAttr?.bind(ctx)
      const setContextAttr = (attr: string, value: unknown) => {
        if (setAttr) {
          setAttr(attr, value)
          return
        }
        ;(ctx as unknown as Record<string, unknown>)[attr] = value
      }

      ctx.save()
      ctx.beginPath()
      setContextAttr("strokeStyle", getGridStrokeColor())
      setContextAttr("lineWidth", 1 / Math.max(0.001, stageScale))
      setContextAttr("globalAlpha", 0.35)

      for (let x = 0; x <= width; x += gridSize) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, height)
      }
      for (let y = 0; y <= height; y += gridSize) {
        ctx.moveTo(0, y)
        ctx.lineTo(width, y)
      }

      ctx.stroke()
      ctx.restore()
    },
    [gridSize, height, stageScale, width],
  )

  if (!visible) return null

  return (
    <Shape
      sceneFunc={drawGrid}
      listening={false}
      perfectDrawEnabled={false}
    />
  )
})
