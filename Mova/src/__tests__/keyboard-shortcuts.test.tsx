import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, within, createEvent } from "@testing-library/react"
import type { ReactNode } from "react"
import { CanvasArea } from "../../src/components/canvas/canvas-area"
import { SettingsPage } from "../../src/pages/settings-page"
import { useAnimationStore } from "../../src/stores/animation-store"
import { useProjectStore } from "../../src/stores/project-store"
import { getAppZoomScale, useSettingsStore } from "../../src/stores/settings-store"
import { useAppZoom } from "../../src/hooks/use-app-zoom"
import { useShortcuts } from "../../src/hooks/use-shortcuts"
import type { Animation } from "../../src/types/animation"
import type { Project } from "../../src/types/project"

vi.mock("react-konva", () => ({
  Stage: ({ children }: { children?: ReactNode }) => <div data-testid="stage">{children}</div>,
  Layer: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Image: () => <div data-testid="konva-image" />,
  Rect: () => <div data-testid="konva-rect" />,
}))

vi.mock("../../src/components/canvas/drawing-toolbar", () => ({
  DrawingToolbar: () => <div data-testid="drawing-toolbar" />,
}))

vi.mock("../../src/components/canvas/grid-overlay", () => ({
  GridOverlay: ({ visible, gridSize }: { visible: boolean; gridSize: number }) => (
    <div data-testid="grid-overlay" data-visible={String(visible)} data-grid-size={gridSize} />
  ),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock("../../src/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}))

const animation: Animation = {
  id: "animation-1",
  name: "Idle",
  direction: "right",
  frameCount: 1,
  fps: 12,
  loop: true,
  status: "complete",
  metadata: {
    motionDescription: "idle",
    keyframeHints: [],
    generationParams: {},
  },
  frames: [
    {
      id: "frame-1",
      index: 0,
      imagePath: "",
      duration: null,
      description: "idle frame",
      sourceFrameId: null,
    },
  ],
}

const project: Project = {
  id: "project-1",
  name: "Shortcut Project",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  activeCharacterId: "character-1",
  settings: {
    defaultFrameWidth: 64,
    defaultFrameHeight: 64,
    defaultFps: 12,
    defaultArtStyle: "pixel-art",
  },
  characters: [
    {
      id: "character-1",
      name: "Hero",
      description: "A shortcut test character",
      style: {
        artStyle: "pixel-art",
        colorPalette: ["#ffffff"],
        frameSize: { width: 64, height: 64 },
        referenceDescription: "white hero",
      },
      baseImagePath: null,
      tags: [],
      animations: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
}

function renderCanvasWithInput(input: ReactNode = null) {
  return render(
    <>
      <CanvasArea />
      {input}
    </>
  )
}

function AppZoomShortcutHarness() {
  const zoomAppIn = useSettingsStore((s) => s.zoomAppIn)
  const zoomAppOut = useSettingsStore((s) => s.zoomAppOut)
  const resetAppZoom = useSettingsStore((s) => s.resetAppZoom)
  useAppZoom()
  useShortcuts({ zoomIn: zoomAppIn, zoomOut: zoomAppOut, zoomReset: resetAppZoom })

  return <input aria-label="chat input" />
}

function dispatchShortcut(target: Window | HTMLElement, init: KeyboardEventInit) {
  const event = createEvent.keyDown(target, {
    bubbles: true,
    cancelable: true,
    ...init,
  })
  fireEvent(target, event)
  return event
}

describe("keyboard shortcuts", () => {
  beforeAll(() => {
    class MockResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
      value: MockResizeObserver,
      configurable: true,
    })
  })

  beforeEach(() => {
    useProjectStore.setState({
      project,
      projectPath: "/tmp/mova-shortcuts",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [animation],
      activeAnimationId: animation.id,
      currentFrameIndex: 0,
      isPlaying: false,
      playbackSpeed: 1,
      onionSkinEnabled: false,
      onionSkinOpacity: 0.3,
      frameClipboard: null,
    })
    useSettingsStore.setState({
      appZoomLevel: 0,
      editorSettings: {
        defaultFrameWidth: 64,
        defaultFrameHeight: 64,
        defaultFps: 12,
        defaultArtStyle: "pixel_art",
        gridSize: 16,
        canvasBackground: "checkerboard",
      },
    })
    document.documentElement.style.removeProperty("--mova-app-zoom")
  })

  it("mounts editor shortcuts and runs enabled actions outside input fields", () => {
    renderCanvasWithInput()

    fireEvent.keyDown(window, { key: " " })
    expect(useAnimationStore.getState().isPlaying).toBe(true)

    expect(screen.getByText("100%")).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "+" })
    fireEvent.keyDown(window, { key: "-" })
    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("keeps canvas toolbar zoom local to the canvas percentage", () => {
    renderCanvasWithInput()

    expect(useSettingsStore.getState().appZoomLevel).toBe(0)
    fireEvent.click(screen.getByTitle("Zoom in"))

    expect(screen.getByText("110%")).toBeInTheDocument()
    expect(useSettingsStore.getState().appZoomLevel).toBe(0)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe("")
  })

  it("does not run shortcuts from input, textarea, select, or contenteditable targets", () => {
    renderCanvasWithInput(
      <div>
        <input aria-label="chat input" />
        <textarea aria-label="prompt textarea" />
        <select aria-label="model select">
          <option>OpenAI</option>
        </select>
        <div contentEditable suppressContentEditableWarning aria-label="rich editor">
          Editable prompt
        </div>
      </div>
    )

    fireEvent.keyDown(screen.getByLabelText("chat input"), { key: " " })
    fireEvent.keyDown(screen.getByLabelText("prompt textarea"), { key: " " })
    fireEvent.keyDown(screen.getByLabelText("model select"), { key: " " })
    fireEvent.keyDown(screen.getByLabelText("rich editor"), { key: " " })

    expect(useAnimationStore.getState().isPlaying).toBe(false)
    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("handles modified zoom shortcuts from inputs and prevents native zoom", () => {
    const { unmount } = render(<AppZoomShortcutHarness />)
    const input = screen.getByLabelText("chat input")

    const metaZoomIn = dispatchShortcut(input, { key: "=", metaKey: true })
    expect(metaZoomIn.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(1)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(1)),
    )

    const ctrlShiftZoomIn = dispatchShortcut(input, {
      key: "+",
      ctrlKey: true,
      shiftKey: true,
    })
    expect(ctrlShiftZoomIn.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(2)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(2)),
    )

    const numpadZoomIn = dispatchShortcut(input, {
      key: "Unidentified",
      code: "NumpadAdd",
      ctrlKey: true,
    })
    expect(numpadZoomIn.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(3)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(3)),
    )

    const metaZoomOut = dispatchShortcut(input, { key: "-", metaKey: true })
    expect(metaZoomOut.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(2)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(2)),
    )

    const numpadZoomOut = dispatchShortcut(input, {
      key: "Unidentified",
      code: "NumpadSubtract",
      ctrlKey: true,
    })
    expect(numpadZoomOut.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(1)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(1)),
    )

    const ctrlReset = dispatchShortcut(input, {
      key: "Unidentified",
      code: "Digit0",
      metaKey: true,
    })
    expect(ctrlReset.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(0)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(0)),
    )

    useSettingsStore.setState({ appZoomLevel: 2 })
    const numpadReset = dispatchShortcut(input, {
      key: "Unidentified",
      code: "Numpad0",
      ctrlKey: true,
    })
    expect(numpadReset.defaultPrevented).toBe(true)
    expect(useSettingsStore.getState().appZoomLevel).toBe(0)
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe(
      String(getAppZoomScale(0)),
    )

    unmount()
    expect(document.documentElement.style.getPropertyValue("--mova-app-zoom")).toBe("")
  })

  it("continues blocking plain zoom shortcuts from inputs", () => {
    renderCanvasWithInput(<input aria-label="chat input" />)
    const input = screen.getByLabelText("chat input")

    const plainZoomIn = dispatchShortcut(input, { key: "+" })
    const plainZoomOut = dispatchShortcut(input, { key: "-" })
    const plainZoomReset = dispatchShortcut(input, { key: "0" })

    expect(plainZoomIn.defaultPrevented).toBe(false)
    expect(plainZoomOut.defaultPrevented).toBe(false)
    expect(plainZoomReset.defaultPrevented).toBe(false)
    expect(screen.getByText("100%")).toBeInTheDocument()
  })

  it("reflects grid defaults from editor settings", () => {
    useSettingsStore.setState({
      editorSettings: {
        ...useSettingsStore.getState().editorSettings,
        gridSize: 32,
      },
    })

    renderCanvasWithInput()

    expect(screen.getByTitle("Cycle grid size")).toHaveTextContent("32px")
  })

  it("marks unavailable shortcut controls explicitly disabled in settings", () => {
    render(<SettingsPage onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /快捷键/i }))

    expect(screen.getByText("播放或暂停动画")).toBeInTheDocument()
    expect(screen.getByText("放大应用界面")).toBeInTheDocument()
    expect(screen.getByText("Ctrl/Cmd+= or Ctrl/Cmd++")).toBeInTheDocument()
    expect(screen.getByText("Ctrl/Cmd+0")).toBeInTheDocument()
    const notAvailable = screen.getByText("保存项目").closest("div[aria-disabled='true']")
    expect(notAvailable).not.toBeNull()
    expect(within(notAvailable as HTMLElement).getByText(/暂不可用/i)).toBeInTheDocument()
  })
})
