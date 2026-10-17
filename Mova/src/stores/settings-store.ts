import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { LLMConfig, ImageGenConfig, VideoGenConfig } from "../types/ai"
import type { Locale } from "../i18n/types"
import { IMAGE_PROVIDER_PRESET_BY_ID } from "../services/ai/providers/image-gen/provider-registry"
import { createDefaultLlmConfig, LLM_PROVIDER_PRESETS } from "../services/ai/providers/llm/provider-registry"

export const APP_ZOOM_MIN_LEVEL = -5
export const APP_ZOOM_MAX_LEVEL = 5
export const APP_ZOOM_BASE_SCALE = 0.75
const APP_ZOOM_STEP = 1.1

export function clampAppZoomLevel(level: number): number {
  return Math.min(APP_ZOOM_MAX_LEVEL, Math.max(APP_ZOOM_MIN_LEVEL, Math.trunc(level)))
}

export function getAppZoomScale(level: number): number {
  return APP_ZOOM_BASE_SCALE * (APP_ZOOM_STEP ** clampAppZoomLevel(level))
}

export interface EditorSettings {
  defaultFrameWidth: number
  defaultFrameHeight: number
  defaultFps: number
  defaultArtStyle: "pixel_art" | "clean_hd" | "pixel_inspired" | "retro_pixel"
  gridSize: 8 | 16 | 32 | 0
  canvasBackground: "checkerboard" | "solid_white" | "solid_black" | "transparent"
}

export interface ExportSettings {
  defaultFormat: "png" | "webp" | "gif"
  defaultColumns: number
  frameSpacing: number
  transparentBackground: boolean
  enginePreset: "none" | "godot" | "unity" | "generic"
}

export interface SettingsState {
  theme: "dark" | "light"
  locale: Locale
  appZoomLevel: number
  llmConfigs: LLMConfig[]
  activeLlmIndex: number
  imageGenConfig: ImageGenConfig
  videoGenConfig: VideoGenConfig
  editorSettings: EditorSettings
  exportSettings: ExportSettings
  recentProjects: { name: string; path: string }[]

  setTheme: (theme: "dark" | "light") => void
  setLocale: (locale: Locale) => void
  zoomAppIn: () => void
  zoomAppOut: () => void
  resetAppZoom: () => void
  setLlmConfigs: (configs: LLMConfig[]) => void
  setActiveLlm: (index: number) => void
  setImageGenConfig: (config: Partial<ImageGenConfig>) => void
  setVideoGenConfig: (config: Partial<VideoGenConfig>) => void
  setEditorSettings: (settings: Partial<EditorSettings>) => void
  setExportSettings: (settings: Partial<ExportSettings>) => void
  addLlmConfig: (config: LLMConfig) => void
  removeLlmConfig: (index: number) => void
  addRecentProject: (name: string, path: string) => void
  removeRecentProject: (path: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      locale: "zh-CN",
      appZoomLevel: 0,
      llmConfigs: LLM_PROVIDER_PRESETS.map((preset) => createDefaultLlmConfig(preset.id)),
      activeLlmIndex: 0,
      imageGenConfig: {
        provider: "suchuang",
        model: IMAGE_PROVIDER_PRESET_BY_ID.suchuang.defaultModel,
        apiKey: null,
        // Set explicitly by user — no default third-party endpoint
        baseUrl: null,
        defaultParams: {},
      },
      videoGenConfig: {
        provider: "sedans-video",
        model: "proposal-pending",
        apiKey: null,
        baseUrl: null,
        defaultParams: {},
      },
      editorSettings: {
        defaultFrameWidth: 64,
        defaultFrameHeight: 64,
        defaultFps: 12,
        defaultArtStyle: "pixel_art",
        gridSize: 16,
        canvasBackground: "checkerboard",
      },
      exportSettings: {
        defaultFormat: "png",
        defaultColumns: 4,
        frameSpacing: 0,
        transparentBackground: true,
        enginePreset: "none",
      },
      recentProjects: [],

      setTheme: (theme) => set({ theme }),

      setLocale: (locale) => set({ locale }),

      zoomAppIn: () =>
        set((state) => ({
          appZoomLevel: clampAppZoomLevel(state.appZoomLevel + 1),
        })),

      zoomAppOut: () =>
        set((state) => ({
          appZoomLevel: clampAppZoomLevel(state.appZoomLevel - 1),
        })),

      resetAppZoom: () => set({ appZoomLevel: 0 }),

      setLlmConfigs: (configs) =>
        set((state) => ({
          llmConfigs: configs,
          activeLlmIndex: Math.min(state.activeLlmIndex, Math.max(0, configs.length - 1)),
        })),

      setActiveLlm: (index) =>
        set((state) => ({
          activeLlmIndex: Math.max(0, Math.min(index, Math.max(0, state.llmConfigs.length - 1))),
        })),

      addLlmConfig: (config) =>
        set((state) => ({
          llmConfigs: [...state.llmConfigs, config],
        })),

      removeLlmConfig: (index) =>
        set((state) => {
          const newConfigs = state.llmConfigs.filter((_, i) => i !== index)
          const newActive =
            state.activeLlmIndex >= newConfigs.length
              ? Math.max(0, newConfigs.length - 1)
              : state.activeLlmIndex
          return { llmConfigs: newConfigs, activeLlmIndex: newActive }
        }),

      setImageGenConfig: (config) =>
        set((state) => ({
          imageGenConfig: { ...state.imageGenConfig, ...config },
        })),

      setVideoGenConfig: (config) =>
        set((state) => ({
          videoGenConfig: { ...state.videoGenConfig, ...config },
        })),

      setEditorSettings: (settings) =>
        set((state) => ({
          editorSettings: { ...state.editorSettings, ...settings },
        })),

      setExportSettings: (settings) =>
        set((state) => ({
          exportSettings: { ...state.exportSettings, ...settings, transparentBackground: true },
        })),

      addRecentProject: (name, path) =>
        set((state) => {
          const filtered = state.recentProjects.filter((p) => p.path !== path)
          return { recentProjects: [{ name, path }, ...filtered].slice(0, 10) }
        }),

      removeRecentProject: (path) =>
        set((state) => ({
          recentProjects: state.recentProjects.filter((p) => p.path !== path),
        })),
    }),
    {
      name: "mova-settings",
      version: 6,
      migrate: (persisted: unknown, version: number) => {
        const state = (persisted ?? {}) as Partial<SettingsState>
        const appZoomLevel =
          version < 2 || typeof state.appZoomLevel !== "number"
            ? 0
            : clampAppZoomLevel(state.appZoomLevel)

        const existingConfigs = Array.isArray(state.llmConfigs) ? state.llmConfigs : []
        const missingConfigs = LLM_PROVIDER_PRESETS
          .filter((preset) => !existingConfigs.some((config) => config.provider === preset.id))
          .map((preset) => createDefaultLlmConfig(preset.id))

        const locale: Locale = state.locale === "en-US" || state.locale === "zh-CN" ? state.locale : "zh-CN"
        const exportSettings = state.exportSettings
          ? { ...state.exportSettings, transparentBackground: true }
          : undefined

        const videoGenConfig =
          version < 6 || !state.videoGenConfig
            ? {
                provider: "sedans-video" as const,
                model: "proposal-pending",
                apiKey: null,
                baseUrl: null,
                defaultParams: {},
              }
            : state.videoGenConfig

        return {
          ...state,
          locale,
          appZoomLevel,
          llmConfigs: [...existingConfigs, ...missingConfigs],
          videoGenConfig,
          ...(exportSettings ? { exportSettings } : {}),
        } as SettingsState
      },
    }
  )
)
