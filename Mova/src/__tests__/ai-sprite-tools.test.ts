import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  extractAnimationFramesTool,
  generateSpriteSheetTool,
  processSpriteTool,
} from "../../src/services/ai/tools/sprite-tools"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"
import type { ImageGenChunk, ImageGenRequest } from "../../src/types/ai"
import type { Project } from "../../src/types/project"

const { generatedRequests, invokeMock, providerInstances } = vi.hoisted(() => ({
  generatedRequests: [] as ImageGenRequest[],
  invokeMock: vi.fn(),
  providerInstances: [] as string[],
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}))

vi.mock("../../src/services/ai/providers/image-gen", () => ({
  SuchuangProvider: class MockSuchuangProvider {
    constructor() {
      providerInstances.push("suchuang")
    }

    async *generate(request: ImageGenRequest): AsyncGenerator<ImageGenChunk> {
      generatedRequests.push(request)
      yield {
        type: "image",
        imageUrl: "https://example.test/sprite.png",
        imageData: new Uint8Array([9, 8, 7]),
      }
      yield { type: "done" }
    }
  },
}))

const projectPath = "/tmp/mova-sprite-tools"

const project: Project = {
  id: "project-1",
  name: "Sprite Test",
  version: 1,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  activeCharacterId: "char-1",
  settings: {
    defaultFrameWidth: 64,
    defaultFrameHeight: 64,
    defaultFps: 12,
    defaultArtStyle: "pixel-art",
  },
  characters: [
    {
      id: "char-1",
      name: "Hero",
      description: "test hero",
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

function resetStores() {
  useProjectStore.setState({ project, projectPath, isLoaded: true })
  useSettingsStore.setState({
    imageGenConfig: {
      provider: "suchuang",
      model: "nanobanana",
      apiKey: "test-key",
      baseUrl: null,
      defaultParams: {},
    },
  })
}

describe("AI sprite tools", () => {
  it("documents the sprite QC tool contract", () => {
    const rejectEdgeTouch = processSpriteTool.parameters.properties.rejectEdgeTouch as { description: string }
    const qcManifestPath = extractAnimationFramesTool.parameters.properties.qcManifestPath as { description: string }

    expect(generateSpriteSheetTool.description).toContain("avoid mixed-action raw atlases")
    expect(processSpriteTool.description).toContain("Required QC step after generate_sprite_sheet")
    expect(processSpriteTool.description).toContain("returns frame paths plus qc")
    expect(processSpriteTool.description).toContain("missing frames, edge-touch frames, and inconsistent body frame sizing block acceptance")
    expect(rejectEdgeTouch.description).toContain("Use true for character/body assets")
    expect(extractAnimationFramesTool.description).toContain("Only use after process_sprite succeeds")
    expect(extractAnimationFramesTool.description).toContain("no blocking warnings")
    expect(qcManifestPath.description).toContain("process_sprite.manifestPath")
  })

  beforeEach(() => {
    generatedRequests.length = 0
    providerInstances.length = 0
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === "save_image_bytes") return Promise.resolve(undefined)
      if (command === "remove_magenta_background") return Promise.resolve(undefined)
      if (command === "split_frames") {
        return Promise.resolve({
          frames: [
            {
              index: 0,
              output_path: `${projectPath}/assets/frames/processed/frame_0.png`,
              width: 64,
              height: 64,
              edge_touch: false,
              offset_x: 0,
              offset_y: 0,
            },
            {
              index: 1,
              output_path: `${projectPath}/assets/frames/processed/frame_1.png`,
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
    })
    resetStores()
  })

  it("generates a sprite sheet through the image provider and save command", async () => {
    const result = await generateSpriteSheetTool.execute({
      prompt: "2x2 idle hero on solid magenta",
      size: "1K",
      aspectRatio: "1:1",
    })

    expect(result.success).toBe(true)
    expect(generatedRequests[0]).toEqual({
      prompt: "2x2 idle hero on solid magenta",
      size: "1K",
      aspectRatio: "1:1",
    })
    expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
      projectPath: expect.any(String),
      path: expect.stringContaining(`${projectPath}/assets/sheets/`),
      data: [9, 8, 7],
    })
  })

  it("rejects unsupported image providers before provider creation or saving", async () => {
    useSettingsStore.setState({
      imageGenConfig: {
        provider: "dall-e",
        model: "dall-e-3",
        apiKey: "test-key",
        baseUrl: null,
        defaultParams: {},
      },
    })

    const result = await generateSpriteSheetTool.execute({
      prompt: "2x2 idle hero on solid magenta",
    })

    expect(result).toEqual({
      success: false,
      error: "Unsupported image provider: dall-e. Supported providers: suchuang.",
    })
    expect(providerInstances).toHaveLength(0)
    expect(generatedRequests).toHaveLength(0)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("processes an existing sprite sheet through magenta removal and frame splitting", async () => {
    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
      align: "feet",
      sharedScale: false,
    })

    expect(result.success).toBe(true)
    expect(invokeMock).toHaveBeenCalledWith("remove_magenta_background", {
      req: {
        project_path: projectPath,
        input_path: `${projectPath}/assets/sheets/raw.png`,
        output_path: expect.stringContaining(`${projectPath}/assets/processed/`),
      },
    })
    expect(invokeMock).toHaveBeenCalledWith("split_frames", {
      req: {
        project_path: projectPath,
        input_path: expect.stringContaining(`${projectPath}/assets/processed/`),
        output_dir: expect.stringContaining(`${projectPath}/assets/frames/`),
        rows: 1,
        cols: 2,
        align: "feet",
        shared_scale: false,
        component_mode: "largest",
      },
    })

    const createManifestCall = invokeMock.mock.calls.find(([command]) => command === "create_file")
    if (!createManifestCall) throw new Error("Expected create_file to persist a sprite manifest")
    const createManifestPayload = createManifestCall[1] as {
      req: {
        project_path: string
        parent_path: string
        name: string
        content: string
        is_image: boolean
      }
    }
    expect(createManifestPayload.req).toEqual(expect.objectContaining({
      project_path: projectPath,
      parent_path: expect.stringContaining(`${projectPath}/assets/frames/`),
      name: "manifest.json",
      is_image: false,
    }))

    const data = result.data as Record<string, unknown>
    expect(data.manifestPath).toBe(`${createManifestPayload.req.parent_path}/manifest.json`)
    expect(data.qc).toEqual({
      expectedFrameCount: 2,
      actualFrameCount: 2,
      edgeTouchFrameIndexes: [],
      missingFrameIndexes: [],
      frameSizeConsistency: {
        consistent: true,
        sizes: [{ width: 64, height: 64, count: 2 }],
      },
      warnings: [],
      grade: "pass",
    })

    const manifest = JSON.parse(createManifestPayload.req.content) as Record<string, unknown>
    expect(manifest).toMatchObject({
      schemaVersion: "1",
      manifestKind: "sprite_processing_qc",
      sourceProviderRef: "suchuang",
      sourceImagePath: `${projectPath}/assets/sheets/raw.png`,
      processedImagePath: data.processedPath,
      framePaths: data.framePaths,
      frames: data.frames,
      settings: {
        grid: "2x1",
        rows: 1,
        cols: 2,
        align: "feet",
        sharedScale: false,
        rejectEdgeTouch: false,
      },
      result: {
        cellWidth: 64,
        cellHeight: 64,
        sharedScale: 1,
      },
      qc: data.qc,
    })
    expect(typeof manifest.createdAt).toBe("string")
  })

  it("records the current image provider in the sprite processing manifest", async () => {
    useSettingsStore.setState({
      imageGenConfig: {
        provider: "sedans-image",
        model: "sedans-image-v1",
        apiKey: "test-key",
        baseUrl: null,
        defaultParams: {},
      },
    })

    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
    })

    expect(result.success).toBe(true)
    const createManifestCall = invokeMock.mock.calls.find(([command]) => command === "create_file")
    if (!createManifestCall) throw new Error("Expected create_file to persist a sprite manifest")

    const manifest = JSON.parse(
      (createManifestCall[1] as { req: { content: string } }).req.content,
    ) as Record<string, unknown>
    expect(manifest.sourceProviderRef).toBe("sedans-image")
  })

  it("rejects sprite processing paths outside the current project before invoking backend commands", async () => {
    const result = await processSpriteTool.execute({
      imagePath: "/tmp/not-this-project/raw.png",
      grid: "2x1",
    })

    expect(result).toEqual({
      success: false,
      error: "Sprite sheet image must be inside the current project.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rejects sprite processing paths with parent directory traversal", async () => {
    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/../outside.png`,
      grid: "2x1",
    })

    expect(result).toEqual({
      success: false,
      error: "Sprite sheet image must stay inside the current project.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("forwards componentMode to split_frames and defaults to 'largest' when omitted", async () => {
    // componentMode="all" reaches Rust split_frames
    const resultAll = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
      componentMode: "all",
    })

    expect(resultAll.success).toBe(true)
    let splitCall = invokeMock.mock.calls.find(([command]: unknown[]) => command === "split_frames")
    expect(splitCall).toBeDefined()
    let splitReq = (splitCall![1] as { req: Record<string, unknown> }).req
    expect(splitReq.component_mode).toBe("all")
    let manifestCall = invokeMock.mock.calls.find(([command]: unknown[]) => command === "create_file")
    expect(manifestCall).toBeDefined()
    let manifest = JSON.parse((manifestCall![1] as { req: { content: string } }).req.content) as Record<string, unknown>
    expect((manifest.settings as Record<string, unknown>).componentMode).toBe("all")

    // When omitted, defaults to "largest"
    invokeMock.mockClear()
    const resultDefault = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
    })

    expect(resultDefault.success).toBe(true)
    splitCall = invokeMock.mock.calls.find(([command]: unknown[]) => command === "split_frames")
    expect(splitCall).toBeDefined()
    splitReq = (splitCall![1] as { req: Record<string, unknown> }).req
    expect(splitReq.component_mode).toBe("largest")
    manifestCall = invokeMock.mock.calls.find(([command]: unknown[]) => command === "create_file")
    expect(manifestCall).toBeDefined()
    manifest = JSON.parse((manifestCall![1] as { req: { content: string } }).req.content) as Record<string, unknown>
    expect((manifest.settings as Record<string, unknown>).componentMode).toBe("largest")
  })

  it("returns QC warnings for edge-touch and inconsistent frame sizes", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "remove_magenta_background") return Promise.resolve(undefined)
      if (command === "split_frames") {
        return Promise.resolve({
          frames: [
            {
              index: 0,
              output_path: `${projectPath}/assets/frames/processed/frame_0.png`,
              width: 64,
              height: 64,
              edge_touch: true,
              offset_x: 0,
              offset_y: 0,
            },
            {
              index: 1,
              output_path: `${projectPath}/assets/frames/processed/frame_1.png`,
              width: 32,
              height: 64,
              edge_touch: false,
              offset_x: 16,
              offset_y: 0,
            },
          ],
          cell_width: 64,
          cell_height: 64,
          shared_scale: 1,
        })
      }
      return Promise.resolve(undefined)
    })

    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
    })

    expect(result.success).toBe(true)
    const qc = (result.data as Record<string, unknown>).qc as Record<string, unknown>
    expect(qc.edgeTouchFrameIndexes).toEqual([0])
    expect(qc.frameSizeConsistency).toEqual({
      consistent: false,
      sizes: [
        { width: 32, height: 64, count: 1 },
        { width: 64, height: 64, count: 1 },
      ],
    })
    expect(qc.warnings).toEqual([
      "Frames touching cell edges may be clipped or incomplete: 0.",
      "Frame content sizes are inconsistent: 32x64 (1), 64x64 (1).",
    ])
    expect(qc.grade).toBe("pass_with_warnings")

    const createManifestCall = invokeMock.mock.calls.find(([command]) => command === "create_file")
    if (!createManifestCall) throw new Error("Expected create_file to persist a sprite manifest")
    const manifest = JSON.parse((createManifestCall[1] as { req: { content: string } }).req.content) as Record<string, unknown>
    expect(manifest.qc).toEqual(qc)
    expect(manifest.frames).toEqual((result.data as Record<string, unknown>).frames)
  })

  it("marks frame sizes as consistent when dimensions differ within 15% tolerance", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "remove_magenta_background") return Promise.resolve(undefined)
      if (command === "split_frames") {
        return Promise.resolve({
          frames: [
            {
              index: 0,
              output_path: `${projectPath}/assets/frames/processed/frame_0.png`,
              width: 60,
              height: 64,
              edge_touch: false,
              offset_x: 0,
              offset_y: 0,
            },
            {
              index: 1,
              output_path: `${projectPath}/assets/frames/processed/frame_1.png`,
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
      return Promise.resolve(undefined)
    })

    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
    })

    expect(result.success).toBe(true)
    const qc = (result.data as Record<string, unknown>).qc as Record<string, unknown>
    expect(qc.frameSizeConsistency).toEqual({
      consistent: true,
      sizes: [
        { width: 60, height: 64, count: 1 },
        { width: 64, height: 64, count: 1 },
      ],
    })
    // No size-consistency warning since the 6.67% width diff is within 15%.
    expect((qc.warnings as string[]).some((w) => w.includes("inconsistent"))).toBe(false)
    expect(qc.grade).toBe("pass")
  })

  it("marks frame sizes as inconsistent when dimensions exceed 15% tolerance", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "remove_magenta_background") return Promise.resolve(undefined)
      if (command === "split_frames") {
        return Promise.resolve({
          frames: [
            {
              index: 0,
              output_path: `${projectPath}/assets/frames/processed/frame_0.png`,
              width: 50,
              height: 64,
              edge_touch: false,
              offset_x: 0,
              offset_y: 0,
            },
            {
              index: 1,
              output_path: `${projectPath}/assets/frames/processed/frame_1.png`,
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
      return Promise.resolve(undefined)
    })

    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
    })

    expect(result.success).toBe(true)
    const qc = (result.data as Record<string, unknown>).qc as Record<string, unknown>
    expect(qc.frameSizeConsistency).toEqual({
      consistent: false,
      sizes: [
        { width: 50, height: 64, count: 1 },
        { width: 64, height: 64, count: 1 },
      ],
    })
    expect((qc.warnings as string[]).some((w) => w.includes("inconsistent"))).toBe(true)
    expect(qc.grade).toBe("pass_with_warnings")
  })

  it("fails when rejectEdgeTouch is true and frames are missing", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "remove_magenta_background") return Promise.resolve(undefined)
      if (command === "split_frames") {
        return Promise.resolve({
          frames: [
            {
              index: 1,
              output_path: `${projectPath}/assets/frames/processed/frame_1.png`,
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
      return Promise.resolve(undefined)
    })

    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
      rejectEdgeTouch: true,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Rejected 1 frame(s) due to edge-touch")
    expect(result.error).toContain("Regenerate the sprite sheet")
    expect(invokeMock).toHaveBeenCalledWith("split_frames", {
      req: expect.objectContaining({ reject_edge_touch: true }),
    })
    // Manifest must not be written on failure.
    expect(invokeMock).not.toHaveBeenCalledWith(
      "create_file",
      expect.objectContaining({ req: expect.objectContaining({ name: "manifest.json" }) }),
    )
  })

  it("returns success with QC warnings when rejectEdgeTouch is false and frames are missing", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "remove_magenta_background") return Promise.resolve(undefined)
      if (command === "split_frames") {
        return Promise.resolve({
          frames: [
            {
              index: 1,
              output_path: `${projectPath}/assets/frames/processed/frame_1.png`,
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
      return Promise.resolve(undefined)
    })

    const result = await processSpriteTool.execute({
      imagePath: `${projectPath}/assets/sheets/raw.png`,
      grid: "2x1",
      rejectEdgeTouch: false,
    })

    expect(result.success).toBe(true)
    const qc = (result.data as Record<string, unknown>).qc as Record<string, unknown>
    expect(qc).toMatchObject({
      expectedFrameCount: 2,
      actualFrameCount: 1,
      missingFrameIndexes: [0],
    })
  })

  it("registers extracted frames as a character animation", async () => {
    const result = await extractAnimationFramesTool.execute({
      characterId: "char-1",
      animationName: "idle",
      framePaths: ["/tmp/frame-1.png", "/tmp/frame-2.png"],
      fps: 10,
    })

    expect(result.success).toBe(true)
    const character = useProjectStore.getState().project?.characters[0]
    expect(character?.animations).toHaveLength(1)
    expect(character?.animations[0]).toMatchObject({
      name: "idle",
      frameCount: 2,
      fps: 10,
      status: "complete",
    })
    expect(character?.animations[0].metadata.generationParams).toEqual({
      frameCount: 2,
      fps: 10,
      source: "sprite_sheet",
    })
  })
})
