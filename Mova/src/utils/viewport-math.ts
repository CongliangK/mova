/**
 * Pure viewport math helpers for zoom, pan, and artboard positioning.
 * Separated from CanvasArea so they can be tested without React/Konva.
 */

export interface ViewportState {
  scale: number
  stagePos: { x: number; y: number }
  stageSize: { width: number; height: number }
  artboardWidth: number
  artboardHeight: number
}

export interface ArtboardPosition {
  x: number
  y: number
}

export const MIN_SCALE = 0.1
export const MAX_SCALE = 10
export const ZOOM_FACTOR = 1.1

/**
 * Calculates the canvas content (artboard) position based on viewport state.
 */
export function calculateContentPosition(state: ViewportState): ArtboardPosition {
  return {
    x: (state.stageSize.width - state.artboardWidth * state.scale) / 2 + state.stagePos.x,
    y: (state.stageSize.height - state.artboardHeight * state.scale) / 2 + state.stagePos.y,
  }
}

/**
 * Calculates the base position (centered in stage without pan offset).
 */
export function calculateBasePosition(
  stageSize: { width: number; height: number },
  artboardWidth: number,
  artboardHeight: number,
  scale: number,
): ArtboardPosition {
  return {
    x: (stageSize.width - artboardWidth * scale) / 2,
    y: (stageSize.height - artboardHeight * scale) / 2,
  }
}

/**
 * Calculates the origin point in canvas space for a given stage position.
 */
export function calculateOriginPosition(
  base: ArtboardPosition,
  stagePos: { x: number; y: number },
): ArtboardPosition {
  return { x: base.x + stagePos.x, y: base.y + stagePos.y }
}

/**
 * Clamps a scale value to the valid range [MIN_SCALE, MAX_SCALE].
 */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

/**
 * Calculates a new zoom scale given a direction and current scale.
 */
export function zoomScale(direction: 1 | -1, currentScale: number): number {
  return clampScale(direction > 0 ? currentScale * ZOOM_FACTOR : currentScale / ZOOM_FACTOR)
}

/**
 * Calculates the mouse-to-target mapping for zooming around a pointer position.
 * Returns the new scale and stage position after zoom.
 */
export function zoomAroundPoint(
  pointer: { x: number; y: number },
  oldScale: number,
  direction: 1 | -1,
  artboardWidth: number,
  artboardHeight: number,
  stageSize: { width: number; height: number },
  currentStagePos: { x: number; y: number },
): { newScale: number; newStagePos: { x: number; y: number } } {
  const newScale = zoomScale(direction, oldScale)

  const oldBase = calculateBasePosition(stageSize, artboardWidth, artboardHeight, oldScale)
  const newBase = calculateBasePosition(stageSize, artboardWidth, artboardHeight, newScale)

  const oldOrigin = calculateOriginPosition(oldBase, currentStagePos)

  const mousePointTo = {
    x: (pointer.x - oldOrigin.x) / oldScale,
    y: (pointer.y - oldOrigin.y) / oldScale,
  }

  return {
    newScale,
    newStagePos: {
      x: pointer.x - newBase.x - mousePointTo.x * newScale,
      y: pointer.y - newBase.y - mousePointTo.y * newScale,
    },
  }
}

/**
 * Rounds a percentage display value (scale * 100) to the nearest integer.
 */
export function scalePercent(scale: number): number {
  return Math.round(scale * 100)
}
