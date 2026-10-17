import { vi } from "vitest"
import type { KonvaEventObject } from "konva/lib/Node"

// ---------------------------------------------------------------------------
// Konva mock classes (Line, Rect, Ellipse) — shared, NOT hoisted
// Export as plain values; test files wrap references via vi.hoisted() or
// dynamic import inside vi.mock factories.
// ---------------------------------------------------------------------------

class MockDrawable {
  config: Record<string, unknown>

  constructor(config: Record<string, unknown>) {
    this.config = { ...config }
  }

  points(nextPoints?: number[]) {
    if (nextPoints) this.config.points = nextPoints
    return this.config.points as number[]
  }

  stroke(color: string) {
    this.config.stroke = color
  }

  strokeWidth(width: number) {
    this.config.strokeWidth = width
  }

  x(value: number) {
    this.config.x = value
  }

  y(value: number) {
    this.config.y = value
  }

  width(value: number) {
    this.config.width = value
  }

  height(value: number) {
    this.config.height = value
  }

  radiusX(value: number) {
    this.config.radiusX = value
  }

  radiusY(value: number) {
    this.config.radiusY = value
  }

  getLayer() {
    return drawingLayerMock
  }

  remove() {
    /* no-op */
  }

  destroy() {
    /* no-op */
  }
}

export class MockLine extends MockDrawable {
  constructor(config: Record<string, unknown>) {
    super(config)
  }
}

export class MockRect extends MockDrawable {
  constructor(config: Record<string, unknown>) {
    super(config)
  }
}

export class MockEllipse extends MockDrawable {
  constructor(config: Record<string, unknown>) {
    super(config)
  }
}

// ---------------------------------------------------------------------------
// Drawing layer mock
// ---------------------------------------------------------------------------

export const drawingLayerMock = {
  toCanvas: vi.fn(() => document.createElement("canvas")),
  destroyChildren: vi.fn(),
  batchDraw: vi.fn(),
  add: vi.fn(),
}

// ---------------------------------------------------------------------------
// Mutable refs for Stage interaction
// ---------------------------------------------------------------------------

export const relativePointerRef: { current: { x: number; y: number } | null } = {
  current: null,
}

export const pointerPositionRef: { current: { x: number; y: number } | null } = {
  current: null,
}

export interface StageHandlerRef {
  onMouseDown?: (event: KonvaEventObject<MouseEvent>) => void
  onMouseMove?: (event: KonvaEventObject<MouseEvent>) => void
  onMouseUp?: (event: KonvaEventObject<MouseEvent>) => void
  onWheel?: (event: KonvaEventObject<WheelEvent>) => void
  onMouseLeave?: (event: KonvaEventObject<MouseEvent>) => void
}

export const stageHandlerRef: { current: StageHandlerRef } = { current: {} }

// ---------------------------------------------------------------------------
// Event factories
// ---------------------------------------------------------------------------

export function createKonvaMouseEvent(
  type: string,
  overrides?: Partial<MouseEventInit>,
): KonvaEventObject<MouseEvent> {
  return {
    evt: new MouseEvent(type, { button: 0, ...overrides }),
  } as KonvaEventObject<MouseEvent>
}

export function createKonvaWheelEvent(
  deltaY: number,
  overrides?: Partial<WheelEventInit>,
): KonvaEventObject<WheelEvent> {
  return {
    evt: new WheelEvent("wheel", { deltaY, ...overrides }),
  } as KonvaEventObject<WheelEvent>
}

// ---------------------------------------------------------------------------
// Helper: get the config of the last shape added to the drawing layer
// ---------------------------------------------------------------------------

export function getAddedNodeConfig(): Record<string, unknown> {
  const addedNode = drawingLayerMock.add.mock.calls[0]?.[0] as
    | { attrs?: Record<string, unknown>; config?: Record<string, unknown> }
    | undefined
  return addedNode?.config ?? addedNode?.attrs ?? {}
}

// ---------------------------------------------------------------------------
// Test environment setup / teardown
// ---------------------------------------------------------------------------

class MockImage {
  crossOrigin = ""
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 16
  naturalHeight = 16
  width = 16
  height = 16

  set src(_value: string) {
    setTimeout(() => this.onload?.(), 0)
  }
}

class MockResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

export function setupKonvaTestEnvironment() {
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: MockResizeObserver,
    configurable: true,
  })
  Object.defineProperty(window, "Image", {
    value: MockImage,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// Reset helpers (call in beforeEach)
// ---------------------------------------------------------------------------

export function resetKonvaMocks() {
  drawingLayerMock.toCanvas.mockClear?.()
  drawingLayerMock.destroyChildren.mockClear?.()
  drawingLayerMock.batchDraw.mockClear?.()
  drawingLayerMock.add.mockClear?.()
  relativePointerRef.current = null
  pointerPositionRef.current = null
  stageHandlerRef.current = {}
}
