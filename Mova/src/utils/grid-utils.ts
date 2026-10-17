import type { GridSize, GridLineConfig } from "../components/canvas/grid-overlay"

/**
 * Generate Konva Line configs for a pixel-grid overlay.
 * Lines are placed in **stage-local** coordinates so they scale
 * automatically with the Stage's scaleX/scaleY.
 */
export function createGridLines(
  width: number,
  height: number,
  gridSize: GridSize,
  _stageScale: number
): GridLineConfig[] {
  const lines: GridLineConfig[] = []
  const stroke = "var(--color-border)"
  // Keep stroke width visually constant (1 screen px) regardless of zoom
  const strokeWidth = 1 / _stageScale
  const opacity = 0.35

  // Vertical lines
  for (let x = 0; x <= width; x += gridSize) {
    lines.push({
      key: `v-${x}`,
      points: [x, 0, x, height],
      stroke,
      strokeWidth,
      opacity,
    })
  }

  // Horizontal lines
  for (let y = 0; y <= height; y += gridSize) {
    lines.push({
      key: `h-${y}`,
      points: [0, y, width, y],
      stroke,
      strokeWidth,
      opacity,
    })
  }

  return lines
}
