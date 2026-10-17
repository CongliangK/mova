import { useState, useCallback } from "react"

export type GridSize = 8 | 16 | 32

export interface GridOverlayState {
  visible: boolean
  gridSize: GridSize
}

export interface UseGridOverlayReturn {
  visible: boolean
  gridSize: GridSize
  toggle: () => void
  show: () => void
  hide: () => void
  setGridSize: (size: GridSize) => void
  cycleGridSize: () => void
}

const DEFAULT_GRID_SIZE: GridSize = 16
const GRID_SIZES: GridSize[] = [8, 16, 32]

/**
 * Hook that manages pixel-grid overlay state.
 *
 * Usage:
 *   const grid = useGridOverlay()
 *   // … inside JSX:
 *   <GridOverlay
 *     width={canvasW}
 *     height={canvasH}
 *     gridSize={grid.gridSize}
 *     stageScale={scale}
 *     visible={grid.visible}
 *   />
 */
export function useGridOverlay(
  initial: Partial<GridOverlayState> = {}
): UseGridOverlayReturn {
  const [visible, setVisible] = useState(initial.visible ?? true)
  const [gridSize, setGridSizeState] = useState<GridSize>(
    initial.gridSize ?? DEFAULT_GRID_SIZE
  )

  const toggle = useCallback(() => setVisible((v) => !v), [])
  const show = useCallback(() => setVisible(true), [])
  const hide = useCallback(() => setVisible(false), [])

  const setGridSize = useCallback((size: GridSize) => {
    setGridSizeState(size)
  }, [])

  const cycleGridSize = useCallback(() => {
    setGridSizeState((prev: GridSize) => {
      const idx = GRID_SIZES.indexOf(prev)
      const nextIdx = (idx + 1) % GRID_SIZES.length
      return GRID_SIZES[nextIdx]
    })
  }, [])

  return {
    visible,
    gridSize,
    toggle,
    show,
    hide,
    setGridSize,
    cycleGridSize,
  }
}
