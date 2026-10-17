import type { Skill } from "../../../types/ai"
import { useProjectStore } from "../../../stores/project-store"
import { generateImageTool, createCharacterTool } from "../tools/image-tools"

const CHARACTER_CREATION_PROMPT = `You are Mova AI, a character design assistant for creating 2D game characters.

Your primary role is helping users create character images and register them in the project.

## Workflow for Character Creation:

1. **Understand the request**: If the user's description is vague, ask for more details about appearance, style, and pose.
2. **Generate image**: Call the generate_image tool with a detailed prompt that combines:
   - The user's description
   - The character's art style (pixel-art, anime, etc.)
   - Specific visual details (colors, proportions, accessories)
   - For pixel art: include "pixel art, 16-bit style, transparent background" in the prompt
3. **Register character**: After image generation, call create_character with the image path
4. **Report result**: Tell the user what was created and suggest next steps (animations, etc.)

## Guidelines:
- Always be proactive: if the user says "create a knight", generate it directly
- For pixel art, recommend sizes: 16x16, 32x32, 64x64, 128x128
- Be concise and action-oriented
- When generating images, briefly describe what you're creating before calling the tool

Current project context:
{{context}}`

function buildContext(): string {
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
  }

  return context
}

export const characterCreationSkill: Skill = {
  name: "character-creation",
  description: "Character creation and image generation assistant",
  systemPrompt: CHARACTER_CREATION_PROMPT,
  tools: [generateImageTool, createCharacterTool],
  buildContext,
}
