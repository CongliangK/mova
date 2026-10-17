export interface Animation {
  id: string
  name: string
  direction: Direction
  frameCount: number
  fps: number
  loop: boolean
  frames: Frame[]
  status: AnimationStatus
  metadata: AnimationMetadata
}

export type Direction = "right" | "left" | "up" | "down"
export type AnimationStatus = "draft" | "generating" | "complete" | "error"

export interface Frame {
  id: string
  index: number
  imagePath: string
  duration: number | null
  description: string
  sourceFrameId: string | null
}

export interface AnimationMetadata {
  motionDescription: string
  keyframeHints: string[]
  generationParams: Record<string, unknown>
}
