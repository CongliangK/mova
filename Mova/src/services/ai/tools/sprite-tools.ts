import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import type { ToolDefinition, ToolResult } from "../../../types/ai"
import { useProjectStore } from "../../../stores/project-store"
import { useJobStore } from "../../../stores/job-store"
import { useSettingsStore } from "../../../stores/settings-store"
import type { RuntimeJobRecord, JobStatus } from "../../../types/manifest"
import { createImageProvider } from "./image-provider"
import { validateProjectAssetPath } from "./project-asset-paths"
import { validateString, validateStringArray, validateOptionalString, validateOptionalNumber } from "./validate-args"

export const generateSpriteSheetTool: ToolDefinition = {
  name: "generate_sprite_sheet",
  description:
    "Generate a raw sprite sheet image using AI. Returns the generated sheet image path. The sheet uses a magenta (#FF00FF) background for chroma-key processing. For controllable character/body assets, generate one coherent action per raw sheet; avoid mixed-action raw atlases.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Detailed image generation prompt. Must include: asset type, grid shape (e.g. 2x2, 4x4), art style, subject description, frame-by-frame motion, magenta background rule, and containment rules.",
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
    const size = validateOptionalString(args.size) ?? "1K"
    const aspectRatio = validateOptionalString(args.aspectRatio) ?? "1:1"

    const providerResult = createImageProvider()
    if (!providerResult.success) return providerResult
    const provider = providerResult.provider

    const projectState = useProjectStore.getState()
    if (!projectState.projectPath) {
      return { success: false, error: "No project is open" }
    }

    const imageUrls: string[] = []
    const imageDataList: Uint8Array[] = []

    for await (const chunk of provider.generate({ prompt, size, aspectRatio })) {
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
    const savePath = `${projectPath}/assets/sheets/${imageId}.png`

    try {
      await invoke("save_image_bytes", {
        projectPath,
        path: savePath,
        data: Array.from(imageDataList[0]),
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to save sprite sheet: ${err instanceof Error ? err.message : String(err)}`,
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

type SplitFrameInfo = {
  index: number
  output_path: string
  width: number
  height: number
  edge_touch: boolean
  offset_x: number
  offset_y: number
}

type SplitResult = {
  frames: SplitFrameInfo[]
  cell_width: number
  cell_height: number
  shared_scale: number
}

type SplitFramesRequest = {
  project_path: string
  input_path: string
  output_dir: string
  rows: number
  cols: number
  align: string
  shared_scale: boolean
  reject_edge_touch?: boolean
  component_mode?: string
}

export type SpriteProcessingManifest = {
  schemaVersion: "1"
  manifestKind: "sprite_processing_qc"
  sourceProviderRef?: string
  sourceImagePath: string
  processedImagePath: string
  framePaths: string[]
  frames: SplitFrameInfo[]
  settings: {
    grid: string
    rows: number
    cols: number
    align: string
    sharedScale: boolean
    rejectEdgeTouch: boolean
    componentMode: "largest" | "all"
  }
  result: {
    cellWidth: number
    cellHeight: number
    sharedScale: number
  }
  qc: ReturnType<typeof buildSpriteQc>
  createdAt: string
}

export const SPRITE_SIZE_TOLERANCE_RATIO = 0.15

function buildSpriteQc(
  expectedFrameCount: number,
  frames: SplitFrameInfo[],
  sizeToleranceRatio: number = SPRITE_SIZE_TOLERANCE_RATIO,
) {
  const actualFrameCount = frames.length
  const frameIndexes = new Set(frames.map((frame) => frame.index))
  const missingFrameIndexes = Array.from({ length: expectedFrameCount }, (_, index) => index).filter(
    (index) => !frameIndexes.has(index),
  )
  const edgeTouchFrameIndexes = frames
    .filter((frame) => frame.edge_touch)
    .map((frame) => frame.index)
    .sort((a, b) => a - b)

  const sizeCounts = new Map<string, { width: number; height: number; count: number }>()
  frames.forEach((frame) => {
    const key = `${frame.width}x${frame.height}`
    const existing = sizeCounts.get(key)
    if (existing) {
      existing.count += 1
    } else {
      sizeCounts.set(key, { width: frame.width, height: frame.height, count: 1 })
    }
  })

  const sizes = Array.from(sizeCounts.values()).sort((a, b) => a.width - b.width || a.height - b.height)
  const warnings: string[] = []

  if (actualFrameCount !== expectedFrameCount) {
    const missingText = missingFrameIndexes.length
      ? ` Missing frame indexes: ${missingFrameIndexes.join(", ")}.`
      : ""
    warnings.push(
      `Expected ${expectedFrameCount} frames from the grid but processed ${actualFrameCount}.${missingText}`,
    )
  }

  if (edgeTouchFrameIndexes.length) {
    warnings.push(
      `Frames touching cell edges may be clipped or incomplete: ${edgeTouchFrameIndexes.join(", ")}.`,
    )
  }

  // Size consistency with tolerance: only flag when dimensions differ by more than the tolerance ratio.
  const widths = frames.map((f) => f.width)
  const heights = frames.map((f) => f.height)
  const minWidth = widths.length ? Math.min(...widths) : 0
  const maxWidth = widths.length ? Math.max(...widths) : 0
  const minHeight = heights.length ? Math.min(...heights) : 0
  const maxHeight = heights.length ? Math.max(...heights) : 0
  const widthRatio = minWidth > 0 ? maxWidth / minWidth : 1
  const heightRatio = minHeight > 0 ? maxHeight / minHeight : 1
  const sizeConsistent =
    widthRatio <= 1 + sizeToleranceRatio && heightRatio <= 1 + sizeToleranceRatio

  if (!sizeConsistent) {
    const sizeText = sizes.map((size) => `${size.width}x${size.height} (${size.count})`).join(", ")
    warnings.push(`Frame content sizes are inconsistent: ${sizeText}.`)
  }

  const grade: "pass" | "pass_with_warnings" | "fail" =
    actualFrameCount < expectedFrameCount
      ? "fail"
      : warnings.length > 0
        ? "pass_with_warnings"
        : "pass"

  return {
    expectedFrameCount,
    actualFrameCount,
    edgeTouchFrameIndexes,
    missingFrameIndexes,
    frameSizeConsistency: {
      consistent: sizeConsistent,
      sizes,
    },
    warnings,
    grade,
  }
}

export const processSpriteTool: ToolDefinition = {
  name: "process_sprite",
  description:
    "Required QC step after generate_sprite_sheet and before extract_animation_frames. Removes magenta, splits frames, optionally applies scale alignment, writes a QC manifest, and returns frame paths plus qc and manifestPath. Review qc warnings before finalizing; missing frames, edge-touch frames, and inconsistent body frame sizing block acceptance.",
  parameters: {
    type: "object",
    properties: {
      imagePath: {
        type: "string",
        description: "Path to the generated sprite sheet image",
      },
      grid: {
        type: "string",
        description: "Grid layout: e.g. '2x2', '3x3', '4x4', '1x4'",
      },
      sharedScale: {
        type: "boolean",
        description: "Whether to normalize all frames to the same scale. Default true.",
      },
      align: {
        type: "string",
        description: "Alignment mode: 'bottom' / 'feet' for grounded actors, 'center' for floating effects and projectiles. Default 'bottom'.",
      },
      componentMode: {
        type: "string",
        enum: ["largest", "all"],
        description: "Component filter mode: 'largest' keeps only the largest component for body-only assets, 'all' keeps all components for FX/projectile sheets. Default 'largest'.",
      },
      rejectEdgeTouch: {
        type: "boolean",
        description: "When true, reject frames whose content touches a grid cell edge. Use true for character/body assets. Default false.",
      },
    },
    required: ["imagePath", "grid"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
    const imagePath = validateString(args.imagePath, "imagePath")
    const grid = validateString(args.grid, "grid")
    const sharedScale = typeof args.sharedScale === "boolean" ? args.sharedScale : true
    const align = validateOptionalString(args.align) ?? "bottom"
    const rejectEdgeTouch = typeof args.rejectEdgeTouch === "boolean" ? args.rejectEdgeTouch : undefined
    const componentMode = (args.componentMode === "largest" || args.componentMode === "all") ? args.componentMode as "largest" | "all" : "largest"

    const projectState = useProjectStore.getState()
    if (!projectState.projectPath) {
      return { success: false, error: "No project is open" }
    }

    const gridMatch = grid.match(/^(\d+)x(\d+)$/)
    if (!gridMatch) {
      return { success: false, error: `Invalid grid format: ${grid}. Expected format like '2x2' or '4x4'.` }
    }
    const rows = parseInt(gridMatch[2], 10)
    const cols = parseInt(gridMatch[1], 10)

    const pathError = validateProjectAssetPath(imagePath, projectState.projectPath, "Sprite sheet image")
    if (pathError) return pathError

    const processedId = crypto.randomUUID()
    const projectPath = projectState.projectPath
    const processedPath = `${projectPath}/assets/processed/${processedId}.png`
    const framesDir = `${projectPath}/assets/frames/${processedId}`

    try {
      await invoke("remove_magenta_background", {
        req: {
          project_path: projectPath,
          input_path: imagePath,
          output_path: processedPath,
        },
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to remove magenta background: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    let splitResult: SplitResult

    try {
      const splitReq: SplitFramesRequest = {
        project_path: projectPath,
        input_path: processedPath,
        output_dir: framesDir,
        rows,
        cols,
        align,
        shared_scale: sharedScale,
        component_mode: componentMode,
      }
      if (rejectEdgeTouch !== undefined) {
        splitReq.reject_edge_touch = rejectEdgeTouch
      }

      const VALID_JOB_STATUSES = new Set(["pending", "running", "completed", "failed", "cancelled"])
      let progressJobId: string | null = null
      let unlisten: (() => void) | null = null
      try {
        unlisten = await listen<{
          job_id: string
          status: string
          progress?: number
          stage?: string
          error?: string
        }>("mova:job-progress", (event) => {
          console.log(
            `[mova:job-progress] job=${event.payload.job_id} status=${event.payload.status}` +
              (event.payload.progress !== undefined
                ? ` progress=${(event.payload.progress * 100).toFixed(0)}%`
                : "") +
              (event.payload.stage !== undefined
                ? ` stage="${event.payload.stage}"`
                : "") +
              (event.payload.error !== undefined
                ? ` error="${event.payload.error}"`
                : ""),
          )

          progressJobId = event.payload.job_id
          const patch: Partial<RuntimeJobRecord> = {}
          if (VALID_JOB_STATUSES.has(event.payload.status)) {
            patch.status = event.payload.status as JobStatus
          }
          if (event.payload.progress !== undefined) {
            patch.progress = event.payload.progress
          }
          if (event.payload.error !== undefined) {
            patch.error = event.payload.error
          }
          // Stamp finishedAt for terminal statuses.
          if (
            patch.status === "completed" ||
            patch.status === "failed" ||
            patch.status === "cancelled"
          ) {
            patch.finishedAt = new Date().toISOString()
          }
          useJobStore.getState().upsertJob(progressJobId, patch)
        })

        splitResult = await invoke("split_frames", { req: splitReq })

        // Mark job as completed on successful invoke (idempotent if
        // the final progress event already carried a terminal status).
        if (progressJobId) {
          useJobStore.getState().upsertJob(progressJobId, {
            status: "completed",
            progress: 1,
            finishedAt: new Date().toISOString(),
          })
        }
      } finally {
        unlisten?.()
      }
    } catch (err) {
      return {
        success: false,
        error: `Failed to split frames: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const framePaths = splitResult.frames.map((f) => f.output_path)
    const qc = buildSpriteQc(rows * cols, splitResult.frames)

    // Enforce rejectEdgeTouch contract per SKILL.md: fail if any frame touches cell edge.
    if (rejectEdgeTouch === true && qc.actualFrameCount < qc.expectedFrameCount) {
      return {
        success: false,
        error:
          `Rejected ${qc.expectedFrameCount - qc.actualFrameCount} frame(s) due to edge-touch. ` +
          `Rejected frame indexes: ${qc.missingFrameIndexes.join(", ")}. ` +
          `Regenerate the sprite sheet with better cell padding so no frame content touches a grid boundary.`,
      }
    }

    const manifestPath = `${framesDir}/manifest.json`
    const sourceProviderRef = useSettingsStore.getState().imageGenConfig.provider
    const manifest: SpriteProcessingManifest = {
      schemaVersion: "1",
      manifestKind: "sprite_processing_qc",
      sourceProviderRef,
      sourceImagePath: imagePath,
      processedImagePath: processedPath,
      framePaths,
      frames: splitResult.frames,
      settings: {
        grid,
        rows,
        cols,
        align,
        sharedScale,
        rejectEdgeTouch: rejectEdgeTouch ?? false,
        componentMode,
      },
      result: {
        cellWidth: splitResult.cell_width,
        cellHeight: splitResult.cell_height,
        sharedScale: splitResult.shared_scale,
      },
      qc,
      createdAt: new Date().toISOString(),
    }

    try {
      await invoke("create_file", {
        req: {
          project_path: projectPath,
          parent_path: framesDir,
          name: "manifest.json",
          content: JSON.stringify(manifest, null, 2),
          is_image: false,
        },
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to write sprite processing manifest: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    return {
      success: true,
      data: {
        framePaths,
        frames: splitResult.frames,
        cellWidth: splitResult.cell_width,
        cellHeight: splitResult.cell_height,
        sharedScale: splitResult.shared_scale,
        processedPath,
        manifestPath,
        qc,
      },
    }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}

export const extractAnimationFramesTool: ToolDefinition = {
  name: "extract_animation_frames",
  description:
    "Extract animation frames from a processed sprite sheet and register them as an animation in the current project. Only use after process_sprite succeeds and its qc has no blocking warnings. Returns the animation ID.",
  parameters: {
    type: "object",
    properties: {
      characterId: {
        type: "string",
        description: "ID of the character to attach the animation to",
      },
      animationName: {
        type: "string",
        description: "Name of the animation (e.g. 'idle', 'walk', 'attack')",
      },
      framePaths: {
        type: "array",
        description: "Array of file paths to the individual frame images",
        items: { type: "string" },
      },
      fps: {
        type: "number",
        description: "Frames per second for playback. Default 12.",
      },
      qcManifestPath: {
        type: "string",
        description: "Optional sprite QC manifest path returned by process_sprite.manifestPath for provenance.",
      },
    },
    required: ["characterId", "animationName", "framePaths"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
    const characterId = validateString(args.characterId, "characterId")
    const animationName = validateString(args.animationName, "animationName")
    const framePaths = validateStringArray(args.framePaths, "framePaths")
    const fps = validateOptionalNumber(args.fps) ?? 12
    const qcManifestPath = validateOptionalString(args.qcManifestPath)

    const projectState = useProjectStore.getState()
    if (!projectState.project) {
      return { success: false, error: "No project is open" }
    }

    const character = projectState.project.characters.find((c) => c.id === characterId)
    if (!character) {
      return { success: false, error: `Character not found: ${characterId}` }
    }

    if (!framePaths.length) {
      return { success: false, error: "No frame paths provided" }
    }

    const animationId = crypto.randomUUID()
    const now = new Date().toISOString()

    const frames = framePaths.map((path, index) => ({
      id: crypto.randomUUID(),
      index,
      imagePath: path,
      duration: null as number | null,
      description: `${animationName} frame ${index + 1}`,
      sourceFrameId: null as string | null,
    }))

    const animation = {
      id: animationId,
      name: animationName,
      direction: "right" as const,
      frameCount: frames.length,
      fps,
      loop: true,
      frames,
      status: "complete" as const,
      metadata: {
        motionDescription: `Generated ${animationName} animation`,
        keyframeHints: [],
        generationParams: {
          frameCount: frames.length,
          fps,
          source: "sprite_sheet",
          ...(qcManifestPath !== undefined ? { qcManifestPath } : {}),
        },
      },
    }

    const updatedAnimations = [...character.animations, animation]
    projectState.updateCharacter(characterId, {
      animations: updatedAnimations,
      updatedAt: now,
    })

    return {
      success: true,
      data: {
        animationId,
        characterId,
        animationName,
        frameCount: frames.length,
        fps,
      },
    }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}