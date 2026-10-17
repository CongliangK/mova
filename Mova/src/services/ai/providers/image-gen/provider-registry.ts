import type { GenerationProviderModality, ImageProviderId } from "../../../../types/ai"

export type ImageProviderModality = Extract<GenerationProviderModality, "image">
export type ImageProviderCapability = "text-to-image" | "reference-image"
export type ImageProviderStatus = "available" | "unavailable" | "proposal-pending"

export interface ImageProviderPreset {
  id: ImageProviderId
  name: string
  modality: ImageProviderModality
  capabilities: readonly ImageProviderCapability[]
  available: boolean
  status: ImageProviderStatus
  defaultModel: string
  defaultBaseUrl: string | null
  unavailableReason: string | null
  supportedModels: readonly { id: string; label: string }[]
}

export const IMAGE_PROVIDER_PRESETS = [
  {
    id: "suchuang",
    name: "SuChuang (速创)",
    modality: "image",
    capabilities: ["text-to-image", "reference-image"],
    available: true,
    status: "available",
    defaultModel: "nanobanana",
    defaultBaseUrl: "https://api.wuyinkeji.com",
    unavailableReason: null,
    supportedModels: [
      { id: "nanobanana", label: "NanoBanana2 (Gemini)" },
      { id: "gpt-image", label: "GPT-Image-2" },
    ],
  },
  {
    id: "dall-e",
    name: "DALL-E",
    modality: "image",
    capabilities: ["text-to-image"],
    available: false,
    status: "unavailable",
    defaultModel: "dall-e-3",
    defaultBaseUrl: null,
    unavailableReason: "Not implemented in Mova yet.",
    supportedModels: [],
  },
  {
    id: "stability",
    name: "Stability AI",
    modality: "image",
    capabilities: ["text-to-image"],
    available: false,
    status: "unavailable",
    defaultModel: "stable-image",
    defaultBaseUrl: null,
    unavailableReason: "Not implemented in Mova yet.",
    supportedModels: [],
  },
  {
    id: "sedans-image",
    name: "Sedans Image",
    modality: "image",
    capabilities: ["text-to-image", "reference-image"],
    available: false,
    status: "proposal-pending",
    defaultModel: "proposal-pending",
    defaultBaseUrl: null,
    unavailableReason: "Proposal pending; no endpoint or runtime implementation.",
    supportedModels: [],
  },
] as const satisfies readonly ImageProviderPreset[]

export const IMAGE_PROVIDER_PRESET_BY_ID = Object.fromEntries(
  IMAGE_PROVIDER_PRESETS.map((preset) => [preset.id, preset])
) as unknown as Record<ImageProviderId, ImageProviderPreset>

export function getImageProviderPreset(provider: string): ImageProviderPreset | null {
  return IMAGE_PROVIDER_PRESETS.find((preset) => preset.id === provider) ?? null
}

export function getAvailableImageProviderIds(): ImageProviderId[] {
  return IMAGE_PROVIDER_PRESETS.filter((preset) => preset.available).map((preset) => preset.id)
}

export function isImageProviderAvailable(provider: string): boolean {
  return getImageProviderPreset(provider)?.available === true
}

export function getImageProviderDisplayName(provider: string): string {
  return getImageProviderPreset(provider)?.name ?? provider
}
