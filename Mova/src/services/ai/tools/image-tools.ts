import { invoke } from "@tauri-apps/api/core"
import type { ToolDefinition, ToolResult } from "../../../types/ai"
import { useProjectStore } from "../../../stores/project-store"
import { createImageProvider } from "./image-provider"
import { validateString, validateOptionalString } from "./validate-args"

export const generateImageTool: ToolDefinition = {
  name: "generate_image",
  description:
    "Generate a character image using AI. Saves the image to the project's assets directory. Returns the saved image path.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Detailed image description. Include art style (pixel-art, anime, etc.), character features, pose, and background.",
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

    // Save first image to project assets
    const imageId = crypto.randomUUID()
    const projectPath = projectState.projectPath
    const savePath = `${projectPath}/assets/characters/${imageId}.png`

    try {
      await invoke("save_image_bytes", {
        projectPath,
        path: savePath,
        data: Array.from(imageDataList[0]),
      })
    } catch (err) {
      return {
        success: false,
        error: `Failed to save image: ${err instanceof Error ? err.message : String(err)}`,
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

export const createCharacterTool: ToolDefinition = {
  name: "create_character",
  description: "Create a new character in the current project with a name, description, and art style.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Character name" },
      description: { type: "string", description: "Character description" },
      artStyle: {
        type: "string",
        description: "Art style: pixel-art, cartoon, anime, realistic. Default pixel-art.",
      },
      baseImagePath: {
        type: "string",
        description: "Path to the character's base image (from generate_image tool)",
      },
    },
    required: ["name"],
  },
  execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
    try {
      const state = useProjectStore.getState()
      if (!state.project) {
        return { success: false, error: "No project is open" }
      }

      const name = validateOptionalString(args.name) ?? "Untitled"
      const description = validateOptionalString(args.description) ?? ""
      const artStyle = validateOptionalString(args.artStyle) ?? "pixel-art"
      const baseImagePath = validateOptionalString(args.baseImagePath) ?? null

      const character = {
        id: crypto.randomUUID(),
        name,
        description,
        style: {
          artStyle: artStyle as "pixel-art" | "cartoon" | "anime" | "realistic",
          colorPalette: [],
          frameSize: { width: 64, height: 64 },
          referenceDescription: description,
        },
        baseImagePath,
        animations: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const result = state.addCharacter(character)
      if (!result.success) {
        return { success: false, error: "Failed to add character to project" }
      }

      state.setActiveCharacter(character.id)

      return {
        success: true,
        data: { characterId: character.id, name },
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  },
}
