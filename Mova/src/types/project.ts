import type { Animation } from "./animation"

export interface Project {
  id: string
  name: string
  version: number
  createdAt: string
  updatedAt: string
  characters: Character[]
  activeCharacterId: string | null
  settings: ProjectSettings
  assetRegistry?: AssetRegistry
  extra?: Record<string, unknown>
}

/** Known kinds are documented in docs/asset-registry-schema-v1.md; future kinds are allowed. */
export type AssetRegistryAssetKind = string

/** Known statuses are pending/processing/complete/failed/missing/deleted; future statuses are allowed. */
export type AssetRegistryAssetStatus = string

/** Known source types include user_import, existing_project_data, ai_tool, processing_step, and export_flow. */
export type AssetRegistrySourceType = string

export interface AssetRegistryFile {
  role: string
  path: string
  mimeType?: string
  sizeBytes?: number
  exists?: boolean
  [key: string]: unknown
}

export interface AssetRegistrySource {
  type: AssetRegistrySourceType
  [key: string]: unknown
}

export interface AssetRegistryGeneration {
  provider?: string | null
  model?: string | null
  params?: Record<string, unknown>
  seed?: string | number | null
  jobRecordIds?: string[]
  [key: string]: unknown
}

export interface AssetRegistryAsset {
  id: string
  kind: AssetRegistryAssetKind
  status: AssetRegistryAssetStatus
  files: AssetRegistryFile[]
  source: AssetRegistrySource
  generation?: AssetRegistryGeneration | null
  manifests?: string[]
  metadata?: Record<string, unknown>
  relationships?: Record<string, unknown>
  tags?: string[]
  createdAt: string
  updatedAt: string
  [key: string]: unknown
}

export interface AssetRegistryManifest {
  id: string
  kind: string
  path: string
  schemaVersion?: string | number | null
  assetIds: string[]
  createdAt: string
  [key: string]: unknown
}

export interface AssetRegistry {
  schemaVersion: number
  assets: AssetRegistryAsset[]
  manifests: AssetRegistryManifest[]
  [key: string]: unknown
}

export interface ProjectSettings {
  defaultFrameWidth: number
  defaultFrameHeight: number
  defaultFps: number
  defaultArtStyle: string
}

export interface Character {
  id: string
  name: string
  description: string
  style: CharacterStyle
  baseImagePath: string | null
  animations: Animation[]
  tags: string[]
  createdAt: string
  updatedAt: string
  extra?: Record<string, unknown>
}

export interface CharacterStyle {
  artStyle: "pixel-art" | "cartoon" | "anime" | "realistic"
  colorPalette: string[]
  frameSize: { width: number; height: number }
  referenceDescription: string
}

export type ArtStyle = CharacterStyle["artStyle"]

type RustArtStyle = CharacterStyle["artStyle"]

export interface RustProjectData {
  id: string
  name: string
  version: number
  created_at: string
  updated_at: string
  characters?: RustCharacterData[]
  active_character_id?: string | null
  settings?: RustProjectSettingsData
  assetRegistry?: AssetRegistry
  [key: string]: unknown
}

export interface RustProjectSettingsData {
  default_frame_width?: number
  default_frame_height?: number
  default_fps?: number
  default_art_style?: string
}

export interface RustCharacterData {
  id: string
  name: string
  description: string
  style?: Partial<CharacterStyle> | null
  base_image_path: string | null
  animations?: Animation[]
  tags?: string[]
  created_at: string
  updated_at: string
  [key: string]: unknown
}

const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  defaultFrameWidth: 64,
  defaultFrameHeight: 64,
  defaultFps: 12,
  defaultArtStyle: "pixel-art",
}

function isArtStyle(value: string | undefined): value is RustArtStyle {
  return value === "pixel-art" || value === "cartoon" || value === "anime" || value === "realistic"
}

function mapRustSettings(settings: RustProjectSettingsData | undefined): ProjectSettings {
  return {
    defaultFrameWidth: settings?.default_frame_width ?? DEFAULT_PROJECT_SETTINGS.defaultFrameWidth,
    defaultFrameHeight: settings?.default_frame_height ?? DEFAULT_PROJECT_SETTINGS.defaultFrameHeight,
    defaultFps: settings?.default_fps ?? DEFAULT_PROJECT_SETTINGS.defaultFps,
    defaultArtStyle: settings?.default_art_style ?? DEFAULT_PROJECT_SETTINGS.defaultArtStyle,
  }
}

function defaultCharacterStyle(settings: ProjectSettings): CharacterStyle {
  return {
    artStyle: isArtStyle(settings.defaultArtStyle) ? settings.defaultArtStyle : "pixel-art",
    colorPalette: [],
    frameSize: {
      width: settings.defaultFrameWidth,
      height: settings.defaultFrameHeight,
    },
    referenceDescription: "",
  }
}

function mapRustCharacter(character: RustCharacterData, settings: ProjectSettings): Character {
  const {
    id,
    name,
    description,
    style,
    base_image_path,
    animations,
    tags,
    created_at,
    updated_at,
    ...extra
  } = character
  const fallbackStyle = defaultCharacterStyle(settings)

  return {
    id,
    name,
    description,
    style: {
      artStyle: style?.artStyle ?? fallbackStyle.artStyle,
      colorPalette: style?.colorPalette ?? fallbackStyle.colorPalette,
      frameSize: style?.frameSize ?? fallbackStyle.frameSize,
      referenceDescription: style?.referenceDescription ?? fallbackStyle.referenceDescription,
    },
    baseImagePath: base_image_path,
    animations: animations ?? [],
    tags: tags ?? [],
    createdAt: created_at,
    updatedAt: updated_at,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  }
}

export function mapRustProject(data: RustProjectData): Project {
  const {
    id,
    name,
    version,
    created_at,
    updated_at,
    characters,
    active_character_id,
    settings: rustSettings,
    assetRegistry,
    ...extra
  } = data
  const settings = mapRustSettings(rustSettings)

  return {
    id,
    name,
    version,
    createdAt: created_at,
    updatedAt: updated_at,
    characters: (characters ?? []).map((character) => mapRustCharacter(character, settings)),
    activeCharacterId: active_character_id ?? null,
    settings,
    ...(assetRegistry !== undefined ? { assetRegistry } : {}),
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  }
}

export function serializeProjectForRust(project: Project): RustProjectData {
  return {
    ...project.extra,
    id: project.id,
    name: project.name,
    version: project.version,
    created_at: project.createdAt,
    updated_at: new Date().toISOString(),
    characters: project.characters.map((character) => ({
      ...character.extra,
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
    active_character_id: project.activeCharacterId,
    settings: {
      default_frame_width: project.settings.defaultFrameWidth,
      default_frame_height: project.settings.defaultFrameHeight,
      default_fps: project.settings.defaultFps,
      default_art_style: project.settings.defaultArtStyle,
    },
    ...(project.assetRegistry !== undefined ? { assetRegistry: project.assetRegistry } : {}),
  }
}
