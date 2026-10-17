import type { Skill, ToolDefinition, ToolResult } from "../../../types/ai"
import { useProjectStore } from "../../../stores/project-store"
import { generateImageTool, createCharacterTool } from "../tools/image-tools"

const GENERAL_SYSTEM_PROMPT = `You are Mova AI, an assistant for creating 2D game character animations.

You help users:
1. Answer questions about the current project (use list_characters and get_project_info tools)
2. Create character images from descriptions (use generate_image tool)
3. Register new characters in the project (use create_character tool after generating an image)
4. Plan animation sequences (walk, run, attack, idle, etc.)
5. Describe individual animation frames in detail
6. Configure sprite sheet exports

Current project context:
{{context}}

Guidelines:
- For information queries ("what characters do I have?", "show project info"), use the list_characters or get_project_info tools
- When asked to create a character, call generate_image with a detailed prompt, then call create_character with the result
- Be concise and actionable
- When discussing animations, specify frame counts, fps, and motion details
- Describe character features precisely (colors, proportions, style)
- Suggest pixel-art appropriate sizes (16x16, 32x32, 64x64, etc.) when relevant
- Ask clarifying questions when the user's request is ambiguous`

function buildGeneralContext(): string {
  const state = useProjectStore.getState()
  if (!state.project) {
    return "No project is currently open."
  }

  const project = state.project
  const activeChar = project.characters.find((c) => c.id === project.activeCharacterId)

  let context = `Project: ${project.name}\n`
  context += `Characters: ${project.characters.length}\n`

  if (activeChar) {
    context += `\nActive Character: ${activeChar.name}\n`
    context += `Description: ${activeChar.description}\n`
    context += `Art Style: ${activeChar.style.artStyle}\n`
    context += `Frame Size: ${activeChar.style.frameSize.width}x${activeChar.style.frameSize.height}\n`
    context += `Animations: ${activeChar.animations.length}\n`

    for (const anim of activeChar.animations) {
      context += `  - ${anim.name}: ${anim.frameCount} frames @ ${anim.fps}fps (${anim.status})\n`
    }
  }

  return context
}


const listCharactersTool: ToolDefinition = {
  name: "list_characters",
  description: "List all characters in the current project",
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async (): Promise<ToolResult> => {
    const state = useProjectStore.getState()
    if (!state.project) {
      return { success: false, error: "No project open" }
    }
    const characters = state.project.characters.map((c) => ({
      id: c.id,
      name: c.name,
      artStyle: c.style.artStyle,
      animationCount: c.animations.length,
    }))
    return { success: true, data: characters }
  },
}

const getProjectInfoTool: ToolDefinition = {
  name: "get_project_info",
  description: "Get information about the current project",
  parameters: {
    type: "object",
    properties: {},
  },
  execute: async (): Promise<ToolResult> => {
    const state = useProjectStore.getState()
    if (!state.project) {
      return { success: false, error: "No project open" }
    }
    return {
      success: true,
      data: {
        name: state.project.name,
        characters: state.project.characters.length,
        settings: state.project.settings,
      },
    }
  },
}

export const generalSkill: Skill = {
  name: "general",
  description: "General-purpose Mova AI assistant for character animation",
  systemPrompt: GENERAL_SYSTEM_PROMPT,
  tools: [listCharactersTool, getProjectInfoTool, generateImageTool, createCharacterTool],
  buildContext: buildGeneralContext,
}
