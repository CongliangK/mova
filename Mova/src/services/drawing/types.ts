import type Konva from "konva"
import type { KonvaEventObject } from "konva/lib/Node"

export interface DrawingToolConfig {
  color: string
  size: number
  mode?: "rect" | "ellipse"
}

export interface DrawingPoint {
  x: number
  y: number
}

export interface DrawingTool {
  name: string
  cursor: string
  onMouseDown: (e: KonvaEventObject<MouseEvent>, stage: Konva.Stage, config: DrawingToolConfig, point: DrawingPoint) => void
  onMouseMove: (e: KonvaEventObject<MouseEvent>, stage: Konva.Stage, config: DrawingToolConfig, point: DrawingPoint) => void
  onMouseUp: (e: KonvaEventObject<MouseEvent>, stage: Konva.Stage, config: DrawingToolConfig, point: DrawingPoint | null) => void
}

export type ToolType = "brush" | "eraser" | "fill" | "rect" | "ellipse"

export interface DrawingToolbarProps {
  activeTool: ToolType
  onToolChange: (tool: ToolType) => void
  config: DrawingToolConfig
  onConfigChange: (config: DrawingToolConfig) => void
}
