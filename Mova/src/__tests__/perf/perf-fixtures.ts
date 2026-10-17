import type { ChatMessage } from "../../types/ai"
import type { Animation, Frame } from "../../types/animation"
import type { FileNode } from "../../types/file-tree"
import type { Character, Project, RustProjectData } from "../../types/project"

export type FixtureSize = "small" | "medium" | "large"

const SIZE_SCALE: Record<FixtureSize, number> = {
  small: 8,
  medium: 64,
  large: 256,
}

export function frameCountForSize(size: FixtureSize): number {
  return SIZE_SCALE[size]
}

export function createFrameFixture(index: number, prefix = "frame"): Frame {
  return {
    id: `${prefix}-${index}`,
    index,
    imagePath: `/tmp/mova-perf/assets/frames/${prefix}-${index}.png`,
    duration: null,
    description: `${prefix} ${index}`,
    sourceFrameId: null,
  }
}

export function createAnimationFixture(
  size: FixtureSize,
  overrides: Partial<Animation> = {},
): Animation {
  const frameCount = frameCountForSize(size)
  const frames = Array.from({ length: frameCount }, (_, index) =>
    createFrameFixture(index, overrides.id ?? `animation-${size}`),
  )

  return {
    id: `animation-${size}`,
    name: `Animation ${size}`,
    direction: "right",
    frameCount: frames.length,
    fps: 12,
    loop: true,
    status: "complete",
    frames,
    metadata: {
      motionDescription: `Fixture ${size}`,
      keyframeHints: [],
      generationParams: { fixtureSize: size },
    },
    ...overrides,
  }
}

export function createCharacterFixture(index: number, size: FixtureSize): Character {
  const now = "2026-01-01T00:00:00.000Z"
  return {
    id: `character-${index}`,
    name: `Character ${index}`,
    description: `Performance fixture character ${index}`,
    style: {
      artStyle: "pixel-art",
      colorPalette: ["#111111", "#eeeeee"],
      frameSize: { width: 64, height: 64 },
      referenceDescription: "deterministic fixture",
    },
    baseImagePath: `/tmp/mova-perf/assets/characters/character-${index}.png`,
    animations: [
      createAnimationFixture(size, { id: `character-${index}-idle`, name: "Idle" }),
      createAnimationFixture(size, { id: `character-${index}-run`, name: "Run" }),
    ],
    tags: ["fixture", size],
    createdAt: now,
    updatedAt: now,
  }
}

export function createProjectFixture(size: FixtureSize): Project {
  const characterCount = size === "large" ? 64 : size === "medium" ? 16 : 4
  const now = "2026-01-01T00:00:00.000Z"
  return {
    id: `project-${size}`,
    name: `Project ${size}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    characters: Array.from({ length: characterCount }, (_, index) =>
      createCharacterFixture(index, size),
    ),
    activeCharacterId: "character-0",
    settings: {
      defaultFrameWidth: 64,
      defaultFrameHeight: 64,
      defaultFps: 12,
      defaultArtStyle: "pixel-art",
    },
  }
}

export function createRustProjectFixture(size: FixtureSize): RustProjectData {
  const project = createProjectFixture(size)
  return {
    id: project.id,
    name: project.name,
    version: project.version,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    active_character_id: project.activeCharacterId,
    settings: {
      default_frame_width: project.settings.defaultFrameWidth,
      default_frame_height: project.settings.defaultFrameHeight,
      default_fps: project.settings.defaultFps,
      default_art_style: project.settings.defaultArtStyle,
    },
    characters: project.characters.map((character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
      style: character.style,
      base_image_path: character.baseImagePath,
      animations: character.animations,
      tags: character.tags,
      created_at: character.createdAt,
      updated_at: character.updatedAt,
    })),
  }
}

export function createChatMessageFixture(index: number, role: ChatMessage["role"]): ChatMessage {
  return {
    id: `message-${index}`,
    role,
    content: `Fixture message ${index} `.repeat(8),
    artifacts: [],
    toolCalls: null,
    timestamp: "2026-01-01T00:00:00.000Z",
  }
}

function createFileNode(path: string, name: string, isDirectory: boolean): FileNode {
  return {
    name,
    path,
    isDirectory,
    size: isDirectory ? undefined : 1024,
    modifiedAt: "2026-01-01T00:00:00.000Z",
    category: isDirectory ? "folder" : "asset",
  }
}

export function createFileTreeFixture(size: FixtureSize): FileNode[] {
  const topLevelCount = size === "large" ? 40 : size === "medium" ? 16 : 4
  const filesPerDirectory = size === "large" ? 40 : size === "medium" ? 24 : 8

  return Array.from({ length: topLevelCount }, (_, dirIndex) => {
    const directoryPath = `/tmp/mova-perf/assets/group-${dirIndex}`
    return {
      ...createFileNode(directoryPath, `group-${dirIndex}`, true),
      children: Array.from({ length: filesPerDirectory }, (_, fileIndex) => {
        const extension = fileIndex % 3 === 0 ? "png" : fileIndex % 3 === 1 ? "json" : "md"
        const name = `asset-${dirIndex}-${fileIndex}.${extension}`
        return createFileNode(`${directoryPath}/${name}`, name, false)
      }),
    }
  })
}
