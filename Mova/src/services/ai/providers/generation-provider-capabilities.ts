import type {
  GenerationProviderId,
  GenerationProviderModality,
  ImageProviderId,
  VideoProviderId,
} from "../../../types/ai"
import { IMAGE_PROVIDER_PRESETS } from "./image-gen/provider-registry"
import type { ImageProviderStatus } from "./image-gen/provider-registry"
import { LLM_PROVIDER_PRESETS } from "./llm/provider-registry"

export type GenerationProviderStatus = ImageProviderStatus

export type GenerationProviderCapability =
  | "chat"
  | "openai-compatible"
  | "local-models"
  | "text-to-image"
  | "reference-image"
  | "text-to-video"

export interface GenerationProviderCapabilityEntry {
  readonly id: GenerationProviderId
  readonly name: string
  readonly modality: GenerationProviderModality
  readonly capabilities: readonly GenerationProviderCapability[]
  readonly runtimeAvailable: boolean
  readonly status: GenerationProviderStatus
  readonly defaultModel: string | null
  readonly defaultBaseUrl: string | null
  readonly unavailableReason: string | null
}

const SEDANS_VIDEO_PROVIDER_ID = "sedans-video" satisfies VideoProviderId

const llmCapabilitiesFor = (
  preset: (typeof LLM_PROVIDER_PRESETS)[number]
): readonly GenerationProviderCapability[] => {
  if (preset.id === "ollama") return ["chat", "local-models"]
  if (preset.openAICompatible) return ["chat", "openai-compatible"]
  return ["chat"]
}

const imageDefaultModelForMatrix = (providerId: ImageProviderId, defaultModel: string): string | null =>
  providerId === "sedans-image" ? null : defaultModel

export const GENERATION_PROVIDER_CAPABILITY_MATRIX: readonly GenerationProviderCapabilityEntry[] = [
  ...LLM_PROVIDER_PRESETS.map((preset): GenerationProviderCapabilityEntry => ({
    id: preset.id,
    name: preset.name,
    modality: "llm",
    capabilities: llmCapabilitiesFor(preset),
    runtimeAvailable: true,
    status: "available",
    defaultModel: preset.defaultModel,
    defaultBaseUrl: preset.defaultBaseUrl,
    unavailableReason: null,
  })),
  ...IMAGE_PROVIDER_PRESETS.map((preset): GenerationProviderCapabilityEntry => ({
    id: preset.id,
    name: preset.name,
    modality: "image",
    capabilities: preset.capabilities,
    runtimeAvailable: preset.available,
    status: preset.status,
    defaultModel: imageDefaultModelForMatrix(preset.id, preset.defaultModel),
    defaultBaseUrl: preset.defaultBaseUrl,
    unavailableReason: preset.unavailableReason,
  })),
  {
    id: SEDANS_VIDEO_PROVIDER_ID,
    name: "Sedans Video",
    modality: "video",
    capabilities: ["text-to-video"],
    runtimeAvailable: false,
    status: "proposal-pending",
    defaultModel: null,
    defaultBaseUrl: null,
    unavailableReason: "Proposal pending; no endpoint or runtime implementation.",
  },
]

export function getGenerationProviderCapability(provider: string): GenerationProviderCapabilityEntry | null {
  return GENERATION_PROVIDER_CAPABILITY_MATRIX.find((entry) => entry.id === provider) ?? null
}

export function getGenerationProviderCapabilitiesByModality(
  modality: GenerationProviderModality
): GenerationProviderCapabilityEntry[] {
  return GENERATION_PROVIDER_CAPABILITY_MATRIX.filter((entry) => entry.modality === modality)
}

export function getAvailableGenerationProviderIds(modality?: GenerationProviderModality): GenerationProviderId[] {
  return GENERATION_PROVIDER_CAPABILITY_MATRIX.filter(
    (entry) => entry.runtimeAvailable && (!modality || entry.modality === modality)
  ).map((entry) => entry.id)
}

export function isGenerationProviderRuntimeAvailable(provider: string): boolean {
  return getGenerationProviderCapability(provider)?.runtimeAvailable === true
}
