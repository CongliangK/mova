/**
 * image-generation-pipeline.test.ts
 *
 * Closed-loop smoke test: AI tool generates → saves to project assets →
 * project store records animation → animation store normalizes frames →
 * asset-url helpers recognize paths.
 *
 * No real external APIs, no real canvas DOM, no heavy E2E dependencies.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  extractAnimationFramesTool,
  generateSpriteSheetTool,
  processSpriteTool,
} from "../../src/services/ai/tools/sprite-tools"
import { createImageProvider } from "../../src/services/ai/tools/image-provider"
import { IMAGE_PROVIDER_PRESET_BY_ID } from "../../src/services/ai/providers/image-gen/provider-registry"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"
import { useAnimationStore } from "../../src/stores/animation-store"
import { isTimelineImagePath, toDisplayAssetUrl } from "../../src/utils/asset-url"
import type { ImageGenChunk, ImageGenRequest } from "../../src/types/ai"
import type { Project } from "../../src/types/project"

// ── Hoisted mocks ───────────────────────────────────────────────
const { generatedRequests, invokeMock, savedPaths, recordedInvocations } = vi.hoisted(() => ({
  generatedRequests: [] as ImageGenRequest[],
  invokeMock: vi.fn(),
  savedPaths: [] as string[],
  recordedInvocations: [] as Array<{ cmd: string; args: unknown }>,
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock("../../src/services/ai/providers/image-gen", () => ({
  SuchuangProvider: class MockSuchuangProvider {
    async *generate(request: ImageGenRequest): AsyncGenerator<ImageGenChunk> {
      generatedRequests.push(request)
      yield {
        type: "image",
        imageUrl: "mock://provider/generated-sprite.png",
        imageData: new Uint8Array([80, 78, 71, 13, 10, 26, 10]), // PNG magic bytes
      }
      yield { type: "done" }
    }
  },
}))

// ── Shared test data ────────────────────────────────────────────
const projectPath = "/tmp/mova-pipeline-test"

const project: Project = {
  id: "pipeline-proj-1",
  name: "Pipeline Test Project",
  version: 1,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  activeCharacterId: "hero-1",
  settings: {
    defaultFrameWidth: 64,
    defaultFrameHeight: 64,
    defaultFps: 12,
    defaultArtStyle: "pixel-art",
  },
  characters: [
    {
      id: "hero-1",
      name: "Hero",
      description: "The main character for pipeline testing",
      style: {
        artStyle: "pixel-art",
        colorPalette: [],
        frameSize: { width: 64, height: 64 },
        referenceDescription: "",
      },
      baseImagePath: null,
      animations: [],
      tags: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      id: "npc-2",
      name: "NPC",
      description: "A secondary character",
      style: {
        artStyle: "pixel-art",
        colorPalette: [],
        frameSize: { width: 64, height: 64 },
        referenceDescription: "",
      },
      baseImagePath: null,
      animations: [],
      tags: [],
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ],
}

// ── Helpers ─────────────────────────────────────────────────────
function resetStores(overrides?: { project?: Project | null; projectPath?: string | null }) {
  useProjectStore.setState({
    project: overrides?.project !== undefined ? overrides.project : project,
    projectPath: overrides?.projectPath !== undefined ? overrides.projectPath : projectPath,
    isLoaded: overrides?.project !== null,
  })
  useSettingsStore.setState({
    imageGenConfig: {
      provider: "suchuang",
      model: "nanobanana",
      apiKey: "test-pipeline-key",
      baseUrl: null,
      defaultParams: {},
    },
  })
  useAnimationStore.setState({
    animations: [],
    activeAnimationId: null,
    currentFrameIndex: 0,
    isPlaying: false,
  })
}

function defaultInvokeImpl(command: string, args: Record<string, unknown> & { path?: string; req?: Record<string, unknown> }) {
  recordedInvocations.push({ cmd: command, args })
  if (command === "save_image_bytes") {
    savedPaths.push(args.path ?? "")
    return Promise.resolve(undefined)
  }
  if (command === "remove_magenta_background") {
    return Promise.resolve(undefined) // returns the output path in real impl, but sprite tool doesn't use it
  }
  if (command === "split_frames") {
    const outputDir = (args.req as Record<string, unknown>)?.output_dir as string ?? `${projectPath}/assets/frames/default`
    return Promise.resolve({
      frames: [
        {
          index: 0,
          output_path: `${outputDir}/frame_0.png`,
          width: 64,
          height: 64,
          edge_touch: false,
          offset_x: 0,
          offset_y: 0,
        },
        {
          index: 1,
          output_path: `${outputDir}/frame_1.png`,
          width: 64,
          height: 64,
          edge_touch: false,
          offset_x: 0,
          offset_y: 0,
        },
        {
          index: 2,
          output_path: `${outputDir}/frame_2.png`,
          width: 64,
          height: 64,
          edge_touch: false,
          offset_x: 0,
          offset_y: 0,
        },
        {
          index: 3,
          output_path: `${outputDir}/frame_3.png`,
          width: 64,
          height: 64,
          edge_touch: false,
          offset_x: 0,
          offset_y: 0,
        },
      ],
      cell_width: 64,
      cell_height: 64,
      shared_scale: 1,
    })
  }
  if (command === "save_project") return Promise.resolve(undefined)
  return Promise.resolve(undefined)
}

// ── Tests ───────────────────────────────────────────────────────
describe("Image generation → save → preview pipeline", () => {
  beforeEach(() => {
    generatedRequests.length = 0
    savedPaths.length = 0
    recordedInvocations.length = 0
    invokeMock.mockReset()
    invokeMock.mockImplementation(defaultInvokeImpl)
    resetStores()
  })

  // ── Full pipeline ────────────────────────────────────────────
  describe("full generation pipeline", () => {
    it("generates a sprite sheet, processes it, extracts frames into project character", async () => {
      // Step 1: Generate sprite sheet
      const genResult = await generateSpriteSheetTool.execute({
        prompt: "2x2 idle hero on solid magenta background",
        size: "1K",
        aspectRatio: "1:1",
      })

      expect(genResult.success).toBe(true)
      expect(generatedRequests).toHaveLength(1)
      expect(generatedRequests[0]).toMatchObject({
        prompt: "2x2 idle hero on solid magenta background",
        size: "1K",
        aspectRatio: "1:1",
      })
      expect(savedPaths).toHaveLength(1)
      expect(savedPaths[0]).toMatch(/\/tmp\/mova-pipeline-test\/assets\/sheets\/.+\.png$/)

      const sheetPath = (genResult.data as Record<string, unknown>)?.imagePath as string
      expect(sheetPath).toBeDefined()
      expect(sheetPath).toContain(`${projectPath}/assets/sheets/`)

      // Step 2: Process sprite sheet (magenta removal + frame split)
      const processResult = await processSpriteTool.execute({
        imagePath: sheetPath,
        grid: "2x2",
        align: "bottom",
        sharedScale: true,
      })

      expect(processResult.success).toBe(true)
      const processData = processResult.data as Record<string, unknown>
      expect(processData.framePaths).toBeDefined()
      const framePaths = processData.framePaths as string[]
      const qcManifestPath = processData.manifestPath as string
      expect(qcManifestPath).toContain(`${projectPath}/assets/frames/`)
      expect(qcManifestPath).toMatch(/manifest\.json$/)
      expect(framePaths).toHaveLength(4)
      framePaths.forEach((fp) => {
        expect(fp).toContain(`${projectPath}/assets/frames/`)
        expect(fp).toMatch(/frame_\d\.png$/)
      })

      // Step 3: Extract animation frames into project character
      const extractResult = await extractAnimationFramesTool.execute({
        characterId: "hero-1",
        animationName: "idle",
        framePaths,
        fps: 8,
        qcManifestPath,
      })

      expect(extractResult.success).toBe(true)
      const extractData = extractResult.data as Record<string, unknown>
      expect(extractData.animationId).toBeDefined()
      expect(extractData.characterId).toBe("hero-1")
      expect(extractData.animationName).toBe("idle")
      expect(extractData.frameCount).toBe(4)
      expect(extractData.fps).toBe(8)

      // Step 4: Verify project store state
      const projectState = useProjectStore.getState()
      const hero = projectState.project?.characters.find((c) => c.id === "hero-1")
      expect(hero).toBeDefined()
      expect(hero!.animations).toHaveLength(1)

      const animation = hero!.animations[0]
      expect(animation.name).toBe("idle")
      expect(animation.fps).toBe(8)
      expect(animation.frameCount).toBe(4)
      expect(animation.frames).toHaveLength(4)
      expect(animation.status).toBe("complete")
      expect(animation.loop).toBe(true)
      expect(animation.metadata.generationParams).toMatchObject({
        frameCount: 4,
        fps: 8,
        source: "sprite_sheet",
        qcManifestPath,
      })

      // Verify each frame
      animation.frames.forEach((frame, i) => {
        expect(frame.index).toBe(i)
        expect(frame.imagePath).toBe(framePaths[i])
        expect(frame.duration).toBeNull()
        expect(frame.description).toContain(`idle frame ${i + 1}`)
      })

      // NPC should be unaffected
      const npc = projectState.project?.characters.find((c) => c.id === "npc-2")
      expect(npc!.animations).toHaveLength(0)
    })

    it("project store animation can be loaded into animation store with frame normalization", () => {
      // Set up: directly add an animation to the project store character
      const framePaths = [
        `${projectPath}/assets/frames/test/run_0.png`,
        `${projectPath}/assets/frames/test/run_1.png`,
        `${projectPath}/assets/frames/test/run_2.png`,
      ]

      useProjectStore.getState().updateCharacter("hero-1", {
        animations: [
          {
            id: "anim-run-test",
            name: "Run",
            direction: "right" as const,
            frameCount: 3,
            fps: 12,
            loop: true,
            status: "complete" as const,
            frames: [
              { id: "f1", index: 0, imagePath: framePaths[0], duration: null, description: "frame 1", sourceFrameId: null },
              { id: "f2", index: 1, imagePath: framePaths[1], duration: null, description: "frame 2", sourceFrameId: null },
              { id: "f3", index: 2, imagePath: framePaths[2], duration: null, description: "frame 3", sourceFrameId: null },
            ],
            metadata: { motionDescription: "running", keyframeHints: [], generationParams: {} },
          },
        ],
      })

      // Load into animation store
      const hero = useProjectStore.getState().project?.characters.find((c) => c.id === "hero-1")
      const animation = hero!.animations[0]

      useAnimationStore.getState().setAnimations([animation])

      const animState = useAnimationStore.getState()
      expect(animState.animations).toHaveLength(1)
      expect(animState.animations[0].name).toBe("Run")
      expect(animState.animations[0].frameCount).toBe(3)
      expect(animState.animations[0].frames).toHaveLength(3)

      // Frame indexes should be normalized to 0,1,2
      expect(animState.animations[0].frames.map((f) => f.index)).toEqual([0, 1, 2])
    })

    it("generated asset paths are recognized by asset-url helpers", () => {
      const generatedPaths = [
        `${projectPath}/assets/sheets/sprite-sheet.png`,
        `${projectPath}/assets/frames/test/idle_0.png`,
        `${projectPath}/assets/frames/test/idle_1.PNG`,
        `${projectPath}/assets/frames/test/idle_2.webp`,
        `${projectPath}/assets/maps/base/preview.png`,
      ]

      generatedPaths.forEach((path) => {
        expect(isTimelineImagePath(path)).toBe(true)
      })

      // Non-image paths should be rejected
      expect(isTimelineImagePath(`${projectPath}/project.json`)).toBe(false)
      expect(isTimelineImagePath(`${projectPath}/readme.md`)).toBe(false)
      expect(isTimelineImagePath(`${projectPath}/assets/data.csv`)).toBe(false)
    })

    it("generated local paths are distinct from remote/data URLs in toDisplayAssetUrl", () => {
      // Mock Tauri internals for the test
      const originalInternals = (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
        value: {
          convertFileSrc: (path: string, protocol?: string) =>
            `${protocol}://converted/${path}`,
        },
        configurable: true,
      })

      try {
        const localPath = `${projectPath}/assets/sheets/sprite.png`
        const remoteUrl = "https://cdn.example.com/sprite.png"
        const dataUrl = "data:image/png;base64,iVBORw0KGgo="

        const localResult = toDisplayAssetUrl(localPath)
        const remoteResult = toDisplayAssetUrl(remoteUrl)
        const dataResult = toDisplayAssetUrl(dataUrl)

        // Local paths get converted via Tauri asset protocol
        expect(localResult).toContain("asset://")
        expect(localResult).toContain("converted")

        // Remote and data URLs pass through unchanged
        expect(remoteResult).toBe(remoteUrl)
        expect(dataResult).toBe(dataUrl)

        // They should NOT be equal
        expect(localResult).not.toBe(remoteResult)
        expect(localResult).not.toBe(dataResult)
      } finally {
        Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
          value: originalInternals,
          configurable: true,
        })
      }
    })
  })

  // ── Edge cases ───────────────────────────────────────────────
  describe("pipeline edge cases", () => {
    it("rejects generate when no project is loaded", async () => {
      resetStores({ project: null, projectPath: null })

      const result = await generateSpriteSheetTool.execute({
        prompt: "test",
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("No project is open")
      expect(generatedRequests).toHaveLength(0)
    })

    it("rejects generate when no image-gen API key is configured", async () => {
      resetStores()
      useSettingsStore.setState({
        imageGenConfig: {
          provider: "suchuang",
          model: "nanobanana",
          apiKey: "", // empty key
          baseUrl: null,
          defaultParams: {},
        },
      })

      const result = await generateSpriteSheetTool.execute({
        prompt: "test",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("API key not configured")
    })

    it("rejects extract when character does not exist", async () => {
      resetStores()

      const result = await extractAnimationFramesTool.execute({
        characterId: "nonexistent-character",
        animationName: "idle",
        framePaths: [`${projectPath}/assets/frames/frame_0.png`],
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Character not found")
    })

    it("rejects extract when frame paths are empty", async () => {
      resetStores()

      const result = await extractAnimationFramesTool.execute({
        characterId: "hero-1",
        animationName: "idle",
        framePaths: [],
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("No frame paths provided")
    })

    it("rejects process with invalid grid format", async () => {
      resetStores()

      const result = await processSpriteTool.execute({
        imagePath: `${projectPath}/assets/sheets/test.png`,
        grid: "invalid",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid grid format")
    })

    it("rejects process with non-numeric grid format", async () => {
      resetStores()

      const result = await processSpriteTool.execute({
        imagePath: `${projectPath}/assets/sheets/test.png`,
        grid: "two-by-two",
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain("Invalid grid format")
    })

    it("multiple extractions on same character append animations", () => {
      resetStores()

      // First extraction
      useProjectStore.getState().updateCharacter("hero-1", {
        animations: [
          {
            id: "anim-1",
            name: "Idle",
            direction: "right" as const,
            frameCount: 2,
            fps: 6,
            loop: true,
            status: "complete" as const,
            frames: [
              { id: "f1", index: 0, imagePath: "/tmp/idle_0.png", duration: null, description: "idle 1", sourceFrameId: null },
              { id: "f2", index: 1, imagePath: "/tmp/idle_1.png", duration: null, description: "idle 2", sourceFrameId: null },
            ],
            metadata: { motionDescription: "idle", keyframeHints: [], generationParams: {} },
          },
        ],
      })

      // Verify first animation
      let hero = useProjectStore.getState().project?.characters.find((c) => c.id === "hero-1")
      expect(hero!.animations).toHaveLength(1)

      // Second extraction (simulating what extractAnimationFramesTool does internally)
      const existingAnimations = hero!.animations
      useProjectStore.getState().updateCharacter("hero-1", {
        animations: [
          ...existingAnimations,
          {
            id: "anim-2",
            name: "Walk",
            direction: "right" as const,
            frameCount: 4,
            fps: 10,
            loop: true,
            status: "complete" as const,
            frames: [
              { id: "w1", index: 0, imagePath: "/tmp/walk_0.png", duration: null, description: "walk 1", sourceFrameId: null },
              { id: "w2", index: 1, imagePath: "/tmp/walk_1.png", duration: null, description: "walk 2", sourceFrameId: null },
              { id: "w3", index: 2, imagePath: "/tmp/walk_2.png", duration: null, description: "walk 3", sourceFrameId: null },
              { id: "w4", index: 3, imagePath: "/tmp/walk_3.png", duration: null, description: "walk 4", sourceFrameId: null },
            ],
            metadata: { motionDescription: "walking", keyframeHints: [], generationParams: {} },
          },
        ],
      })

      hero = useProjectStore.getState().project?.characters.find((c) => c.id === "hero-1")
      expect(hero!.animations).toHaveLength(2)
      expect(hero!.animations[0].name).toBe("Idle")
      expect(hero!.animations[1].name).toBe("Walk")
    })

    it("auto-save schedules after extract animation updates project store", async () => {
      vi.useFakeTimers()

      try {
        resetStores()

        // Simulate what extractAnimationFramesTool does
        useProjectStore.getState().updateCharacter("hero-1", {
          animations: [
            {
              id: "anim-auto-save",
              name: "Run",
              direction: "right" as const,
              frameCount: 1,
              fps: 12,
              loop: true,
              status: "complete" as const,
              frames: [
                { id: "f1", index: 0, imagePath: "/tmp/frame.png", duration: null, description: "frame", sourceFrameId: null },
              ],
              metadata: { motionDescription: "run", keyframeHints: [], generationParams: {} },
            },
          ],
        })

        // Fast-forward the auto-save debounce (500ms)
        vi.advanceTimersByTime(500)
        await vi.runAllTimersAsync()

        // Should have called save_project
        const saveCalls = recordedInvocations.filter((inv) => inv.cmd === "save_project")
        expect(saveCalls.length).toBeGreaterThanOrEqual(1)
        expect(saveCalls[0].args).toMatchObject({
          path: projectPath,
        })
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // ── Invoke recording for debugging ──────────────────────────
  describe("invoke call traceability", () => {
    it("records all invoke calls during the full pipeline for debugging", async () => {
      resetStores()

      const genResult = await generateSpriteSheetTool.execute({
        prompt: "debug test",
        size: "1K",
        aspectRatio: "1:1",
      })
      expect(genResult.success).toBe(true)

      const sheetPath = (genResult.data as Record<string, unknown>)?.imagePath as string
      await processSpriteTool.execute({
        imagePath: sheetPath,
        grid: "2x2",
      })

      const framePaths = [`${projectPath}/assets/frames/default/frame_0.png`, `${projectPath}/assets/frames/default/frame_1.png`]
      await extractAnimationFramesTool.execute({
        characterId: "hero-1",
        animationName: "debug-anim",
        framePaths,
      })

      // Verify the sequence of invoke calls
      const calls = recordedInvocations.map((inv) => inv.cmd)
      expect(calls).toContain("save_image_bytes")
      expect(calls.indexOf("save_image_bytes")).toBeLessThan(calls.indexOf("remove_magenta_background"))
      expect(calls.indexOf("remove_magenta_background")).toBeLessThan(calls.indexOf("split_frames"))

      // save_image_bytes was called for the sprite sheet
      const saveCalls = recordedInvocations.filter((inv) => inv.cmd === "save_image_bytes")
      expect(saveCalls.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── createImageProvider dispatch ────────────────────────────
  describe("createImageProvider dispatch", () => {
    it("dispatches suchuang provider correctly through the constructor map", () => {
      resetStores()
      useSettingsStore.setState({
        imageGenConfig: {
          provider: "suchuang",
          model: "nanobanana",
          apiKey: "test-dispatch-key",
          baseUrl: null,
          defaultParams: {},
        },
      })

      const result = createImageProvider()
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.provider).toBeDefined()
      }
    })

    it("rejects a provider that is available in the registry but has no runtime constructor", () => {
      resetStores()
      // Temporarily mark dall-e as available in the registry so the availability gate
      // passes, then verify the constructor-map gate catches the gap.
      IMAGE_PROVIDER_PRESET_BY_ID["dall-e"].available = true

      try {
        useSettingsStore.setState({
          imageGenConfig: {
            provider: "dall-e",
            model: "dall-e-3",
            apiKey: "test-dispatch-key",
            baseUrl: null,
            defaultParams: {},
          },
        })

        const result = createImageProvider()
        expect(result.success).toBe(false)
        if (!result.success) {
          expect(result.error).toContain("no runtime constructor")
        }
      } finally {
        IMAGE_PROVIDER_PRESET_BY_ID["dall-e"].available = false
      }
    })

    it("rejects an unknown provider ID that is not in the registry", () => {
      resetStores()
      // Use a provider ID not in the registry; availability gate should fail first.
      useSettingsStore.setState({
        imageGenConfig: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          provider: "nonexistent-provider" as any,
          model: "test",
          apiKey: "test-key",
          baseUrl: null,
          defaultParams: {},
        },
      })

      const result = createImageProvider()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("Unsupported image provider")
      }
    })
  })
})
