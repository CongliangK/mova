import { useSettingsStore } from "../../../stores/settings-store"
import type { ImageGenProvider, ImageProviderId } from "../../../types/ai"
import { SuchuangProvider } from "../providers/image-gen"
import { getAvailableImageProviderIds, getImageProviderPreset, isImageProviderAvailable } from "../providers/image-gen/provider-registry"

type ImageProviderResult =
  | { success: true; provider: ImageGenProvider }
  | { success: false; error: string }

interface ImageProviderConstructorConfig {
  apiKey: string
  model: string
  baseUrl: string | undefined
}

type ImageProviderConstructor = (config: ImageProviderConstructorConfig) => ImageGenProvider

const IMAGE_PROVIDER_CONSTRUCTORS: Partial<Record<ImageProviderId, ImageProviderConstructor>> = {
  suchuang: (config) =>
    new SuchuangProvider({
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl,
    }),
}

export function createImageProvider(): ImageProviderResult {
  const config = useSettingsStore.getState().imageGenConfig

  const preset = getImageProviderPreset(config.provider)
  if (!preset?.available || !isImageProviderAvailable(config.provider)) {
    return {
      success: false,
      error: `Unsupported image provider: ${config.provider}. Supported providers: ${getAvailableImageProviderIds().join(", ")}.`,
    }
  }

  if (!config.apiKey) {
    return {
      success: false,
      error: "Image generation API key not configured. Please set it in Settings.",
    }
  }

  const providerConstructor = IMAGE_PROVIDER_CONSTRUCTORS[config.provider]
  if (!providerConstructor) {
    return {
      success: false,
      error: `Image provider ${preset.name} is listed as available but has no runtime constructor registered.`,
    }
  }

  return {
    success: true,
    provider: providerConstructor({
      apiKey: config.apiKey,
      model: config.model || preset.defaultModel,
      baseUrl: config.baseUrl || preset.defaultBaseUrl || undefined,
    }),
  }
}
