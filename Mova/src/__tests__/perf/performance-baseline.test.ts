/// <reference types="node" />

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createElement } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { KonvaEventObject } from "konva/lib/Node"
import { AnimationTimeline } from "../../components/canvas/animation-timeline"
import { CanvasArea } from "../../components/canvas/canvas-area"
import { act } from "react"
import { useSettingsStore } from "../../stores/settings-store"
import {
  pointerPositionRef,
  stageHandlerRef,
  createKonvaMouseEvent,
  createKonvaWheelEvent,
  setupKonvaTestEnvironment,
  resetKonvaMocks,
} from "../helpers/konva-mock"
import { FileTree } from "../../components/file-tree/FileTree"
import { useAnimationStore } from "../../stores/animation-store"
import { useChatStore } from "../../stores/chat-store"
import { useFileTreeStore } from "../../stores/file-tree-store"
import { useGitStore } from "../../stores/git-store"
import { useProjectStore } from "../../stores/project-store"
import { mapRustProject, serializeProjectForRust } from "../../types/project"
import { countFileTreeNodes, filterFileTreeNodes } from "../../utils/file-tree-helpers"
import type { PerformanceReport } from "../../utils/performance"
import {
  createPerformanceRecorder,
  performanceReportToMarkdown,
} from "../../utils/performance"
import { createQaPerformanceBaselineReport } from "../../utils/qa-report"
import {
  createAnimationFixture,
  createCharacterFixture,
  createChatMessageFixture,
  createFileTreeFixture,
  createProjectFixture,
  createRustProjectFixture,
} from "./perf-fixtures"

const { invokeMock, listenMock, showToastMock, webviewUnlistenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(async () => () => {}),
  showToastMock: vi.fn(),
  webviewUnlistenMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}))

vi.mock("../../hooks/use-toast", () => ({
  useToast: () => ({ showToast: showToastMock }),
}))

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(webviewUnlistenMock)),
  })),
}))

vi.mock("konva", async () => {
  const { MockLine, MockRect, MockEllipse } = await import("../helpers/konva-mock")
  return {
    default: { Line: MockLine, Rect: MockRect, Ellipse: MockEllipse },
  }
})

vi.mock("react-konva", async () => {
  const React = await vi.importActual<typeof import("react")>("react")
  const {
    drawingLayerMock,
    relativePointerRef,
    pointerPositionRef: pp,
    stageHandlerRef: sh,
  } = await import("../helpers/konva-mock")
  return {
    Stage: React.forwardRef(
      (
        {
          children,
          onMouseDown,
          onMouseMove,
          onMouseUp,
          onWheel,
          onMouseLeave,
        }: {
          children?: React.ReactNode
          onMouseDown?: (event: KonvaEventObject<MouseEvent>) => void
          onMouseMove?: (event: KonvaEventObject<MouseEvent>) => void
          onMouseUp?: (event: KonvaEventObject<MouseEvent>) => void
          onWheel?: (event: KonvaEventObject<WheelEvent>) => void
          onMouseLeave?: (event: KonvaEventObject<MouseEvent>) => void
        },
        ref: React.ForwardedRef<unknown>,
      ) => {
        sh.current = {
          onMouseDown,
          onMouseMove,
          onMouseUp,
          onWheel,
          onMouseLeave,
        } as typeof sh.current
        React.useImperativeHandle(ref, () => ({
          findOne: () => drawingLayerMock,
          getRelativePointerPosition: () => relativePointerRef.current,
          getPointerPosition: () => pp.current,
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

vi.mock("../../../src/components/canvas/drawing-toolbar", () => ({
  DrawingToolbar: ({
    onToolChange,
  }: {
    onToolChange: (tool: "brush" | "ellipse") => void
  }) =>
    createElement(
      "div",
      { "data-testid": "drawing-toolbar" },
      createElement("button", { type: "button", onClick: () => onToolChange("brush") }, "Brush"),
      createElement("button", { type: "button", onClick: () => onToolChange("ellipse") }, "Ellipse"),
    ),
}))

vi.mock("../../../src/components/canvas/grid-overlay", () => ({
  GridOverlay: ({
    visible,
    gridSize,
  }: {
    visible: boolean
    gridSize: number
  }) =>
    createElement("div", {
      "data-testid": "grid-overlay",
      "data-visible": String(visible),
      "data-grid-size": gridSize,
    }),
}))

vi.mock("../../../src/components/canvas/document-preview", () => ({
  DocumentPreview: () => createElement("div", { "data-testid": "document-preview" }),
}))

const recorder = createPerformanceRecorder()
const budgetsMs: Record<string, number> = {
  "animation.frames.large.set-and-mutate": 3000,
  "animation.frames.large.append-insert-delete-burst": 1000,
  "animation.frames.large.reorder-burst": 1000,
  "animation.frames.large.current-frame-scrub": 500,
  "animation.frames.large.create-from-image-paths": 1000,
  "chat.streaming-draft.large.update-message": 1500,
  "file-tree.large.filter-and-count": 1000,
  "file-tree.mounted.large.initial-render": 2000,
  "file-tree.mounted.large.expand-top-level": 2000,
  "file-tree.mounted.large.search-filter": 2000,
  "project.large.map-rust-project": 1500,
  "project.large.serialize-for-rust": 1500,
  "project.store.medium.load-and-update": 1000,
  "canvas.mounted.large.initial-render": 2000,
  "canvas.mounted.large.pan-sequence": 1500,
  "canvas.mounted.large.zoom-sequence": 1000,
  "timeline.mounted.large.initial-render": 3000,
  "timeline.mounted.large.playback-advance": 2000,
  // Budget raised from 1500ms to 2500ms: 50 fireEvent.click ops on a
  // 256-frame timeline trigger React re-render per click in jsdom.
  // Under full-suite resource contention this can reach ~2272ms; 2500ms
  // provides ~10% headroom while still catching real regressions.
  "timeline.mounted.large.frame-click-scrub": 2500,
}

function expectSamplesWithinBudget(name: string) {
  const samples = recorder.getSamples().filter((item) => item.name === name)
  expect(samples.length, `missing performance sample ${name}`).toBeGreaterThan(0)
  for (const sample of samples) {
    expect(sample.durationMs).toBeLessThanOrEqual(budgetsMs[name] ?? 2000)
  }
}

function resetStores() {
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
  useProjectStore.setState({
    project: null,
    projectPath: null,
    isLoaded: false,
  })
  useChatStore.setState({
    activeProjectId: null,
    conversations: [],
    activeConversationId: null,
    isLoading: false,
    projectConversations: {},
  })
  useFileTreeStore.setState({
    tree: [],
    currentPath: null,
    expandedPaths: new Set(),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })
  useGitStore.setState({
    isRepo: false,
    branch: "",
    files: [],
    log: [],
    isLoading: false,
    error: null,
  })
  localStorage.clear()
  invokeMock.mockReset()
  listenMock.mockClear()
  showToastMock.mockClear()
}

async function recordAsync(
  name: string,
  fn: () => Promise<void>,
  metadata?: Record<string, string | number | boolean | null>,
) {
  const startMark = `${name}-start-${metadata?.iteration ?? "sample"}`
  recorder.mark(startMark)
  await fn()
  recorder.measure(name, startMark, undefined, metadata)
}

function seedMountedFileTree() {
  const tree = createFileTreeFixture("large")
  useFileTreeStore.setState({
    tree,
    currentPath: "/tmp/mova-perf",
    expandedPaths: new Set(),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })
  useGitStore.setState({
    isRepo: true,
    branch: "main",
    files: [],
    log: [],
    isLoading: false,
    error: null,
  })
  return tree
}

function seedCanvasAreaForPerf() {
  const largeProject = createProjectFixture("large")
  const activeCharacter = largeProject.characters[0]!
  const activeAnimation = activeCharacter.animations[0]!

  useProjectStore.setState({
    project: largeProject,
    projectPath: "/tmp/mova-perf",
    isLoaded: true,
  })
  useAnimationStore.setState({
    animations: [activeAnimation],
    activeAnimationId: activeAnimation.id,
    currentFrameIndex: 0,
    isPlaying: false,
    playbackSpeed: 1,
    onionSkinEnabled: false,
    onionSkinOpacity: 0.3,
    frameClipboard: null,
  })
  useFileTreeStore.setState({
    tree: [],
    currentPath: "/tmp/mova-perf",
    expandedPaths: new Set(),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
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
  useGitStore.setState({
    isRepo: false,
    branch: "",
    files: [],
    log: [],
    isLoading: false,
    error: null,
  })

  // Ensure requestAnimationFrame calls fire synchronously for pan/zoom interaction timing
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(0)
    return 1
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn())
}

function seedTimelineForPerf() {
  const largeAnimation = createAnimationFixture("large")
  const smallProject = createProjectFixture("small")
  // Use a valid project with the large animation on the first character
  smallProject.characters[0] = {
    ...smallProject.characters[0]!,
    animations: [largeAnimation],
  }
  smallProject.activeCharacterId = smallProject.characters[0].id

  useProjectStore.setState({
    project: smallProject,
    projectPath: "/tmp/mova-perf",
    isLoaded: true,
  })
  useAnimationStore.setState({
    animations: [largeAnimation],
    activeAnimationId: largeAnimation.id,
    currentFrameIndex: 0,
    isPlaying: false,
    playbackSpeed: 1,
    onionSkinEnabled: false,
    onionSkinOpacity: 0.3,
    frameClipboard: null,
  })
  useFileTreeStore.setState({
    tree: [],
    currentPath: null,
    expandedPaths: new Set(),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })
  useGitStore.setState({
    isRepo: false,
    branch: "",
    files: [],
    log: [],
    isLoading: false,
    error: null,
  })
}

function readPackageVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      version?: unknown
    }
    return typeof packageJson.version === "string" ? packageJson.version : "unknown"
  } catch {
    return "unknown"
  }
}

function writeBaselineReport() {
  if (process.env.MOVA_WRITE_PERF_BASELINE !== "1") return

  const report = recorder.createReport({
    title: "Mova Stage 1 performance baseline smoke report",
    environment: `vitest-jsdom node=${process.version}`,
    budgets: budgetsMs,
  })
  const reportDir = resolve(process.cwd(), "reports")
  mkdirSync(reportDir, { recursive: true })
  writeFileSync(
    resolve(reportDir, "performance-baseline-stage1.json"),
    JSON.stringify(report, null, 2),
  )
  writeFileSync(
    resolve(reportDir, "performance-baseline-stage1.md"),
    performanceReportToMarkdown(report),
  )
  writeFileSync(
    resolve(reportDir, "qa-performance-baseline-stage1.json"),
    JSON.stringify(
      createQaPerformanceBaselineReport(report, {
        appVersion: readPackageVersion(),
        os: process.platform,
        node: process.version,
        ci: process.env.CI === "true",
      }),
      null,
      2,
    ),
  )
}

const samplePerformanceReport: PerformanceReport = {
  title: "Mova Stage 1 performance baseline smoke report",
  generatedAt: "2026-06-15T00:00:00.000Z",
  environment: "vitest-jsdom node=v24.0.0",
  summaries: [
    {
      name: "project.large.map-rust-project",
      count: 3,
      minMs: 12,
      maxMs: 42,
      meanMs: 24,
      p50Ms: 18,
      p95Ms: 42,
      totalMs: 72,
    },
  ],
  samples: [],
  budgets: {
    "project.large.map-rust-project": 1500,
  },
}

describe("QA performance baseline report", () => {
  it("builds a public-safe mock/offline v0 report with relative artifacts", () => {
    const report = createQaPerformanceBaselineReport(samplePerformanceReport, {
      appVersion: "0.1.1",
      os: "linux",
      node: "v24.0.0",
      ci: false,
    })

    expect(report.schemaVersion).toBe("mova.qa-report.v0")
    expect(report.executionLane).toBe("mock-offline")
    expect(report.privacy).toMatchObject({
      marker: "public-safe",
      containsPrivateAssets: false,
      containsSecrets: false,
      dataPolicy: "synthetic-only",
    })
    expect(report.redactionCheck).toMatchObject({
      status: "passed",
      checks: expect.arrayContaining([
        "no-secrets",
        "no-prompts",
        "no-raw-provider-payloads",
        "no-provider-urls",
        "no-private-asset-contents",
        "artifact-paths-are-relative",
      ]),
    })
    expect(report.providerMetadata).toEqual([
      {
        providerRef: "mock-runtime",
        lane: "mock-offline",
        providerKind: "mock",
        requestCount: 0,
        mockFixtureId: "perf-fixtures",
      },
    ])
    expect(report.artifactPolicy.defaultRetention.policy).toBe("keep-local")
    expect(report.artifactPolicy.defaultCleanupOwner).toBe("developer")
    expect(report.artifacts.map((artifact) => artifact.path)).toEqual([
      "reports/performance-baseline-stage1.json",
      "reports/performance-baseline-stage1.md",
      "reports/qa-performance-baseline-stage1.json",
    ])
    for (const artifact of report.artifacts) {
      expect(artifact.path).not.toMatch(/^(\/|[a-z]+:\/\/|[a-zA-Z]:[\\/])|\.\.\//)
      expect(artifact.privacyClassification).toBe("public-safe")
      expect(artifact.cleanup.owner).toBe("developer")
    }
    expect(report.suites[0]?.cases[0]?.metrics).toContainEqual({
      name: "project.large.map-rust-project.p95Ms",
      value: 42,
      unit: "ms",
      budget: 1500,
      status: "pass",
    })
  })

  it("rejects absolute artifact paths before marking redaction passed", () => {
    expect(() =>
      createQaPerformanceBaselineReport(samplePerformanceReport, {
        appVersion: "0.1.1",
        os: "linux",
        node: "v24.0.0",
        artifactPaths: {
          performanceJson: "/tmp/performance-baseline-stage1.json",
        },
      }),
    ).toThrow("artifact path must be relative")
  })
})

describe("Mova Stage 1 performance baseline smoke", () => {
  beforeEach(() => {
    recorder.reset()
    resetStores()
    resetKonvaMocks()
  })

  beforeAll(() => {
    setupKonvaTestEnvironment()
  })

  afterAll(() => {
    writeBaselineReport()
  })

  it("records store/helper and mounted file-tree baseline metrics without external AI or Tauri I/O", { timeout: 30000 }, async () => {
    for (let iteration = 0; iteration < 3; iteration += 1) {
      resetStores()
      recorder.timeSync(
        "project.large.map-rust-project",
        () => {
          const project = mapRustProject(createRustProjectFixture("large"))
          expect(project.characters).toHaveLength(64)
          expect(project.characters[0]?.animations[0]?.frames).toHaveLength(256)
        },
        { iteration },
      )

      const largeProject = createProjectFixture("large")
      recorder.timeSync(
        "project.large.serialize-for-rust",
        () => {
          const rustProject = serializeProjectForRust(largeProject)
          expect(rustProject.characters).toHaveLength(64)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "project.store.medium.load-and-update",
        () => {
          const mediumProject = createProjectFixture("medium")
          useProjectStore.getState().loadProject(mediumProject, "/tmp/mova-perf")
          useProjectStore.setState({ projectPath: null })
          const character = createCharacterFixture(999, "small")
          useProjectStore.getState().addCharacter(character)
          useProjectStore
            .getState()
            .updateCharacter(character.id, { description: "updated fixture" })
          useProjectStore.getState().updateCharacterTags(character.id, ["updated"])
          expect(useProjectStore.getState().project?.characters.length).toBe(17)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "animation.frames.large.set-and-mutate",
        () => {
          const animation = createAnimationFixture("large")
          useAnimationStore.setState({ activeAnimationId: animation.id })
          useAnimationStore.getState().setAnimations([animation])
          const store = useAnimationStore.getState()
          store.reorderFrames(animation.id, 0, 255)
          store.updateFrame(animation.id, `${animation.id}-12`, {
            description: "updated frame",
          })
          store.duplicateFrame(animation.id, 10)
          const copiedFrame = useAnimationStore.getState().animations[0]?.frames[5]
          expect(copiedFrame).toBeDefined()
          if (copiedFrame) store.copyFrame(copiedFrame)
          store.pasteFrame(animation.id, 12)
          const nextAnimation = useAnimationStore.getState().animations[0]
          expect(nextAnimation?.frameCount).toBe(258)
          expect(nextAnimation?.frames[257]?.index).toBe(257)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "chat.streaming-draft.large.update-message",
        () => {
          useChatStore.getState().loadProjectConversations("perf-project")
          const conversationId = useChatStore.getState().createConversation()
          for (let index = 0; index < 80; index += 1) {
            useChatStore
              .getState()
              .addMessage(createChatMessageFixture(index, index % 2 === 0 ? "user" : "assistant"))
          }
          const assistantMessageId = "streaming-assistant"
          useChatStore.getState().addMessage({
            ...createChatMessageFixture(1000, "assistant"),
            id: assistantMessageId,
            content: "",
          })
          for (let index = 0; index < 120; index += 1) {
            useChatStore.getState().updateMessage(assistantMessageId, {
              content: `draft chunk ${index} `.repeat(12),
            })
          }
          const activeConversation = useChatStore
            .getState()
            .conversations.find((conversation) => conversation.id === conversationId)
          expect(activeConversation?.messages).toHaveLength(81)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "file-tree.large.filter-and-count",
        () => {
          const tree = createFileTreeFixture("large")
          const totalNodes = countFileTreeNodes(tree)
          const filteredPng = filterFileTreeNodes(tree, ".png")
          const filteredAsset = filterFileTreeNodes(tree, "asset-1")
          expect(totalNodes).toBe(1640)
          expect(countFileTreeNodes(filteredPng)).toBeGreaterThan(500)
          expect(countFileTreeNodes(filteredAsset)).toBeGreaterThan(40)
        },
        { iteration },
      )

      resetStores()
      const mountedTree = seedMountedFileTree()
      let mountedFileTree: ReturnType<typeof render> | null = null
      try {
        recorder.mark(`file-tree-mounted-initial-${iteration}`)
        mountedFileTree = render(createElement(FileTree))
        expect(screen.getByRole("button", { name: "group-0" })).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "group-39" })).toBeInTheDocument()
        recorder.measure(
          "file-tree.mounted.large.initial-render",
          `file-tree-mounted-initial-${iteration}`,
          undefined,
          { iteration, topLevelNodes: mountedTree.length },
        )

        await recordAsync(
          "file-tree.mounted.large.expand-top-level",
          async () => {
            fireEvent.click(screen.getByRole("button", { name: "group-0" }))
            await waitFor(() => {
              expect(screen.getByText("asset-0-0.png")).toBeInTheDocument()
            })
          },
          { iteration, childNodes: mountedTree[0]?.children?.length ?? 0 },
        )

        await recordAsync(
          "file-tree.mounted.large.search-filter",
          async () => {
            fireEvent.change(screen.getByPlaceholderText("Search assets..."), {
              target: { value: ".png" },
            })
            await waitFor(() => {
              expect(useFileTreeStore.getState().searchQuery).toBe(".png")
              expect(screen.getByText("asset-0-0.png")).toBeInTheDocument()
              expect(screen.queryByText("asset-0-1.json")).not.toBeInTheDocument()
            })
          },
          { iteration, query: ".png" },
        )
        expect(
          invokeMock.mock.calls.some(([command]) =>
            ["list_project_files", "watch_project_dir", "unwatch_project_dir"].includes(
              String(command),
            ),
          ),
        ).toBe(false)
        expect(listenMock).not.toHaveBeenCalled()
      } finally {
        mountedFileTree?.unmount()
      }

      // Stage 2: Canvas/Timeline store operation smoke
      resetStores()
      recorder.timeSync(
        "animation.frames.large.append-insert-delete-burst",
        () => {
          const animation = createAnimationFixture("large")
          useAnimationStore.setState({ activeAnimationId: animation.id })
          useAnimationStore.getState().setAnimations([animation])

          // Batch append 50 paths
          const store = useAnimationStore.getState()
          const appended = store.appendFrameFromImagePaths(
            animation.id,
            Array.from({ length: 50 }, (_, i) => `/tmp/batch-append-${i}.png`),
          )
          expect(appended?.frameCount).toBe(306)

          // Batch insert 50 near the middle
          const middle = Math.floor(appended!.frames.length / 2)
          const inserted = store.insertFrameFromImagePaths(
            animation.id,
            middle,
            Array.from({ length: 50 }, (_, i) => `/tmp/batch-insert-${i}.png`),
          )
          expect(inserted?.frameCount).toBe(356)

          // Delete 50 frames from the end
          let lastAnim = inserted!
          for (let i = 0; i < 50; i++) {
            const next = useAnimationStore
              .getState()
              .deleteFrame(lastAnim.id, lastAnim.frames.length - 1)
            if (next) lastAnim = next
          }
          expect(lastAnim.frameCount).toBe(306)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "animation.frames.large.reorder-burst",
        () => {
          const animation = createAnimationFixture("large")
          useAnimationStore.setState({ activeAnimationId: animation.id })
          useAnimationStore.getState().setAnimations([animation])

          const store = useAnimationStore.getState()
          // 200 drag-style reorders
          for (let i = 0; i < 200; i++) {
            const from = i % store.animations[0]!.frames.length
            const to = (from + 3) % store.animations[0]!.frames.length
            store.reorderFrames(animation.id, from, to)
          }
          const state = useAnimationStore.getState()
          expect(state.animations[0]?.frameCount).toBe(256)
          expect(state.animations[0]?.frames[0]?.index).toBe(0)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "animation.frames.large.current-frame-scrub",
        () => {
          const animation = createAnimationFixture("large")
          useAnimationStore.setState({ activeAnimationId: animation.id })
          useAnimationStore.getState().setAnimations([animation])

          const store = useAnimationStore.getState()
          // 5000 setCurrentFrame calls
          for (let i = 0; i < 5000; i++) {
            store.setCurrentFrame(i)
          }
          // Should be clamped to last frame index
          expect(useAnimationStore.getState().currentFrameIndex).toBe(255)
        },
        { iteration },
      )

      resetStores()
      recorder.timeSync(
        "animation.frames.large.create-from-image-paths",
        () => {
          const paths = Array.from(
            { length: 256 },
            (_, i) => `/tmp/mova-perf/assets/frames/import-${i}.png`,
          )
          const store = useAnimationStore.getState()
          const created = store.createAnimationFromImagePaths(paths, {
            name: "Bulk Import",
            fps: 24,
          })
          expect(created).toBeDefined()
          expect(created?.frameCount).toBe(256)
          expect(created?.fps).toBe(24)
          expect(useAnimationStore.getState().activeAnimationId).toBe(created?.id)
        },
        { iteration },
      )

      // Stage 3: CanvasArea mounted interaction timing smoke
      resetStores()
      setupKonvaTestEnvironment()
      seedCanvasAreaForPerf()

      let canvasArea: ReturnType<typeof render> | null = null
      try {
        recorder.mark(`canvas-mounted-initial-${iteration}`)
        canvasArea = render(createElement(CanvasArea))
        // Verify the stage rendered (confirms active animation mode is mounted)
        expect(screen.getByTestId("stage")).toBeInTheDocument()
        recorder.measure(
          "canvas.mounted.large.initial-render",
          `canvas-mounted-initial-${iteration}`,
          undefined,
          { iteration },
        )

        // Pan sequence: 50 ctrl-drag operations simulating pan gestures
        recorder.mark(`canvas-pan-start-${iteration}`)
        const startX = 400
        const startY = 300
        for (let panIndex = 0; panIndex < 50; panIndex += 1) {
          const dx = (panIndex % 10) * 2 - 10
          const dy = (panIndex % 7) * 2 - 6

          // Start pan with middle button
          stageHandlerRef.current.onMouseDown?.(
            createKonvaMouseEvent("mousedown", {
              button: 1,
              clientX: startX + panIndex,
              clientY: startY + panIndex,
            }) as ReturnType<typeof createKonvaMouseEvent>,
          )
          // Simulate 3 move events for drag
          for (let moveIndex = 0; moveIndex < 3; moveIndex += 1) {
            stageHandlerRef.current.onMouseMove?.(
              createKonvaMouseEvent("mousemove", {
                clientX: startX + panIndex + dx * (moveIndex + 1),
                clientY: startY + panIndex + dy * (moveIndex + 1),
              }) as ReturnType<typeof createKonvaMouseEvent>,
            )
          }
          stageHandlerRef.current.onMouseUp?.(
            createKonvaMouseEvent("mouseup", {
              clientX: startX + panIndex + dx * 3,
              clientY: startY + panIndex + dy * 3,
            }) as ReturnType<typeof createKonvaMouseEvent>,
          )
        }
        recorder.measure(
          "canvas.mounted.large.pan-sequence",
          `canvas-pan-start-${iteration}`,
          undefined,
          { iteration, pans: 50, movesPerPan: 3 },
        )

        // Zoom sequence: 20 wheel events alternating zoom-in/zoom-out
        recorder.mark(`canvas-zoom-start-${iteration}`)
        pointerPositionRef.current = { x: 400, y: 300 }
        for (let zoomIndex = 0; zoomIndex < 20; zoomIndex += 1) {
          const direction = zoomIndex % 2 === 0 ? 1 : -1
          const deltaY = direction * 120
          stageHandlerRef.current.onWheel?.(
            createKonvaWheelEvent(deltaY),
          )
        }
        recorder.measure(
          "canvas.mounted.large.zoom-sequence",
          `canvas-zoom-start-${iteration}`,
          undefined,
          { iteration, zooms: 20 },
        )

        // Verify no Tauri I/O leaked through CanvasArea
        expect(
          invokeMock.mock.calls.some(([command]) =>
            ["list_project_files", "watch_project_dir", "unwatch_project_dir", "save_image_bytes"].includes(
              String(command),
            ),
          ),
        ).toBe(false)
        expect(listenMock).not.toHaveBeenCalled()
      } finally {
        canvasArea?.unmount()
      }

      // Stage 4: AnimationTimeline mounted interaction timing smoke
      resetStores()
      seedTimelineForPerf()

      let timeline: ReturnType<typeof render> | null = null
      try {
        // 4.1 Initial render: mount large (256-frame) AnimationTimeline
        recorder.mark(`timeline-mounted-initial-${iteration}`)
        timeline = render(createElement(AnimationTimeline))
        expect(screen.getByTestId("animation-timeline")).toBeInTheDocument()
        // Sample-check first, middle, and last frame buttons
        expect(screen.getByTestId("timeline-frame-0")).toBeInTheDocument()
        expect(screen.getByTestId("timeline-frame-127")).toBeInTheDocument()
        expect(screen.getByTestId("timeline-frame-255")).toBeInTheDocument()
        recorder.measure(
          "timeline.mounted.large.initial-render",
          `timeline-mounted-initial-${iteration}`,
          undefined,
          { iteration, frameCount: 256 },
        )

        // 4.2 Playback advance: fake-timer tick loop simulating ~10 s @ 12 fps
        vi.useFakeTimers({ toFake: ["setTimeout", "setInterval", "clearTimeout", "clearInterval", "Date"] })
        // Trigger the playback effect inside act so React flushes the state change + effect
        act(() => {
          useAnimationStore.setState({ isPlaying: true, currentFrameIndex: 0 })
        })
        recorder.mark(`timeline-playback-start-${iteration}`)

        act(() => {
          for (let tick = 0; tick < 120; tick += 1) {
            vi.advanceTimersByTime(100)
          }
        })

        const playbackFinalFrame = useAnimationStore.getState().currentFrameIndex
        expect(playbackFinalFrame).toBeGreaterThan(0)
        expect(playbackFinalFrame).toBeLessThan(256)
        recorder.measure(
          "timeline.mounted.large.playback-advance",
          `timeline-playback-start-${iteration}`,
          undefined,
          { iteration, ticks: 120, finalFrame: playbackFinalFrame },
        )
        vi.useRealTimers()

        // 4.3 Frame click scrub: 50 non-consecutive frame clicks
        act(() => {
          useAnimationStore.setState({ isPlaying: false, currentFrameIndex: 0 })
        })
        recorder.mark(`timeline-scrub-start-${iteration}`)

        for (let i = 0; i < 50; i += 1) {
          const frameIndex = (i * 5 + 3) % 256
          fireEvent.click(screen.getByTestId(`timeline-frame-${frameIndex}`))
        }

        expect(useAnimationStore.getState().currentFrameIndex).toBe((49 * 5 + 3) % 256)
        recorder.measure(
          "timeline.mounted.large.frame-click-scrub",
          `timeline-scrub-start-${iteration}`,
          undefined,
          { iteration, clicks: 50 },
        )

        // Verify no Tauri I/O leaked through AnimationTimeline
        expect(
          invokeMock.mock.calls.some(([command]) =>
            ["list_project_files", "watch_project_dir", "unwatch_project_dir", "save_image_bytes", "read_image_file"].includes(
              String(command),
            ),
          ),
        ).toBe(false)
        expect(listenMock).not.toHaveBeenCalled()
      } finally {
        timeline?.unmount()
      }
    }

    for (const metricName of Object.keys(budgetsMs)) {
      expectSamplesWithinBudget(metricName)
    }
  })
})
