import { beforeEach, describe, expect, it, vi } from "vitest"
import { mapGenerationSkill } from "../../src/services/ai/skills/map-generation-skill"
import {
  generateMapBaseTool,
  generatePropsTool,
  composePreviewTool,
  extractPropsTool,
  createCollisionDataTool,
} from "../../src/services/ai/tools/map-tools"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"
import type { ImageGenRequest, ImageGenChunk } from "../../src/types/ai"

const { generatedRequests, invokeMock, providerInstances } = vi.hoisted(() => ({
  generatedRequests: [] as ImageGenRequest[],
  invokeMock: vi.fn(),
  providerInstances: [] as string[],
}))

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
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
        imageUrl: "https://example.test/generated.png",
        imageData: new Uint8Array([1, 2, 3]),
      }
      yield { type: "done" }
    }
  },
}))

const projectPath = "/tmp/mova-ai-tools"

function resetStores() {
  useProjectStore.setState({ project: null, projectPath, isLoaded: true })
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

describe("AI map tools", () => {
  beforeEach(() => {
    generatedRequests.length = 0
    providerInstances.length = 0
    invokeMock.mockReset()
    invokeMock.mockImplementation((command: string) => {
      if (command === "save_image_bytes") return Promise.resolve(undefined)
      if (command === "compose_layered_preview") return Promise.resolve(`${projectPath}/assets/maps/previews/preview.png`)
      if (command === "extract_prop_pack") {
        return Promise.resolve({
          props: [
            { index: 0, filename: "prop_0.png", width: 64, height: 64, cell_x: 0, cell_y: 0 },
            { index: 1, filename: "prop_1.png", width: 64, height: 64, cell_x: 1, cell_y: 0 },
          ],
          manifest_path: `${projectPath}/assets/props/extracted/manifest.json`,
        })
      }
      if (command === "get_image_dimensions") return Promise.resolve({ width: 64, height: 64 })
      return Promise.resolve(undefined)
    })
    resetStores()
  })

  it("generates a top-down base map through the image provider and save command", async () => {
    const result = await generateMapBaseTool.execute({
      prompt: "forest clearing foundation only",
      mode: "top-down",
      size: "2K",
      aspectRatio: "16:9",
    })

    expect(result.success).toBe(true)
    expect(generatedRequests[0]).toMatchObject({ size: "2K", aspectRatio: "16:9" })
    expect(generatedRequests[0].prompt).toContain("Rendering mode: top-down map view only")
    expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
      projectPath: expect.any(String),
      path: expect.stringContaining(`${projectPath}/assets/maps/`),
      data: [1, 2, 3],
    })
  })

  it("rejects unsupported image providers before provider creation or saving", async () => {
    useSettingsStore.setState({
      imageGenConfig: {
        provider: "stability",
        model: "stable-image",
        apiKey: "test-key",
        baseUrl: null,
        defaultParams: {},
      },
    })

    const result = await generateMapBaseTool.execute({
      prompt: "forest clearing foundation only",
    })

    expect(result).toEqual({
      success: false,
      error: "Unsupported image provider: stability. Supported providers: suchuang.",
    })
    expect(providerInstances).toHaveLength(0)
    expect(generatedRequests).toHaveLength(0)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rejects unsupported base map modes instead of silently ignoring them", async () => {
    const result = await generateMapBaseTool.execute({
      prompt: "platformer background",
      mode: "side-view",
    })

    expect(result).toEqual({
      success: false,
      error: "Unsupported map mode: side-view. Supported modes: top-down.",
    })
    expect(generatedRequests).toHaveLength(0)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("passes count and grid constraints into prop-sheet generation", async () => {
    const result = await generatePropsTool.execute({
      prompt: "forest rocks and bushes on magenta",
      count: 9,
      grid: "3x3",
    })

    expect(result.success).toBe(true)
    expect(generatedRequests[0].prompt).toContain("Generate exactly 9 props arranged in a 3x3 grid")
    expect(invokeMock).toHaveBeenCalledWith("save_image_bytes", {
      projectPath: expect.any(String),
      path: expect.stringContaining(`${projectPath}/assets/props/sheets/`),
      data: [1, 2, 3],
    })
  })

  it("rejects mismatched prop count and grid before generation", async () => {
    const result = await generatePropsTool.execute({
      prompt: "props",
      count: 5,
      grid: "2x2",
    })

    expect(result).toEqual({
      success: false,
      error: "Prop count/grid mismatch: count 5 does not match 2x2 (4 cells).",
    })
    expect(generatedRequests).toHaveLength(0)
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rejects automatic collision extraction instead of returning placeholder data", async () => {
    const result = await createCollisionDataTool.execute({
      mapImagePath: `${projectPath}/assets/maps/base.png`,
      cellSize: 16,
    })

    expect(result).toEqual({
      success: false,
      error:
        "Automatic collision extraction from map images is not implemented. Author collision metadata manually from explicit prop/object placements instead.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rejects compose preview paths outside the current project before invoking backend commands", async () => {
    const preview = await composePreviewTool.execute({
      baseImagePath: "/tmp/outside-project/base.png",
      placements: [{ image_path: `${projectPath}/assets/props/tree.png`, x: 10, y: 20 }],
    })

    expect(preview).toEqual({
      success: false,
      error: "Base map image must be inside the current project.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rejects compose preview prop paths with parent directory traversal", async () => {
    const preview = await composePreviewTool.execute({
      baseImagePath: `${projectPath}/assets/maps/base.png`,
      placements: [{ image_path: `${projectPath}/assets/props/../escape.png`, x: 10, y: 20 }],
    })

    expect(preview).toEqual({
      success: false,
      error: "Placement 0 image must stay inside the current project.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("rejects extract props paths outside the current project before invoking backend commands", async () => {
    const extracted = await extractPropsTool.execute({
      inputPath: "/tmp/outside-project/props.png",
      rows: 1,
      cols: 2,
    })

    expect(extracted).toEqual({
      success: false,
      error: "Prop sheet image must be inside the current project.",
    })
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it("exposes a top-down-only skill contract and decline guidance for unsupported modes", () => {
    expect(mapGenerationSkill.description).toContain("top-down")
    expect(mapGenerationSkill.description).not.toContain("side_scroll_mode")
    expect(mapGenerationSkill.systemPrompt).toContain("Only one production workflow is implemented in this skill")
    expect(mapGenerationSkill.systemPrompt).toContain("Tool mode: 'top-down'")
    expect(mapGenerationSkill.systemPrompt).toContain("do not call the map-generation tools for it")
    expect(mapGenerationSkill.systemPrompt).not.toContain("### side_scroll_mode")
  })

  it("reaches existing compose preview and extract props app workflows", async () => {
    const preview = await composePreviewTool.execute({
      baseImagePath: `${projectPath}/assets/maps/base.png`,
      placements: [{ image_path: `${projectPath}/assets/props/tree.png`, x: 10, y: 20 }],
    })
    const extracted = await extractPropsTool.execute({
      inputPath: `${projectPath}/assets/props/sheets/props.png`,
      rows: 1,
      cols: 2,
    })

    expect(preview.success).toBe(true)
    const previewData = preview.data as Record<string, unknown>
    expect(previewData.manifestPath).toContain("/assets/maps/previews/")
    expect(previewData.manifestPath).toContain(".manifest.json")
    expect(extracted.success).toBe(true)
    const extractedData = extracted.data as Record<string, unknown>
    expect(extractedData.manifestPath).toContain("/assets/props/extracted/")
    expect(extractedData.manifestPath).toContain("/manifest.json")

    expect(invokeMock).toHaveBeenCalledWith("compose_layered_preview", {
      project_path: projectPath,
      base_image_path: `${projectPath}/assets/maps/base.png`,
      output_path: expect.stringContaining(`${projectPath}/assets/maps/previews/`),
      placements: JSON.stringify([{ image_path: `${projectPath}/assets/props/tree.png`, x: 10, y: 20 }]),
    })

    const createFileCalls = invokeMock.mock.calls.filter(
      (call: unknown[]) => call[0] === "create_file",
    )
    expect(createFileCalls).toHaveLength(2)

    // Compose preview manifest
    const composeFileArgs = (createFileCalls[0]![1] as { req: { content: string; name: string } }).req
    expect(composeFileArgs.name).toMatch(/\.manifest\.json$/)
    expect(composeFileArgs.content).toContain('"manifestKind": "map_compose"')
    const composeManifest = JSON.parse(composeFileArgs.content)
    expect(composeManifest).toMatchObject({
      schemaVersion: "1",
      manifestKind: "map_compose",
      baseImagePath: `${projectPath}/assets/maps/base.png`,
      outputPath: expect.stringContaining(`${projectPath}/assets/maps/previews/`),
      placements: [{ image_path: `${projectPath}/assets/props/tree.png`, x: 10, y: 20 }],
    })
    expect(composeManifest.createdAt).toEqual(expect.any(String))

    // Prop extraction manifest
    const propFileArgs = (createFileCalls[1]![1] as { req: { content: string; name: string } }).req
    expect(propFileArgs.name).toBe("manifest.json")
    const propManifest = JSON.parse(propFileArgs.content)
    expect(propManifest).toMatchObject({
      schemaVersion: "1",
      manifestKind: "prop_extraction",
      props: [
        { index: 0, filename: "prop_0.png", width: 64, height: 64, cell_x: 0, cell_y: 0 },
        { index: 1, filename: "prop_1.png", width: 64, height: 64, cell_x: 1, cell_y: 0 },
      ],
      settings: {
        rows: 1,
        cols: 2,
        inputPath: `${projectPath}/assets/props/sheets/props.png`,
        componentMode: "largest",
      },
    })
    expect(propManifest.createdAt).toEqual(expect.any(String))

    // QC assertions: all expected props extracted → pass
    expect(propManifest.qc).toMatchObject({
      expectedPropCount: 2,
      actualPropCount: 2,
      missingPropIndexes: [],
      sizeConsistency: { consistent: true },
      warnings: [],
      grade: "pass",
    })

    // Verify qc also accessible from returned result data
    expect(extractedData.qc).toMatchObject({
      expectedPropCount: 2,
      actualPropCount: 2,
      grade: "pass",
    })

    expect(invokeMock).toHaveBeenCalledWith("extract_prop_pack", {
      project_path: projectPath,
      input_path: `${projectPath}/assets/props/sheets/props.png`,
      output_dir: expect.stringContaining(`${projectPath}/assets/props/extracted/`),
      rows: 1,
      cols: 2,
      component_mode: "largest",
    })
  })

  it("grades prop extraction as fail when some cells are empty", async () => {
    // Override mock for this single test to return only 1 prop from 2x2 grid
    invokeMock.mockImplementation((command: string) => {
      if (command === "extract_prop_pack") {
        return Promise.resolve({
          props: [
            { index: 0, filename: "prop_0.png", width: 64, height: 64, cell_x: 0, cell_y: 0 },
          ],
          manifest_path: `${projectPath}/assets/props/extracted/manifest.json`,
        })
      }
      if (command === "create_file") return Promise.resolve(undefined)
      return Promise.resolve(undefined)
    })

    const extracted = await extractPropsTool.execute({
      inputPath: `${projectPath}/assets/props/sheets/props.png`,
      rows: 2,
      cols: 2,
    })

    expect(extracted.success).toBe(true)
    const data = extracted.data as Record<string, unknown>
    expect(data.qc).toMatchObject({
      expectedPropCount: 4,
      actualPropCount: 1,
      missingPropIndexes: expect.arrayContaining([
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
      ]),
      grade: "fail",
    })
    const qc = data.qc as { warnings: string[] }
    expect(qc.warnings.length).toBeGreaterThan(0)
    expect(qc.warnings[0]).toContain("Expected 4 props")
    expect(qc.warnings[0]).toContain("extracted 1")
  })
})
