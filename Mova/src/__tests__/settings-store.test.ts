import { beforeEach, describe, expect, it } from "vitest"
import {
  APP_ZOOM_BASE_SCALE,
  APP_ZOOM_MAX_LEVEL,
  APP_ZOOM_MIN_LEVEL,
  clampAppZoomLevel,
  getAppZoomScale,
  useSettingsStore,
} from "../../src/stores/settings-store"
import { createDefaultLlmConfig } from "../../src/services/ai/providers/llm/provider-registry"
import type { VideoGenConfig } from "../../src/types/ai"

describe("settings store app zoom", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      appZoomLevel: 0,
      exportSettings: {
        defaultFormat: "png",
        defaultColumns: 4,
        frameSpacing: 0,
        transparentBackground: true,
        enginePreset: "none",
      },
    })
  })

  it("uses discrete clamped zoom levels for app zoom actions", () => {
    useSettingsStore.getState().zoomAppIn()
    useSettingsStore.getState().zoomAppIn()
    useSettingsStore.getState().zoomAppOut()

    expect(useSettingsStore.getState().appZoomLevel).toBe(1)
    expect(getAppZoomScale(useSettingsStore.getState().appZoomLevel)).toBeCloseTo(APP_ZOOM_BASE_SCALE * 1.1)
  })

  it("clamps app zoom at VS Code-like bounds and resets to default", () => {
    for (let index = 0; index < 20; index += 1) {
      useSettingsStore.getState().zoomAppIn()
    }
    expect(useSettingsStore.getState().appZoomLevel).toBe(APP_ZOOM_MAX_LEVEL)
    expect(getAppZoomScale(APP_ZOOM_MAX_LEVEL)).toBeCloseTo(APP_ZOOM_BASE_SCALE * (1.1 ** APP_ZOOM_MAX_LEVEL))

    for (let index = 0; index < 20; index += 1) {
      useSettingsStore.getState().zoomAppOut()
    }
    expect(useSettingsStore.getState().appZoomLevel).toBe(APP_ZOOM_MIN_LEVEL)
    expect(clampAppZoomLevel(APP_ZOOM_MIN_LEVEL - 1)).toBe(APP_ZOOM_MIN_LEVEL)

    useSettingsStore.getState().resetAppZoom()
    expect(useSettingsStore.getState().appZoomLevel).toBe(0)
    expect(getAppZoomScale(0)).toBe(APP_ZOOM_BASE_SCALE)
  })

  it("does not persist an ignored opaque-background export setting", () => {
    useSettingsStore.getState().setExportSettings({ transparentBackground: false })

    expect(useSettingsStore.getState().exportSettings.transparentBackground).toBe(true)
  })
})

describe("settings store llm bounds", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      llmConfigs: [
        createDefaultLlmConfig("openai"),
        createDefaultLlmConfig("anthropic"),
        createDefaultLlmConfig("deepseek"),
      ],
      activeLlmIndex: 1,
    })
  })

  it("clamps setActiveLlm for negative index", () => {
    useSettingsStore.getState().setActiveLlm(-5)
    expect(useSettingsStore.getState().activeLlmIndex).toBe(0)
  })

  it("clamps setActiveLlm for index beyond array bounds", () => {
    useSettingsStore.getState().setActiveLlm(100)
    expect(useSettingsStore.getState().activeLlmIndex).toBe(2)
  })

  it("setActiveLlm with valid in-bounds index works normally", () => {
    useSettingsStore.getState().setActiveLlm(0)
    expect(useSettingsStore.getState().activeLlmIndex).toBe(0)

    useSettingsStore.getState().setActiveLlm(2)
    expect(useSettingsStore.getState().activeLlmIndex).toBe(2)
  })

  it("setLlmConfigs adjusts activeLlmIndex when new array is smaller", () => {
    useSettingsStore.getState().setLlmConfigs([createDefaultLlmConfig("openai")])
    expect(useSettingsStore.getState().activeLlmIndex).toBe(0)
    expect(useSettingsStore.getState().llmConfigs).toHaveLength(1)
  })

  it("setLlmConfigs keeps activeLlmIndex when within bounds of new array", () => {
    useSettingsStore.setState({ activeLlmIndex: 0 })
    useSettingsStore.getState().setLlmConfigs([
      createDefaultLlmConfig("openai"),
      createDefaultLlmConfig("anthropic"),
      createDefaultLlmConfig("deepseek"),
      createDefaultLlmConfig("ollama"),
    ])
    expect(useSettingsStore.getState().activeLlmIndex).toBe(0)
  })

  it("setActiveLlm handles empty llmConfigs gracefully", () => {
    useSettingsStore.setState({ llmConfigs: [], activeLlmIndex: 0 })
    useSettingsStore.getState().setActiveLlm(5)
    expect(useSettingsStore.getState().activeLlmIndex).toBe(0)
  })
})

describe("settings store videoGenConfig", () => {
  const expectedDefault: VideoGenConfig = {
    provider: "sedans-video",
    model: "proposal-pending",
    apiKey: null,
    baseUrl: null,
    defaultParams: {},
  }

  it("initializes videoGenConfig with expected defaults", () => {
    expect(useSettingsStore.getState().videoGenConfig).toEqual(expectedDefault)
  })

  it("setVideoGenConfig partially merges into videoGenConfig", () => {
    useSettingsStore.getState().setVideoGenConfig({ model: "test-model" })
    expect(useSettingsStore.getState().videoGenConfig).toEqual({
      ...expectedDefault,
      model: "test-model",
    })
    // Reset for other tests
    useSettingsStore.getState().setVideoGenConfig({ model: "proposal-pending" })
  })
})
