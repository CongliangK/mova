import { invoke } from "@tauri-apps/api/core"
import type { ToolDefinition, ToolResult } from "../../../types/ai"
import type { MapComposeManifest, PropExtractionManifest, PropExtractionQc } from "../../../types/manifest"
import { useProjectStore } from "../../../stores/project-store"
import { createImageProvider } from "./image-provider"
import { validateProjectAssetPath } from "./project-asset-paths"
import { validateString, validateNumber, validateOptionalString, validateOptionalNumber } from "./validate-args"

const SUPPORTED_MAP_MODES = ["top-down"] as const

function mapModePrompt(prompt: string, mode: string): string | ToolResult {
  if (!SUPPORTED_MAP_MODES.includes(mode as (typeof SUPPORTED_MAP_MODES)[number])) {
    return {
      success: false,
      error: `Unsupported map mode: ${mode}. Supported modes: ${SUPPORTED_MAP_MODES.join(", ")}.`,
    }
  }

  return `${prompt}\nRendering mode: top-down map view only.`
}

function propSheetPrompt(prompt: string, count: number, grid: string): string | ToolResult {
  if (!Number.isInteger(count) || count <= 0) {
    return { success: false, error: `Invalid prop count: ${count}. Expected a positive integer.` }
  }

  const gridMatch = grid.match(/^(\d+)x(\d+)$/)
  if (!gridMatch) {
    return { success: false, error: `Invalid prop grid: ${grid}. Expected format like '2x2' or '3x3'.` }
  }

  const cols = parseInt(gridMatch[1], 10)
  const rows = parseInt(gridMatch[2], 10)
  if (rows * cols !== count) {
    return {
      success: false,
      error: `Prop count/grid mismatch: count ${count} does not match ${grid} (${rows * cols} cells).`,
    }
  }

  return `${prompt}\nGenerate exactly ${count} props arranged in a ${grid} grid with no borders or labels.`
}

export const generateMapBaseTool: ToolDefinition = {
  name: "generate_map_base",
  description:
    "Generate a base map image using AI. Returns the generated base map image path. The base map contains only terrain and ground-level details (no props, buildings, NPCs, or text).",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Detailed image generation prompt for the base map. Must include: map type (e.g., town, dungeon, forest), art style, terrain description, and a rule that no tall objects or props should be included.",
      },
      mode: {
        type: "string",
        description: "Map rendering mode. Only 'top-down' is currently supported; other values are rejected visibly.",
      },
      size: {
        type: "string",
        description: "Image resolution: 1K, 2K, or 4K. Default 2K.",
      },
      aspectRatio: {
        type: "string",
        description: "Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4. Default 16:9.",
      },
    },
    required: ["prompt"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
    const prompt = validateString(args.prompt, "prompt")
    const mode = validateOptionalString(args.mode) ?? "top-down"
    const size = validateOptionalString(args.size) ?? "2K"
    const aspectRatio = validateOptionalString(args.aspectRatio) ?? "16:9"

    const generationPrompt = mapModePrompt(prompt, mode)
    if (typeof generationPrompt !== "string") return generationPrompt

    const providerResult = createImageProvider()
    if (!providerResult.success) return providerResult
    const provider = providerResult.provider

    const projectState = useProjectStore.getState()
    if (!projectState.projectPath) {
      return { success: false, error: "No project is open" }
    }

    const imageUrls: string[] = []
    const imageDataList: Uint8Array[] = []

    for await (const chunk of provider.generate({ prompt: generationPrompt, size, aspectRatio })) {
      if (chunk.type === "error") {
        return { success: false, error: chunk.message }
      }
      if (chunk.type === "image") {
        imageUrls.push(chunk.imageUrl)
        if (chunk.imageData) {
          imageDataList.push(chunk.imageData)
        }
      }
    }

    if (!imageDataList.length) {
      return { success: false, error: "No images were generated" }
    }

    const imageId = crypto.randomUUID()
    const projectPath = projectState.projectPath
    const savePath = `${projectPath}/assets/maps/${imageId}.png`

    try {
      await invoke("save_image_bytes", {
        projectPath,
        path: savePath,
        data: Array.from(imageDataList[0]),
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to save base map: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    return {
      success: true,
      data: {
        imagePath: savePath,
        imageUrl: imageUrls[0],
        imageId,
      },
    }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const generatePropsTool: ToolDefinition = {
  name: "generate_props",
  description:
    "Generate a prop sheet image using AI. Returns the generated prop sheet path. Props are transparent sprites on a magenta (#FF00FF) background for chroma-key extraction.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Detailed image generation prompt for the prop sheet. Must include: prop types (e.g., trees, rocks, buildings), art style matching the base map, and a magenta background rule.",
      },
      count: {
        type: "number",
        description: "Number of props to generate. Default 4.",
      },
      grid: {
        type: "string",
        description: "Grid layout for the prop sheet: e.g. '2x2', '1x4', '4x4'. Default '2x2'.",
      },
      size: {
        type: "string",
        description: "Image resolution: 1K, 2K, or 4K. Default 1K.",
      },
      aspectRatio: {
        type: "string",
        description: "Aspect ratio: 1:1, 16:9, 9:16, 4:3, 3:4. Default 1:1.",
      },
    },
    required: ["prompt"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
    const prompt = validateString(args.prompt, "prompt")
    const count = validateOptionalNumber(args.count) ?? 4
    const grid = validateOptionalString(args.grid) ?? "2x2"
    const size = validateOptionalString(args.size) ?? "1K"
    const aspectRatio = validateOptionalString(args.aspectRatio) ?? "1:1"

    const generationPrompt = propSheetPrompt(prompt, count, grid)
    if (typeof generationPrompt !== "string") return generationPrompt

    const providerResult = createImageProvider()
    if (!providerResult.success) return providerResult
    const provider = providerResult.provider

    const projectState = useProjectStore.getState()
    if (!projectState.projectPath) {
      return { success: false, error: "No project is open" }
    }

    const imageUrls: string[] = []
    const imageDataList: Uint8Array[] = []

    for await (const chunk of provider.generate({ prompt: generationPrompt, size, aspectRatio })) {
      if (chunk.type === "error") {
        return { success: false, error: chunk.message }
      }
      if (chunk.type === "image") {
        imageUrls.push(chunk.imageUrl)
        if (chunk.imageData) {
          imageDataList.push(chunk.imageData)
        }
      }
    }

    if (!imageDataList.length) {
      return { success: false, error: "No images were generated" }
    }

    const imageId = crypto.randomUUID()
    const projectPath = projectState.projectPath
    const savePath = `${projectPath}/assets/props/sheets/${imageId}.png`

    try {
      await invoke("save_image_bytes", {
        projectPath,
        path: savePath,
        data: Array.from(imageDataList[0]),
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to save prop sheet: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    return {
      success: true,
      data: {
        imagePath: savePath,
        imageUrl: imageUrls[0],
        imageId,
      },
    }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const composePreviewTool: ToolDefinition = {
  name: "compose_preview",
  description:
    "Compose a layered preview by overlaying props onto a base map image. Invokes the Rust compose_layered_preview command. Returns the output preview image path.",
  parameters: {
    type: "object",
    properties: {
      baseImagePath: {
        type: "string",
        description: "Path to the base map PNG image",
      },
      placements: {
        type: "array",
        description: "Array of prop placement objects",
        items: {
          type: "object",
          properties: {
            image_path: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            opacity: { type: "number" },
            w: { type: "number" },
            h: { type: "number" },
            anchor: { type: "string" },
            layer: { type: "string" },
            sort_y: { type: "number" },
          },
        },
      },
    },
    required: ["baseImagePath", "placements"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
    const baseImagePath = validateString(args.baseImagePath, "baseImagePath")
    const placements = args.placements as Array<Record<string, unknown>>

    const projectState = useProjectStore.getState()
    if (!projectState.projectPath) {
      return { success: false, error: "No project is open" }
    }

    const basePathError = validateProjectAssetPath(baseImagePath, projectState.projectPath, "Base map image")
    if (basePathError) return basePathError
    if (!Array.isArray(placements)) {
      return { success: false, error: "placements must be an array." }
    }
    for (const [index, placement] of placements.entries()) {
      if (!placement || typeof placement !== "object") {
        return { success: false, error: `Placement ${index} must be an object.` }
      }
      const placementPath = validateOptionalString(placement.image_path)
      if (!placementPath) {
        return { success: false, error: `Placement ${index} image_path must be a string.` }
      }
      const placementPathError = validateProjectAssetPath(placementPath, projectState.projectPath, `Placement ${index} image`)
      if (placementPathError) return placementPathError
    }

    const outputId = crypto.randomUUID()
    const projectPath = projectState.projectPath
    const outputPath = `${projectPath}/assets/maps/previews/${outputId}.png`

    try {
      const result = await invoke("compose_layered_preview", {
        project_path: projectPath,
        base_image_path: baseImagePath,
        output_path: outputPath,
        placements: JSON.stringify(placements),
      })

      const manifestPath = `${projectPath}/assets/maps/previews/${outputId}.manifest.json`
      const manifest: MapComposeManifest = {
        schemaVersion: "1",
        manifestKind: "map_compose",
        baseImagePath,
        outputPath: result as string,
        placements,
        createdAt: new Date().toISOString(),
      }

      try {
        await invoke("create_file", {
          req: {
            project_path: projectPath,
            parent_path: `${projectPath}/assets/maps/previews`,
            name: `${outputId}.manifest.json`,
            content: JSON.stringify(manifest, null, 2),
            is_image: false,
          },
        })
      } catch (err) {
        return {
          success: false,
          error: `Failed to write map composition manifest: ${err instanceof Error ? err.message : String(err)}`,
        }
      }

      return {
        success: true,
        data: {
          outputPath: result,
          manifestPath,
        },
      }
    } catch (err) {
      return {
        success: false,
        error: `Failed to compose preview: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const PROP_SIZE_TOLERANCE_RATIO = 0.4

function buildPropQc(
  expectedPropCount: number,
  props: PropExtractionManifest["props"],
  rows: number,
  cols: number,
  sizeToleranceRatio: number = PROP_SIZE_TOLERANCE_RATIO,
): PropExtractionQc {
  const actualPropCount = props.length

  // Identify missing grid positions.
  const occupiedCells = new Set<string>()
  for (const prop of props) {
    occupiedCells.add(`${prop.cell_y},${prop.cell_x}`)
  }

  const missingPropIndexes: Array<{ row: number; col: number }> = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!occupiedCells.has(`${row},${col}`)) {
        missingPropIndexes.push({ row, col })
      }
    }
  }

  // Size consistency analysis.
  const widthCounts = new Map<string, { width: number; height: number; count: number }>()
  for (const prop of props) {
    const key = `${prop.width}x${prop.height}`
    const existing = widthCounts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      widthCounts.set(key, { width: prop.width, height: prop.height, count: 1 })
    }
  }

  const sizes = Array.from(widthCounts.values()).sort((a, b) => a.width - b.width || a.height - b.height)

  const widths = props.map((p) => p.width)
  const heights = props.map((p) => p.height)
  const minWidth = widths.length ? Math.min(...widths) : 0
  const maxWidth = widths.length ? Math.max(...widths) : 0
  const minHeight = heights.length ? Math.min(...heights) : 0
  const maxHeight = heights.length ? Math.max(...heights) : 0
  const widthRatio = minWidth > 0 ? maxWidth / minWidth : 1
  const heightRatio = minHeight > 0 ? maxHeight / minHeight : 1
  const sizeConsistent =
    widthRatio <= 1 + sizeToleranceRatio && heightRatio <= 1 + sizeToleranceRatio

  const warnings: string[] = []

  if (actualPropCount < expectedPropCount) {
    warnings.push(
      `Expected ${expectedPropCount} props from the grid but extracted ${actualPropCount}.` +
        ` Missing cells: ${missingPropIndexes.map((m) => `(${m.row},${m.col})`).join(", ")}.`,
    )
  }

  if (actualPropCount >= expectedPropCount && !sizeConsistent) {
    const sizeText = sizes.map((size) => `${size.width}x${size.height} (${size.count})`).join(", ")
    warnings.push(`Prop sizes are inconsistent: ${sizeText}.`)
  }

  const grade: "pass" | "pass_with_warnings" | "fail" =
    actualPropCount < expectedPropCount
      ? "fail"
      : warnings.length > 0
        ? "pass_with_warnings"
        : "pass"

  return {
    expectedPropCount,
    actualPropCount,
    missingPropIndexes,
    sizeConsistency: {
      consistent: sizeConsistent,
      sizes,
    },
    warnings,
    grade,
  }
}

export const extractPropsTool: ToolDefinition = {
  name: "extract_props",
  description:
    "Extract individual prop images from a prop sheet by removing magenta background and splitting into cells. Invokes the Rust extract_prop_pack command. Returns manifest data with extracted prop paths.",
  parameters: {
    type: "object",
    properties: {
      inputPath: {
        type: "string",
        description: "Path to the prop sheet PNG image",
      },
      rows: {
        type: "number",
        description: "Number of rows in the prop sheet grid",
      },
      cols: {
        type: "number",
        description: "Number of columns in the prop sheet grid",
      },
      componentMode: {
        type: "string",
        description:
          "Connected-component filter mode: 'largest' (default) keeps only the largest connected component per cell; 'all' preserves all disconnected components for multi-part props.",
      },
    },
    required: ["inputPath", "rows", "cols"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
    const inputPath = validateString(args.inputPath, "inputPath")
    const rows = validateNumber(args.rows, "rows")
    const cols = validateNumber(args.cols, "cols")
    const componentMode = validateOptionalString(args.componentMode) ?? "largest"

    const projectState = useProjectStore.getState()
    if (!projectState.projectPath) {
      return { success: false, error: "No project is open" }
    }

    const pathError = validateProjectAssetPath(inputPath, projectState.projectPath, "Prop sheet image")
    if (pathError) return pathError

    const outputId = crypto.randomUUID()
    const projectPath = projectState.projectPath
    const outputDir = `${projectPath}/assets/props/extracted/${outputId}`

    try {
      const result = await invoke("extract_prop_pack", {
        project_path: projectPath,
        input_path: inputPath,
        output_dir: outputDir,
        rows,
        cols,
        component_mode: componentMode,
      })

      const props = (result as { props: PropExtractionManifest["props"] }).props
      const qc = buildPropQc(rows * cols, props, rows, cols)

      const manifest: PropExtractionManifest = {
        schemaVersion: "1",
        manifestKind: "prop_extraction",
        createdAt: new Date().toISOString(),
        props,
        settings: {
          rows,
          cols,
          inputPath,
          componentMode,
        },
        qc,
      }

      try {
        await invoke("create_file", {
          req: {
            project_path: projectPath,
            parent_path: outputDir,
            name: "manifest.json",
            content: JSON.stringify(manifest, null, 2),
            is_image: false,
          },
        })
      } catch (err) {
        return {
          success: false,
          error: `Failed to write prop extraction manifest: ${err instanceof Error ? err.message : String(err)}`,
        }
      }

      return {
        success: true,
        data: {
          manifest: result,
          manifestPath: `${outputDir}/manifest.json`,
          outputDir,
          qc,
        },
      }
    } catch (err) {
      return {
        success: false,
        error: `Failed to extract props: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const createCollisionDataTool: ToolDefinition = {
  name: "create_collision_data",
  description:
    "Automatic collision extraction from a map image is not implemented. Use this only to return a clear limitation so collision metadata can be authored manually from explicit prop/object placements.",
  parameters: {
    type: "object",
    properties: {
      mapImagePath: {
        type: "string",
        description: "Path to the base map PNG image that would need manually authored collision metadata.",
      },
      cellSize: {
        type: "number",
        description: "Unused placeholder argument retained for compatibility. Automatic collision grid generation is not implemented.",
      },
    },
    required: ["mapImagePath"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      validateString(args.mapImagePath, "mapImagePath")
      validateOptionalNumber(args.cellSize)

      return {
        success: false,
        error:
          "Automatic collision extraction from map images is not implemented. Author collision metadata manually from explicit prop/object placements instead.",
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
