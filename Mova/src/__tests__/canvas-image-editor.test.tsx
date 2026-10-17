import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest"
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { CanvasArea } from "../../src/components/canvas/canvas-area"
import { useAnimationStore } from "../../src/stores/animation-store"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"
import type { Project } from "../../src/types/project"
import { dataUrlToBytes } from "../../src/utils/image-save"
import {
  drawingLayerMock,
  relativePointerRef,
  stageHandlerRef,
  createKonvaMouseEvent,
  getAddedNodeConfig,
  setupKonvaTestEnvironment,
  resetKonvaMocks,
} from "./helpers/konva-mock"
import type { KonvaEventObject } from "konva/lib/Node"

const invokeMock = vi.fn()
const showToastMock = vi.fn()

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("konva", async () => {
  const { MockLine, MockRect, MockEllipse } = await import("./helpers/konva-mock")
  return {
    default: { Line: MockLine, Rect: MockRect, Ellipse: MockEllipse },
  }
})

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}))

vi.mock("react-konva", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  const {
    drawingLayerMock: dl,
    relativePointerRef: rp,
    stageHandlerRef: sh,
  } = await import("./helpers/konva-mock")
  return {
    Stage: React.forwardRef(
      (
        {
          children,
          onMouseDown,
          onMouseMove,
          onMouseUp,
        }: {
          children?: React.ReactNode
          onMouseDown?: (event: KonvaEventObject<MouseEvent>) => void
          onMouseMove?: (event: KonvaEventObject<MouseEvent>) => void
          onMouseUp?: (event: KonvaEventObject<MouseEvent>) => void
        },
        ref: React.ForwardedRef<unknown>,
      ) => {
        sh.current = { onMouseDown, onMouseMove, onMouseUp }
        React.useImperativeHandle(ref, () => ({
          findOne: () => dl,
          getRelativePointerPosition: () => rp.current,
        }))
        return React.createElement("div", { "data-testid": "stage" }, children)
      },
    ),
    Layer: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    Image: () => React.createElement("div", { "data-testid": "konva-image" }),
    Rect: () => React.createElement("div", { "data-testid": "konva-rect" }),
  }
})

vi.mock("../../src/components/canvas/drawing-toolbar", () => ({
  DrawingToolbar: ({ onToolChange }: { onToolChange: (tool: "brush" | "ellipse") => void }) => (
    <div data-testid="drawing-toolbar">
      <button type="button" onClick={() => onToolChange("brush")}>Brush</button>
      <button type="button" onClick={() => onToolChange("ellipse")}>Ellipse</button>
    </div>
  ),
}))

vi.mock("../../src/components/canvas/grid-overlay", () => ({
  GridOverlay: ({ visible, gridSize }: { visible: boolean; gridSize: number }) => (
    <div data-testid="grid-overlay" data-visible={String(visible)} data-grid-size={gridSize} />
  ),
}))

// Project fixture is defined inline because it's specific to editing scenarios
const project: Project = {
  id: "project-1",
  name: "Image Project",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  activeCharacterId: null,
  settings: {
    defaultFrameWidth: 64,
    defaultFrameHeight: 64,
    defaultFps: 12,
    defaultArtStyle: "pixel-art",
  },
  characters: [],
}

function setActiveAnimation(framePaths: string[]) {
  const activeAnimation = {
    id: "animation-1",
    name: "Run",
    direction: "right" as const,
    frameCount: framePaths.length,
    fps: 12,
    loop: true,
    status: "complete" as const,
    metadata: {
      motionDescription: "run",
      keyframeHints: [],
      generationParams: {},
    },
    frames: framePaths.map((imagePath, index) => ({
      id: `frame-${index + 1}`,
      index,
      imagePath,
      duration: null,
      description: `frame ${index + 1}`,
      sourceFrameId: null,
    })),
  }

  useAnimationStore.setState({
    animations: [activeAnimation],
    activeAnimationId: activeAnimation.id,
    currentFrameIndex: 0,
  })
}

describe("CanvasArea image file editor", () => {
  beforeAll(() => {
    setupKonvaTestEnvironment()
  })

  beforeEach(() => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    showToastMock.mockReset()
    resetKonvaMocks()
    useProjectStore.setState({
      project,
      projectPath: "/tmp/mova-image-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [],
      activeAnimationId: null,
      currentFrameIndex: 0,
      isPlaying: false,
      playbackSpeed: 1,
      onionSkinEnabled: false,
      onionSkinOpacity: 0.3,
      frameClipboard: null,
    })
    useSettingsStore.setState({
      editorSettings: {
        defaultFrameWidth: 64,
        defaultFrameHeight: 64,
        defaultFps: 12,
        defaultArtStyle: "pixel_art",
        gridSize: 16,
        canvasBackground: "checkerboard",
      },
    })
    useFileTreeStore.setState({
      selectedPath: null,
      expandedPaths: new Set(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders selected PNG files in image editor mode even without an active animation", async () => {
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/hero.png",
    })

    render(<CanvasArea />)

    expect(screen.getByTestId("image-editor")).toBeInTheDocument()
    expect(screen.getByText("hero.png")).toBeInTheDocument()
    expect(screen.queryByText("No animation selected")).not.toBeInTheDocument()
    expect(screen.getByTestId("drawing-toolbar")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save/i })).not.toBeDisabled()
    })
  })

  it("saves editable image files through save_image_bytes", async () => {
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/hero.png",
    })
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AQI=")
    invokeMock.mockResolvedValue("/tmp/mova-image-project/assets/characters/hero.png")

    render(<CanvasArea />)

    const saveButton = screen.getByRole("button", { name: /save/i })
    await waitFor(() => expect(saveButton).not.toBeDisabled())
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: "/tmp/mova-image-project/assets/characters/hero.png",
        data: [1, 2],
      })
    })
    expect(await screen.findByText("Saved")).toBeInTheDocument()
  })

  it("shows GIF files as read-only image previews", () => {
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/walk.gif",
    })

    render(<CanvasArea />)

    expect(screen.getByText("Selected GIF preview is read-only")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled()
    expect(screen.queryByTestId("drawing-toolbar")).not.toBeInTheDocument()
  })

  it("returns from selected image preview to timeline preview", () => {
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/hero.png",
    })

    render(<CanvasArea />)
    fireEvent.click(screen.getByRole("button", { name: /show timeline preview/i }))

    expect(useFileTreeStore.getState().selectedPath).toBeNull()
    expect(screen.queryByTestId("image-editor")).not.toBeInTheDocument()
    expect(screen.getByTestId("empty-canvas")).toBeInTheDocument()
  })

  it("adds the selected image to the active timeline and reveals the timeline frame preview", () => {
    const activeAnimation = {
      id: "animation-1",
      name: "Run",
      direction: "right" as const,
      frameCount: 1,
      fps: 12,
      loop: true,
      status: "complete" as const,
      metadata: {
        motionDescription: "run",
        keyframeHints: [],
        generationParams: {},
      },
      frames: [
        {
          id: "frame-1",
          index: 0,
          imagePath: "/tmp/mova-image-project/assets/frames/one.png",
          duration: null,
          description: "frame 1",
          sourceFrameId: null,
        },
      ],
    }
    useProjectStore.setState({
      project: {
        ...project,
        activeCharacterId: "character-1",
        characters: [
          {
            id: "character-1",
            name: "Hero",
            description: "",
            style: {
              artStyle: "pixel-art",
              colorPalette: [],
              frameSize: { width: 64, height: 64 },
              referenceDescription: "",
            },
            baseImagePath: null,
            animations: [activeAnimation],
            tags: [],
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
      },
      projectPath: "/tmp/mova-image-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
      currentFrameIndex: 0,
    })
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/hero.png",
    })

    render(<CanvasArea />)
    fireEvent.click(screen.getByRole("button", { name: /add hero\.png to timeline/i }))

    const updatedAnimation = useAnimationStore.getState().animations[0]
    expect(updatedAnimation.frames.map((frame) => frame.imagePath)).toEqual([
      "/tmp/mova-image-project/assets/frames/one.png",
      "/tmp/mova-image-project/assets/characters/hero.png",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(1)
    expect(useFileTreeStore.getState().selectedPath).toBeNull()
    expect(screen.queryByTestId("image-editor")).not.toBeInTheDocument()
    expect(screen.getByText("Run")).toBeInTheDocument()
    expect(screen.getByText("2 frames · 12 FPS · edits save to current frame")).toBeInTheDocument()
  })

  it("draws brush strokes with artboard-relative pointer coordinates", () => {
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/hero.png",
    })

    render(<CanvasArea />)

    relativePointerRef.current = { x: 5, y: 7 }
    stageHandlerRef.current.onMouseDown?.(createKonvaMouseEvent("mousedown"))
    relativePointerRef.current = { x: 9, y: 11 }
    stageHandlerRef.current.onMouseMove?.(createKonvaMouseEvent("mousemove"))
    stageHandlerRef.current.onMouseUp?.(createKonvaMouseEvent("mouseup"))

    expect(drawingLayerMock.add).toHaveBeenCalledTimes(1)
    expect(getAddedNodeConfig().points).toEqual([5, 7, 9, 11])
  })

  it("saves editable animation frame drawing edits to the frame path", async () => {
    setActiveAnimation(["/tmp/mova-image-project/assets/frames/run-1.png"])
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,AQI=")
    invokeMock.mockResolvedValue("/tmp/mova-image-project/assets/frames/run-1.png")

    render(<CanvasArea />)

    const saveButton = screen.getByRole("button", { name: /save frame/i })
    await waitFor(() => expect(saveButton).not.toBeDisabled())
    relativePointerRef.current = { x: 5, y: 7 }
    stageHandlerRef.current.onMouseDown?.(createKonvaMouseEvent("mousedown"))
    relativePointerRef.current = { x: 9, y: 11 }
    stageHandlerRef.current.onMouseMove?.(createKonvaMouseEvent("mousemove"))
    stageHandlerRef.current.onMouseUp?.(createKonvaMouseEvent("mouseup"))
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: "/tmp/mova-image-project/assets/frames/run-1.png",
        data: [1, 2],
      })
    })
    expect(await screen.findByText("Saved")).toBeInTheDocument()
  })

  it("clears unsaved drawing strokes when switching animation frames", async () => {
    setActiveAnimation([
      "/tmp/mova-image-project/assets/frames/run-1.png",
      "/tmp/mova-image-project/assets/frames/run-2.png",
    ])

    render(<CanvasArea />)

    await waitFor(() => expect(drawingLayerMock.destroyChildren).toHaveBeenCalled())
    drawingLayerMock.destroyChildren.mockClear()
    drawingLayerMock.batchDraw.mockClear()
    relativePointerRef.current = { x: 5, y: 7 }
    stageHandlerRef.current.onMouseDown?.(createKonvaMouseEvent("mousedown"))
    relativePointerRef.current = { x: 9, y: 11 }
    stageHandlerRef.current.onMouseMove?.(createKonvaMouseEvent("mousemove"))
    stageHandlerRef.current.onMouseUp?.(createKonvaMouseEvent("mouseup"))
    drawingLayerMock.batchDraw.mockClear()

    act(() => {
      useAnimationStore.getState().setCurrentFrame(1)
    })

    await waitFor(() => {
      expect(drawingLayerMock.destroyChildren).toHaveBeenCalledTimes(1)
      expect(drawingLayerMock.batchDraw).toHaveBeenCalledTimes(1)
    })
  })

  it("disables animation-frame drawing when the frame has no editable path", () => {
    setActiveAnimation([""])

    render(<CanvasArea />)

    expect(screen.getByText("Frame drawing unavailable")).toBeInTheDocument()
    expect(screen.getByText("Current frame has no editable image path")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /save frame/i })).toBeDisabled()
    relativePointerRef.current = { x: 5, y: 7 }
    stageHandlerRef.current.onMouseDown?.(createKonvaMouseEvent("mousedown"))

    expect(drawingLayerMock.add).not.toHaveBeenCalled()
  })

  it.each(["jpg", "jpeg", "webp"])(
    "disables animation-frame drawing for non-PNG .%s frame paths",
    (extension) => {
      setActiveAnimation([`/tmp/mova-image-project/assets/frames/run-1.${extension}`])

      render(<CanvasArea />)

      expect(screen.getByText("Frame drawing unavailable")).toBeInTheDocument()
      expect(screen.getByText("Only PNG frame drawing edits can be saved")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /save frame/i })).toBeDisabled()
      relativePointerRef.current = { x: 5, y: 7 }
      stageHandlerRef.current.onMouseDown?.(createKonvaMouseEvent("mousedown"))

      expect(drawingLayerMock.add).not.toHaveBeenCalled()
      expect(invokeMock).not.toHaveBeenCalledWith(
        "save_image_bytes",
        expect.anything(),
      )
    },
  )

  it("creates ellipse shapes when the ellipse tool is active", () => {
    useFileTreeStore.setState({
      selectedPath: "/tmp/mova-image-project/assets/characters/hero.png",
    })

    render(<CanvasArea />)
    fireEvent.click(screen.getByRole("button", { name: "Ellipse" }))

    relativePointerRef.current = { x: 10, y: 20 }
    stageHandlerRef.current.onMouseDown?.(createKonvaMouseEvent("mousedown"))
    relativePointerRef.current = { x: 30, y: 60 }
    stageHandlerRef.current.onMouseMove?.(createKonvaMouseEvent("mousemove"))

    expect(drawingLayerMock.add).toHaveBeenCalledTimes(1)
    expect(getAddedNodeConfig()).toMatchObject({
      name: "shape-ellipse",
      x: 20,
      y: 40,
      radiusX: 10,
      radiusY: 20,
    })
  })
})

describe("image save helpers", () => {
  it("converts data URLs to byte arrays", () => {
    expect(dataUrlToBytes("data:image/png;base64,AQI=")).toEqual([1, 2])
  })
})
