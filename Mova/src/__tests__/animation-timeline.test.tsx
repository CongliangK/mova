import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { AnimationTimeline } from "../../src/components/canvas/animation-timeline"
import { useAnimationStore } from "../../src/stores/animation-store"
import { useFileTreeStore } from "../../src/stores/file-tree-store"
import { useProjectStore } from "../../src/stores/project-store"
import type { Animation } from "../../src/types/animation"
import type { Project } from "../../src/types/project"

const showToastMock = vi.fn()
const invokeMock = vi.fn()
const refreshTreeMock = vi.fn()
const webviewUnlistenMock = vi.fn()

type NativeDropEvent = {
  payload:
    | {
        type: "drop"
        paths: string[]
        position: NativeTauriDropPosition
      }
    | {
        type: "over"
        position: NativeTauriDropPosition
      }
}

type NativeTauriDropPosition = {
  x: number
  y: number
  toLogical?: (scaleFactor: number) => { x: number; y: number }
}

type DomPoint = { x: number; y: number }

type NativeDropHandler = (event: NativeDropEvent) => void

let nativeDropHandler: NativeDropHandler | null = null
const onDragDropEventMock = vi.fn((handler: NativeDropHandler) => {
  nativeDropHandler = handler
  return Promise.resolve(webviewUnlistenMock)
})
const getCurrentWebviewMock = vi.fn(() => ({
  onDragDropEvent: onDragDropEventMock,
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => getCurrentWebviewMock(),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}))

const animation: Animation = {
  id: "animation-1",
  name: "Run",
  direction: "right",
  frameCount: 2,
  fps: 12,
  loop: true,
  status: "complete",
  metadata: {
    motionDescription: "run",
    keyframeHints: [],
    generationParams: {},
  },
  frames: [
    {
      id: "frame-1",
      index: 0,
      imagePath: "",
      duration: null,
      description: "frame 1",
      sourceFrameId: null,
    },
    {
      id: "frame-2",
      index: 1,
      imagePath: "",
      duration: null,
      description: "frame 2",
      sourceFrameId: null,
    },
  ],
}

const project: Project = {
  id: "project-1",
  name: "Timeline Project",
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
      description: "",
      style: {
        artStyle: "pixel-art",
        colorPalette: [],
        frameSize: { width: 64, height: 64 },
        referenceDescription: "",
      },
      baseImagePath: null,
      animations: [],
      tags: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  ],
}

function dataTransferFor(path: string) {
  return {
    dropEffect: "",
    getData: (type: string) => {
      if (type === "application/x-mova-file") {
        return JSON.stringify({
          path,
          name: path.split("/").pop(),
          category: "image",
          isDirectory: false,
        })
      }
      if (type === "text/plain") return path
      return ""
    },
    types: ["application/x-mova-file", "text/plain"],
  }
}

function dataTransferForFiles(files: File[]) {
  return {
    dropEffect: "",
    files,
    getData: () => "",
    types: ["Files"],
  }
}

function dataTransferForFrameDrag() {
  const store = new Map<string, string>()
  const transfer = {
    dropEffect: "",
    effectAllowed: "",
    files: [] as File[],
    types: [] as string[],
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, value: string) => {
      store.set(type, value)
      if (!transfer.types.includes(type)) transfer.types.push(type)
    },
  }
  return transfer
}

function getSavedImagePath() {
  const payload = invokeMock.mock.calls.find(
    ([command]) => command === "save_image_bytes",
  )?.[1]
  if (!payload || typeof payload !== "object" || !("path" in payload)) {
    throw new Error("Expected save_image_bytes payload")
  }
  return String((payload as { path: string }).path)
}

function getRegisteredNativeDropHandler() {
  if (!nativeDropHandler) {
    throw new Error("Expected native drag/drop handler to be registered")
  }
  return nativeDropHandler
}

function setDevicePixelRatio(devicePixelRatio: number) {
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: devicePixelRatio,
  })
}

function createNativeTauriPhysicalPositionFromDomRectPoint(
  domPoint: DomPoint,
  devicePixelRatio: number,
) {
  const physicalPosition = {
    x: domPoint.x * devicePixelRatio,
    y: domPoint.y * devicePixelRatio,
  }
  const toLogical = vi.fn((scaleFactor: number) => ({
    x: physicalPosition.x / scaleFactor,
    y: physicalPosition.y / scaleFactor,
  }))

  return {
    position: { ...physicalPosition, toLogical },
    toLogical,
  }
}

function setTimelineHitArea(element: HTMLElement) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 480, 160),
  )
}

describe("AnimationTimeline", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    })
    showToastMock.mockReset()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    refreshTreeMock.mockReset()
    refreshTreeMock.mockResolvedValue(undefined)
    webviewUnlistenMock.mockReset()
    onDragDropEventMock.mockClear()
    getCurrentWebviewMock.mockClear()
    nativeDropHandler = null
    setDevicePixelRatio(1)
    useProjectStore.setState({
      project,
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useFileTreeStore.setState({
      refresh: refreshTreeMock,
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
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(window, "__TAURI_INTERNALS__")
  })

  it("renders an empty timeline instead of disappearing", () => {
    render(<AnimationTimeline />)

    expect(screen.getByTestId("animation-timeline-empty")).toBeInTheDocument()
    expect(screen.getByText("Waiting for frames")).toBeInTheDocument()
  })

  it("renders active animation frames", () => {
    useAnimationStore.setState({
      animations: [animation],
      activeAnimationId: animation.id,
    })

    render(<AnimationTimeline />)

    expect(screen.getByTestId("animation-timeline")).toBeInTheDocument()
    expect(screen.getByText("Run")).toBeInTheDocument()
    expect(screen.getByText("1/2")).toBeInTheDocument()
  })

  it("switches between multiple character timelines", () => {
    const idleAnimation: Animation = {
      ...animation,
      id: "animation-2",
      name: "Idle",
      frames: [
        {
          ...animation.frames[0],
          id: "idle-frame-1",
          imagePath: "/tmp/timeline-project/assets/frames/idle.png",
        },
      ],
      frameCount: 1,
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [animation, idleAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [animation, idleAnimation],
      activeAnimationId: animation.id,
      currentFrameIndex: 1,
    })

    render(<AnimationTimeline />)
    fireEvent.click(screen.getByLabelText("Switch to Idle timeline"))

    expect(useAnimationStore.getState().activeAnimationId).toBe(idleAnimation.id)
    expect(useAnimationStore.getState().currentFrameIndex).toBe(0)
    expect(screen.getByText("1/1")).toBeInTheDocument()
  })

  it("creates a new blank timeline from the header control", () => {
    useProjectStore.setState({
      project: {
        ...project,
        characters: [{ ...project.characters[0], animations: [animation] }],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [animation],
      activeAnimationId: animation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.click(screen.getByLabelText("Create new timeline"))

    const animations = useProjectStore.getState().project?.characters[0].animations
    const created = animations?.[1]
    expect(created).toMatchObject({ name: "Timeline 2", frameCount: 1 })
    expect(created?.frames[0].imagePath).toBe("")
    expect(useAnimationStore.getState().activeAnimationId).toBe(created?.id)
    expect(useAnimationStore.getState().currentFrameIndex).toBe(0)
  })

  it("creates a blank timeline when clicking an empty placeholder cell", () => {
    render(<AnimationTimeline />)
    fireEvent.click(screen.getByLabelText("Create timeline with frame 3 selected"))

    const created = useProjectStore.getState().project?.characters[0].animations[0]
    expect(created).toMatchObject({ name: "Timeline 1", frameCount: 3 })
    expect(created?.frames.map((frame) => frame.imagePath)).toEqual(["", "", ""])
    expect(useAnimationStore.getState().activeAnimationId).toBe(created?.id)
    expect(useAnimationStore.getState().currentFrameIndex).toBe(2)
  })

  it("inserts a blank frame when clicking an active timeline empty cell", () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.click(screen.getByLabelText("Insert blank frame 3"))

    const updated =
      useProjectStore.getState().project?.characters[0].animations[0]
    expect(updated?.frames.map((frame) => frame.imagePath)).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/2.png",
      "",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(2)
  })

  it("drops a structured file-tree image payload onto a target empty cell", () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("timeline-empty-cell-3"), {
      dataTransfer: dataTransferFor(
        "/tmp/timeline-project/assets/frames/dropped.png",
      ),
    })

    const updated =
      useProjectStore.getState().project?.characters[0].animations[0]
    expect(updated?.frames.map((frame) => frame.imagePath)).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/2.png",
      "",
      "/tmp/timeline-project/assets/frames/dropped.png",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(3)
  })

  it("drops a structured file-tree image payload onto an empty placeholder cell", () => {
    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("empty-timeline-cell-2"), {
      dataTransfer: dataTransferFor(
        "/tmp/timeline-project/assets/frames/first-drop.png",
      ),
    })

    const created = useProjectStore.getState().project?.characters[0].animations[0]
    expect(created).toMatchObject({ name: "Imported Frames", frameCount: 3 })
    expect(created?.frames.map((frame) => frame.imagePath)).toEqual([
      "",
      "",
      "/tmp/timeline-project/assets/frames/first-drop.png",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(2)
  })

  it("drops a structured file-tree image payload onto the active timeline container", () => {
    const activeAnimation = {
      id: "walk",
      name: "Walk",
      direction: "right" as const,
      fps: 12,
      loop: true,
      status: "complete" as const,
      metadata: {
        motionDescription: "walk",
        keyframeHints: [],
        generationParams: {},
      },
      frameCount: 2,
      frames: [
        {
          id: "frame-1",
          index: 0,
          imagePath: "/tmp/timeline-project/assets/frames/1.png",
          duration: 100,
          description: "frame 1",
          sourceFrameId: null,
        },
        {
          id: "frame-2",
          index: 1,
          imagePath: "/tmp/timeline-project/assets/frames/2.png",
          duration: 100,
          description: "frame 2",
          sourceFrameId: null,
        },
      ],
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("animation-timeline"), {
      dataTransfer: dataTransferFor(
        "/tmp/timeline-project/assets/frames/container-drop.png",
      ),
    })

    const updated =
      useProjectStore.getState().project?.characters[0].animations[0]
    expect(updated?.frames.map((frame) => frame.imagePath)).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/2.png",
      "/tmp/timeline-project/assets/frames/container-drop.png",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(2)
  })

  it("creates an active project animation from an image dropped onto the empty timeline", () => {
    useProjectStore.setState({
      project: { ...project, activeCharacterId: null, characters: [] },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })

    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("animation-timeline-empty"), {
      dataTransfer: dataTransferFor(
        "/tmp/timeline-project/assets/characters/hero.png",
      ),
    })

    const state = useProjectStore.getState()
    const character = state.project?.characters[0]
    expect(character?.name).toBe("Imported Character")
    expect(state.project?.activeCharacterId).toBe(character?.id)
    expect(character?.animations[0]).toMatchObject({
      name: "Imported Frames",
      frameCount: 1,
    })
    expect(character?.animations[0].frames[0].imagePath).toBe(
      "/tmp/timeline-project/assets/characters/hero.png",
    )
    expect(useAnimationStore.getState().activeAnimationId).toBe(
      character?.animations[0].id,
    )
  })

  it("saves an OS image drop on the empty timeline before creating an animation", async () => {
    useProjectStore.setState({
      project: { ...project, activeCharacterId: null, characters: [] },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    const pngBytes = [137, 80, 78, 71, 13, 10, 26, 10]

    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("animation-timeline-empty"), {
      dataTransfer: dataTransferForFiles([
        new File([new Uint8Array(pngBytes)], "hero.png", { type: "image/png" }),
      ]),
    })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: expect.stringMatching(
          /^\/tmp\/timeline-project\/assets\/characters\/hero-[\w-]+\.png$/,
        ),
        data: pngBytes,
      })
    })
    expect(refreshTreeMock).toHaveBeenCalledTimes(1)
    const savedPath = getSavedImagePath()

    await waitFor(() => {
      const state = useProjectStore.getState()
      const character = state.project?.characters[0]
      expect(character?.animations[0].frames[0].imagePath).toBe(
        savedPath,
      )
      expect(state.project?.activeCharacterId).toBe(character?.id)
    })
  })

  it("imports external native Tauri image paths before adding them to the timeline", async () => {
    useProjectStore.setState({
      project: { ...project, activeCharacterId: null, characters: [] },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    const pngBytes = [137, 80, 78, 71]
    invokeMock.mockImplementation((command: string) => {
      if (command === "read_image_file") {
        return Promise.resolve({ data: pngBytes, mime: "image/png" })
      }
      if (command === "save_image_bytes") return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })

    render(<AnimationTimeline />)
    setTimelineHitArea(screen.getByTestId("animation-timeline-empty"))

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
    act(() => {
      getRegisteredNativeDropHandler()({
        payload: {
          type: "drop",
          paths: ["/home/alice/Pictures/native.png"],
          position: { x: 24, y: 24 },
        },
      })
    })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("read_image_file", {
        path: "/home/alice/Pictures/native.png",
      })
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: expect.stringMatching(
          /^\/tmp\/timeline-project\/assets\/characters\/native-[\w-]+\.png$/,
        ),
        data: pngBytes,
      })
    })
    expect(refreshTreeMock).toHaveBeenCalledTimes(1)
    const savedPath = getSavedImagePath()

    await waitFor(() => {
      const state = useProjectStore.getState()
      const character = state.project?.characters[0]
      expect(character?.animations[0].frames[0].imagePath).toBe(savedPath)
      expect(character?.animations[0].frames[0].imagePath).not.toBe(
        "/home/alice/Pictures/native.png",
      )
      expect(state.project?.activeCharacterId).toBe(character?.id)
    })
  })

  it("adds project-contained native Tauri image paths without duplicating them", async () => {
    useProjectStore.setState({
      project: { ...project, activeCharacterId: null, characters: [] },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })

    render(<AnimationTimeline />)
    setTimelineHitArea(screen.getByTestId("animation-timeline-empty"))

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
    act(() => {
      getRegisteredNativeDropHandler()({
        payload: {
          type: "drop",
          paths: ["/tmp/timeline-project/assets/characters/native.png"],
          position: { x: 24, y: 24 },
        },
      })
    })

    expect(invokeMock).not.toHaveBeenCalled()
    expect(refreshTreeMock).not.toHaveBeenCalled()
    const state = useProjectStore.getState()
    const character = state.project?.characters[0]
    expect(character?.animations[0].frames[0].imagePath).toBe(
      "/tmp/timeline-project/assets/characters/native.png",
    )
    expect(state.project?.activeCharacterId).toBe(character?.id)
  })

  it("shows an error and skips timeline changes when external native image import fails", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "read_image_file") return Promise.reject(new Error("denied"))
      return Promise.resolve(undefined)
    })

    render(<AnimationTimeline />)
    setTimelineHitArea(screen.getByTestId("animation-timeline-empty"))

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
    act(() => {
      getRegisteredNativeDropHandler()({
        payload: {
          type: "drop",
          paths: ["/home/alice/Pictures/missing.png"],
          position: { x: 24, y: 24 },
        },
      })
    })

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "error",
        "Failed to import missing.png: denied",
      )
    })
    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_image_bytes",
      expect.anything(),
    )
    expect(refreshTreeMock).not.toHaveBeenCalled()
    expect(useAnimationStore.getState().animations).toEqual([])
  })

  it("uses native Tauri drop coordinates in the same space as the timeline rect", async () => {
    render(<AnimationTimeline />)
    vi.spyOn(
      screen.getByTestId("animation-timeline-empty"),
      "getBoundingClientRect",
    ).mockReturnValue(new DOMRect(355, 474, 510, 216))

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
    act(() => {
      getRegisteredNativeDropHandler()({
        payload: {
          type: "drop",
          paths: ["/tmp/timeline-project/assets/characters/native-log.png"],
          position: { x: 424, y: 642 },
        },
      })
    })

    const state = useProjectStore.getState()
    const character = state.project?.characters[0]
    expect(character?.animations[0].frames[0].imagePath).toBe(
      "/tmp/timeline-project/assets/characters/native-log.png",
    )
  })

  it.each([
    { appZoomScale: 0.8, expectedFrameIndex: 2 },
    { appZoomScale: 1.0, expectedFrameIndex: 2 },
    { appZoomScale: 1.25, expectedFrameIndex: 2 },
  ])(
    "maps native Tauri physical coordinates through toLogical into the DOM rect at app zoom $appZoomScale and appends frame index $expectedFrameIndex",
    async ({ appZoomScale, expectedFrameIndex }) => {
      const activeAnimation = {
        ...animation,
        frames: animation.frames.map((frame, index) => ({
          ...frame,
          imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
        })),
      }
      useProjectStore.setState({
        project: {
          ...project,
          characters: [
            { ...project.characters[0], animations: [activeAnimation] },
          ],
        },
        projectPath: "/tmp/timeline-project",
        isLoaded: true,
      })
      useAnimationStore.setState({
        animations: [activeAnimation],
        activeAnimationId: activeAnimation.id,
      })
      const devicePixelRatio = 2
      setDevicePixelRatio(devicePixelRatio)
      const unzoomedTimelineRect = {
        left: 355,
        top: 474,
        width: 510,
        height: 216,
      }
      const domRect = new DOMRect(
        unzoomedTimelineRect.left * appZoomScale,
        unzoomedTimelineRect.top * appZoomScale,
        unzoomedTimelineRect.width * appZoomScale,
        unzoomedTimelineRect.height * appZoomScale,
      )
      const domDropPoint = {
        x: domRect.right - 1,
        y: domRect.bottom - 1,
      }
      const nativeDrop = createNativeTauriPhysicalPositionFromDomRectPoint(
        domDropPoint,
        devicePixelRatio,
      )

      render(<AnimationTimeline />)
      vi.spyOn(
        screen.getByTestId("animation-timeline"),
        "getBoundingClientRect",
      ).mockReturnValue(domRect)

      await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
      act(() => {
        getRegisteredNativeDropHandler()({
          payload: {
            type: "drop",
            paths: [
              `/tmp/timeline-project/assets/characters/native-zoom-${appZoomScale}.png`,
            ],
            position: nativeDrop.position,
          },
        })
      })

      expect(nativeDrop.toLogical).toHaveBeenCalledWith(devicePixelRatio)
      const logicalDropPoint = nativeDrop.toLogical.mock.results[0]?.value
      expect(
        Math.abs((logicalDropPoint?.x ?? 0) - domDropPoint.x),
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs((logicalDropPoint?.y ?? 0) - domDropPoint.y),
      ).toBeLessThanOrEqual(1)
      const updated =
        useProjectStore.getState().project?.characters[0].animations[0]
      expect(updated?.frames[expectedFrameIndex]?.imagePath).toBe(
        `/tmp/timeline-project/assets/characters/native-zoom-${appZoomScale}.png`,
      )
      expect(useAnimationStore.getState().currentFrameIndex).toBe(
        expectedFrameIndex,
      )
    },
  )

  it("inserts an image dropped on an existing frame after that frame", () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("timeline-frame-0"), {
      dataTransfer: dataTransferFor(
        "/tmp/timeline-project/assets/frames/inserted.png",
      ),
    })

    const updated =
      useProjectStore.getState().project?.characters[0].animations[0]
    expect(updated?.frames.map((frame) => frame.imagePath)).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/inserted.png",
      "/tmp/timeline-project/assets/frames/2.png",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(1)
  })

  it("saves an OS image dropped on an existing frame and inserts it after that frame", async () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })
    const pngBytes = [1, 2, 3, 4]

    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("timeline-frame-0"), {
      dataTransfer: dataTransferForFiles([
        new File([new Uint8Array(pngBytes)], "inserted.png", {
          type: "image/png",
        }),
      ]),
    })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: expect.stringMatching(
          /^\/tmp\/timeline-project\/assets\/characters\/inserted-[\w-]+\.png$/,
        ),
        data: pngBytes,
      })
    })
    expect(refreshTreeMock).toHaveBeenCalledTimes(1)
    const savedPath = getSavedImagePath()

    const updated =
      useProjectStore.getState().project?.characters[0].animations[0]
    expect(updated?.frames.map((frame) => frame.imagePath)).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      savedPath,
      "/tmp/timeline-project/assets/frames/2.png",
    ])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(1)
  })

  it("persists fps, duplicate, paste, and reorder edits to the project", () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
      frameClipboard: {
        ...activeAnimation.frames[0],
        id: "clipboard-frame",
        imagePath: "/tmp/timeline-project/assets/frames/pasted.png",
      },
    })

    render(<AnimationTimeline />)

    fireEvent.change(screen.getByTitle("FPS"), { target: { value: "24" } })
    expect(
      useProjectStore.getState().project?.characters[0].animations[0].fps,
    ).toBe(24)

    fireEvent.click(screen.getByLabelText("Duplicate current frame"))
    expect(
      useProjectStore
        .getState()
        .project?.characters[0].animations[0].frames.map(
          (frame) => frame.imagePath,
        ),
    ).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/2.png",
    ])

    fireEvent.contextMenu(screen.getByAltText("Frame 2"))
    fireEvent.click(screen.getByText("Paste"))
    expect(
      useProjectStore
        .getState()
        .project?.characters[0].animations[0].frames.map(
          (frame) => frame.imagePath,
        ),
    ).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/pasted.png",
      "/tmp/timeline-project/assets/frames/2.png",
    ])

    const dragTransfer = dataTransferForFrameDrag()
    fireEvent.dragStart(screen.getByTestId("timeline-frame-0"), {
      dataTransfer: dragTransfer,
    })
    fireEvent.drop(screen.getByTestId("timeline-frame-3"), {
      dataTransfer: dragTransfer,
    })

    expect(
      useProjectStore
        .getState()
        .project?.characters[0].animations[0].frames.map(
          (frame) => frame.imagePath,
        ),
    ).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/pasted.png",
      "/tmp/timeline-project/assets/frames/2.png",
      "/tmp/timeline-project/assets/frames/1.png",
    ])
  })

  it("reorders blank frames through the direct frame wrapper drop target", () => {
    const activeAnimation = {
      ...animation,
      frameCount: 3,
      frames: [
        {
          ...animation.frames[0],
          id: "image-frame",
          imagePath: "/tmp/timeline-project/assets/frames/first.png",
          description: "image frame",
        },
        {
          ...animation.frames[1],
          id: "blank-frame",
          imagePath: "",
          description: "blank frame",
        },
        {
          ...animation.frames[0],
          id: "last-frame",
          index: 2,
          imagePath: "/tmp/timeline-project/assets/frames/last.png",
          description: "last frame",
        },
      ],
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })

    render(<AnimationTimeline />)
    const dragTransfer = dataTransferForFrameDrag()
    fireEvent.dragStart(screen.getByLabelText("Frame 2 timeline item"), {
      dataTransfer: dragTransfer,
    })
    fireEvent.drop(screen.getByLabelText("Frame 1 timeline item"), {
      dataTransfer: dragTransfer,
    })

    const updated =
      useProjectStore.getState().project?.characters[0].animations[0]
    expect(updated?.frames.map((frame) => frame.id)).toEqual([
      "blank-frame",
      "image-frame",
      "last-frame",
    ])
    expect(updated?.frames.map((frame) => frame.index)).toEqual([0, 1, 2])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(0)
  })

  it("deletes the last frame by removing the persisted animation after confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    const singleFrameAnimation = {
      ...animation,
      frameCount: 1,
      frames: [
        {
          ...animation.frames[0],
          imagePath: "/tmp/timeline-project/assets/frames/only.png",
        },
      ],
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [singleFrameAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [singleFrameAnimation],
      activeAnimationId: singleFrameAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.contextMenu(screen.getByAltText("Frame 1"))
    fireEvent.click(screen.getByText("Delete"))

    expect(confirm).toHaveBeenCalledWith(
      "This is the last frame. Deleting it will remove the animation. Continue?",
    )
    expect(useProjectStore.getState().project?.characters[0].animations).toEqual(
      [],
    )
    expect(useAnimationStore.getState().activeAnimationId).toBeNull()
  })

  it("keeps the last frame when animation deletion is cancelled", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const singleFrameAnimation = {
      ...animation,
      frameCount: 1,
      frames: [
        {
          ...animation.frames[0],
          imagePath: "/tmp/timeline-project/assets/frames/only.png",
        },
      ],
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [singleFrameAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [singleFrameAnimation],
      activeAnimationId: singleFrameAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.contextMenu(screen.getByAltText("Frame 1"))
    fireEvent.click(screen.getByText("Delete"))

    expect(confirm).toHaveBeenCalledWith(
      "This is the last frame. Deleting it will remove the animation. Continue?",
    )
    expect(useProjectStore.getState().project?.characters[0].animations).toEqual(
      [singleFrameAnimation],
    )
    expect(useAnimationStore.getState().animations).toEqual([
      singleFrameAnimation,
    ])
    expect(useAnimationStore.getState().activeAnimationId).toBe(
      singleFrameAnimation.id,
    )
  })

  it("advances frames while looping playback is active", () => {
    vi.useFakeTimers()
    useAnimationStore.setState({
      animations: [{ ...animation, fps: 10, loop: true }],
      activeAnimationId: animation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.click(screen.getByTitle("Play"))

    act(() => vi.advanceTimersByTime(100))
    expect(useAnimationStore.getState().currentFrameIndex).toBe(1)
    act(() => vi.advanceTimersByTime(100))
    expect(useAnimationStore.getState().currentFrameIndex).toBe(0)
    expect(useAnimationStore.getState().isPlaying).toBe(true)
  })

  it("stops non-looping playback at the last frame", () => {
    vi.useFakeTimers()
    useAnimationStore.setState({
      animations: [{ ...animation, fps: 10, loop: false }],
      activeAnimationId: animation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.click(screen.getByTitle("Play"))

    act(() => vi.advanceTimersByTime(200))
    expect(useAnimationStore.getState().currentFrameIndex).toBe(1)
    expect(useAnimationStore.getState().isPlaying).toBe(false)
  })

  it("applies high playback speed without a 60fps interval cap", () => {
    vi.useFakeTimers()
    useAnimationStore.setState({
      animations: [
        {
          ...animation,
          fps: 60,
          loop: true,
          frameCount: 5,
          frames: Array.from({ length: 5 }, (_, index) => ({
            ...animation.frames[0],
            id: `fast-frame-${index}`,
            index,
            description: `fast frame ${index + 1}`,
          })),
        },
      ],
      activeAnimationId: animation.id,
      playbackSpeed: 3,
    })

    render(<AnimationTimeline />)
    fireEvent.click(screen.getByTitle("Play"))

    act(() => vi.advanceTimersByTime(19))
    expect(useAnimationStore.getState().currentFrameIndex).toBe(3)
  })

  it("rejects non-image drops without changing timeline frames", () => {
    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("animation-timeline-empty"), {
      dataTransfer: dataTransferFor("/tmp/timeline-project/assets/readme.md"),
    })

    expect(showToastMock).toHaveBeenCalledWith(
      "warning",
      "Only image files can be added to the timeline",
    )
    expect(useAnimationStore.getState().animations).toEqual([])
  })

  it("rejects non-image OS drops without saving or changing timeline frames", async () => {
    render(<AnimationTimeline />)
    fireEvent.drop(screen.getByTestId("animation-timeline-empty"), {
      dataTransfer: dataTransferForFiles([
        new File(["notes"], "readme.md", { type: "text/markdown" }),
      ]),
    })

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        "warning",
        "Only image files can be added to the timeline",
      )
    })
    expect(invokeMock).not.toHaveBeenCalled()
    expect(refreshTreeMock).not.toHaveBeenCalled()
    expect(useAnimationStore.getState().animations).toEqual([])
  })

  it("warns and ignores native Tauri non-image path drops", async () => {
    render(<AnimationTimeline />)
    setTimelineHitArea(screen.getByTestId("animation-timeline-empty"))

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
    act(() => {
      getRegisteredNativeDropHandler()({
        payload: {
          type: "drop",
          paths: ["/tmp/timeline-project/assets/readme.md"],
          position: { x: 24, y: 24 },
        },
      })
    })

    expect(showToastMock).toHaveBeenCalledWith(
      "warning",
      "Only image files can be added to the timeline",
    )
    expect(invokeMock).not.toHaveBeenCalled()
    expect(refreshTreeMock).not.toHaveBeenCalled()
    expect(useAnimationStore.getState().animations).toEqual([])
  })

  it("ignores native Tauri drops with empty paths", async () => {
    render(<AnimationTimeline />)
    setTimelineHitArea(screen.getByTestId("animation-timeline-empty"))

    await waitFor(() => expect(onDragDropEventMock).toHaveBeenCalledTimes(1))
    act(() => {
      getRegisteredNativeDropHandler()({
        payload: {
          type: "drop",
          paths: [],
          position: { x: 24, y: 24 },
        },
      })
    })

    expect(showToastMock).not.toHaveBeenCalled()
    expect(invokeMock).not.toHaveBeenCalled()
    expect(refreshTreeMock).not.toHaveBeenCalled()
    expect(useAnimationStore.getState().animations).toEqual([])
  })

  it("treats OS file drops on the timeline strip as imports even when reorder state is stale", async () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })
    const dragTransfer = dataTransferForFrameDrag()

    render(<AnimationTimeline />)
    fireEvent.dragStart(screen.getByTestId("timeline-frame-0"), {
      dataTransfer: dragTransfer,
    })
    fireEvent.drop(screen.getByTestId("animation-timeline-strip"), {
      dataTransfer: dataTransferForFiles([
        new File([new Uint8Array([9, 8, 7])], "later.png", {
          type: "image/png",
        }),
      ]),
    })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: expect.stringMatching(
          /^\/tmp\/timeline-project\/assets\/characters\/later-[\w-]+\.png$/,
        ),
        data: [9, 8, 7],
      })
    })
    const savedPath = getSavedImagePath()
    expect(
      useProjectStore
        .getState()
        .project?.characters[0].animations[0].frames.map(
          (frame) => frame.imagePath,
        ),
    ).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/2.png",
      savedPath,
    ])
  })

  it("treats OS file drops on a frame as imports even when reorder state is stale", async () => {
    const activeAnimation = {
      ...animation,
      frames: animation.frames.map((frame, index) => ({
        ...frame,
        imagePath: `/tmp/timeline-project/assets/frames/${index + 1}.png`,
      })),
    }
    useProjectStore.setState({
      project: {
        ...project,
        characters: [
          { ...project.characters[0], animations: [activeAnimation] },
        ],
      },
      projectPath: "/tmp/timeline-project",
      isLoaded: true,
    })
    useAnimationStore.setState({
      animations: [activeAnimation],
      activeAnimationId: activeAnimation.id,
    })

    render(<AnimationTimeline />)
    fireEvent.dragStart(screen.getByTestId("timeline-frame-0"), {
      dataTransfer: dataTransferForFrameDrag(),
    })
    fireEvent.drop(screen.getByTestId("timeline-frame-1"), {
      dataTransfer: dataTransferForFiles([
        new File([new Uint8Array([5, 6, 7])], "stale.png", {
          type: "image/png",
        }),
      ]),
    })

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
        projectPath: expect.any(String),
        path: expect.stringMatching(
          /^\/tmp\/timeline-project\/assets\/characters\/stale-[\w-]+\.png$/,
        ),
        data: [5, 6, 7],
      })
    })
    const savedPath = getSavedImagePath()
    expect(
      useProjectStore
        .getState()
        .project?.characters[0].animations[0].frames.map(
          (frame) => frame.imagePath,
        ),
    ).toEqual([
      "/tmp/timeline-project/assets/frames/1.png",
      "/tmp/timeline-project/assets/frames/2.png",
      savedPath,
    ])
  })
})
