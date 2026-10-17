import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { SettingsPage } from "../../src/pages/settings-page"
import {
  IMAGE_PROVIDER_PRESET_BY_ID,
  IMAGE_PROVIDER_PRESETS,
  getAvailableImageProviderIds,
} from "../../src/services/ai/providers/image-gen/provider-registry"
import {
  GENERATION_PROVIDER_CAPABILITY_MATRIX,
  getAvailableGenerationProviderIds,
  getGenerationProviderCapabilitiesByModality,
  getGenerationProviderCapability,
  isGenerationProviderRuntimeAvailable,
} from "../../src/services/ai/providers/generation-provider-capabilities"
import { useSettingsStore } from "../../src/stores/settings-store"

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

vi.mock("../../src/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}))

describe("Settings provider guards", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      llmConfigs: [
        {
          provider: "openai",
          model: "gpt-4o",
          apiKey: null,
          baseUrl: null,
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2048,
          frequencyPenalty: 0,
          systemPrompt: null,
        },
        {
          provider: "anthropic",
          model: "claude-3-5-sonnet",
          apiKey: null,
          baseUrl: null,
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2048,
          frequencyPenalty: 0,
          systemPrompt: null,
        },
      ],
      activeLlmIndex: 0,
      imageGenConfig: {
        provider: "suchuang",
        model: "nanobanana",
        apiKey: null,
        baseUrl: null,
        defaultParams: {},
      },
    })
  })

  it("exposes supported LLM provider choices", () => {
    render(<SettingsPage onClose={vi.fn()} />)

    expect(screen.getByRole("combobox")).toHaveTextContent(/OpenAI/i)
    expect(screen.getByRole("button", { name: /Anthropic Claude/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /DeepSeek/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /通义千问/i })).toBeEnabled()
  })

  it("defines central image provider availability metadata", () => {
    expect(IMAGE_PROVIDER_PRESETS.map((provider) => provider.id)).toEqual([
      "suchuang",
      "dall-e",
      "stability",
      "sedans-image",
    ])
    expect(getAvailableImageProviderIds()).toEqual(["suchuang"])
    expect(IMAGE_PROVIDER_PRESET_BY_ID.suchuang).toMatchObject({
      name: "SuChuang (速创)",
      modality: "image",
      available: true,
      status: "available",
      defaultModel: "nanobanana",
      defaultBaseUrl: "https://api.wuyinkeji.com",
    })
    expect(IMAGE_PROVIDER_PRESET_BY_ID.suchuang.capabilities).toContain("text-to-image")
    expect(IMAGE_PROVIDER_PRESET_BY_ID["dall-e"].available).toBe(false)
    expect(IMAGE_PROVIDER_PRESET_BY_ID.stability.available).toBe(false)
    expect(IMAGE_PROVIDER_PRESET_BY_ID["sedans-image"]).toMatchObject({
      modality: "image",
      available: false,
      status: "proposal-pending",
      defaultBaseUrl: null,
    })
    expect(IMAGE_PROVIDER_PRESET_BY_ID["dall-e"].unavailableReason).toBeTruthy()
    expect(IMAGE_PROVIDER_PRESET_BY_ID.stability.unavailableReason).toBeTruthy()
    expect(IMAGE_PROVIDER_PRESET_BY_ID["sedans-image"].unavailableReason).toContain("Proposal pending")
  })

  it("distinguishes LLM, image, and reserved video provider modalities", () => {
    expect(getGenerationProviderCapabilitiesByModality("llm").map((provider) => provider.id)).toContain("openai")
    expect(getGenerationProviderCapabilitiesByModality("image").map((provider) => provider.id)).toEqual([
      "suchuang",
      "dall-e",
      "stability",
      "sedans-image",
    ])
    expect(getGenerationProviderCapabilitiesByModality("video").map((provider) => provider.id)).toEqual([
      "sedans-video",
    ])
    expect(new Set(GENERATION_PROVIDER_CAPABILITY_MATRIX.map((provider) => provider.modality))).toEqual(
      new Set(["llm", "image", "video"])
    )
  })

  it("keeps planned Sedans entries unavailable for runtime selection", () => {
    expect(getAvailableGenerationProviderIds("image")).toEqual(["suchuang"])
    expect(getAvailableGenerationProviderIds("video")).toEqual([])
    expect(isGenerationProviderRuntimeAvailable("sedans-image")).toBe(false)
    expect(isGenerationProviderRuntimeAvailable("sedans-video")).toBe(false)
    expect(getGenerationProviderCapability("sedans-image")).toMatchObject({
      modality: "image",
      status: "proposal-pending",
      runtimeAvailable: false,
      defaultModel: null,
      defaultBaseUrl: null,
    })
    expect(getGenerationProviderCapability("sedans-video")).toMatchObject({
      modality: "video",
      status: "proposal-pending",
      runtimeAvailable: false,
      defaultModel: null,
      defaultBaseUrl: null,
    })
  })

  it("shows read-only provider capability status grouped by modality", () => {
    render(<SettingsPage onClose={vi.fn()} />)

    const panel = screen.getByRole("region", { name: "服务商能力状态" })
    expect(within(panel).getByRole("heading", { name: "对话 / LLM" })).toBeVisible()
    expect(within(panel).getByRole("heading", { name: "图片" })).toBeVisible()
    expect(within(panel).getByRole("heading", { name: "视频" })).toBeVisible()

    expect(within(panel).getByLabelText("SuChuang (速创) 运行可用")).toHaveTextContent("参考图")
    expect(within(panel).getByLabelText("Sedans Image 计划中 / 不可用")).toHaveTextContent("文生图")
    expect(within(panel).getByLabelText("Sedans Image 计划中 / 不可用")).toHaveTextContent("参考图")
    expect(within(panel).getByLabelText("Sedans Video 计划中 / 不可用")).toHaveTextContent("文生视频")
  })

  it("disables unimplemented image generation providers", () => {
    render(<SettingsPage onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /图片生成/i }))

    expect(screen.getByRole("option", { name: /SuChuang \(速创\)/i })).toBeEnabled()
    expect(screen.getByRole("option", { name: /DALL-E \(不可用\)/i })).toBeDisabled()
    expect(screen.getByRole("option", { name: /Stability AI \(不可用\)/i })).toBeDisabled()
    expect(screen.getByRole("option", { name: /Sedans Image \(不可用\)/i })).toBeDisabled()
  })
})
