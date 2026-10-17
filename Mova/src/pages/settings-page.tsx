import { useEffect, useMemo, useRef, useState } from "react"
import {
  Activity,
  AlertCircle,
  Brain,
  Check,
  CheckCircle,
  Clipboard,
  Code2,
  Download,
  Globe,
  Image,
  Key,
  Moon,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  Sun,
  X,
  Zap,
} from "lucide-react"
import { useSettingsStore, type EditorSettings, type ExportSettings } from "../stores/settings-store"
import type {
  GenerationProviderModality,
  ImageProviderId,
  LLMConfig,
  LLMProviderId,
} from "../types/ai"
import {
  IMAGE_PROVIDER_PRESETS,
  getImageProviderDisplayName,
  getImageProviderPreset,
  isImageProviderAvailable,
} from "../services/ai/providers/image-gen/provider-registry"
import {
  getGenerationProviderCapabilitiesByModality,
  type GenerationProviderCapability,
  type GenerationProviderCapabilityEntry,
} from "../services/ai/providers/generation-provider-capabilities"
import {
  createDefaultLlmConfig,
  createLlmProvider,
  getProviderDisplayName,
  LLM_PROVIDER_PRESET_BY_ID,
  LLM_PROVIDER_PRESETS,
} from "../services/ai/providers/llm/provider-registry"
import { useTheme } from "../hooks/use-theme"
import { useToast } from "../hooks/use-toast"
import { Slider } from "../components/ui/slider"
import { Select } from "../components/ui/select"
import { localeOptions, useI18n, type Locale } from "../i18n"
import type { PerfDebugSnapshot } from "../utils/perf-debug"
import { getPerfDebugSnapshot } from "../utils/perf-debug"
import { buildLinuxDiagnosticsReport } from "../utils/diagnostics-report"

const SAVED_FEEDBACK_DURATION = 1500

type SettingsSection =
  | "general"
  | "appearance"
  | "ai"
  | "image"
  | "video"
  | "editor"
  | "export"
  | "diagnostics"
  | "shortcuts"
  | "json"

const availableShortcutKeys = [
  { keys: "Space", action: "shortcuts.playPause", note: "shortcuts.playPauseNote" },
  { keys: "Ctrl/Cmd+= or Ctrl/Cmd++", action: "shortcuts.zoomIn", note: "shortcuts.zoomInNote" },
  { keys: "Ctrl/Cmd+-", action: "shortcuts.zoomOut", note: "shortcuts.zoomOutNote" },
  { keys: "Ctrl/Cmd+0", action: "shortcuts.zoomReset", note: "shortcuts.zoomResetNote" },
  { keys: "Esc", action: "shortcuts.cancelCanvas", note: "shortcuts.cancelCanvasNote" },
]

const unavailableShortcutKeys = [
  { keys: "Ctrl/Cmd+Z", action: "shortcuts.undo", reason: "shortcuts.historyNotConnected" },
  { keys: "Ctrl/Cmd+Shift+Z", action: "shortcuts.redo", reason: "shortcuts.historyNotConnected" },
  { keys: "Ctrl/Cmd+S", action: "shortcuts.saveProject", reason: "shortcuts.autoSave" },
  { keys: "Ctrl/Cmd+E", action: "shortcuts.export", reason: "shortcuts.exportNeedsOptions" },
]

const providerCapabilityGroups: readonly {
  modality: GenerationProviderModality
  titleKey: string
  descriptionKey: string
}[] = [
  {
    modality: "llm",
    titleKey: "settings.providerCapabilities.llm",
    descriptionKey: "settings.providerCapabilities.llmDesc",
  },
  {
    modality: "image",
    titleKey: "settings.providerCapabilities.image",
    descriptionKey: "settings.providerCapabilities.imageDesc",
  },
  {
    modality: "video",
    titleKey: "settings.providerCapabilities.video",
    descriptionKey: "settings.providerCapabilities.videoDesc",
  },
]

const capabilityLabelKeys: Record<GenerationProviderCapability, string> = {
  chat: "settings.providerCapabilities.capability.chat",
  "openai-compatible": "settings.providerCapabilities.capability.openaiCompatible",
  "local-models": "settings.providerCapabilities.capability.localModels",
  "text-to-image": "settings.providerCapabilities.capability.textToImage",
  "reference-image": "settings.providerCapabilities.capability.referenceImage",
  "text-to-video": "settings.providerCapabilities.capability.textToVideo",
}

interface SettingsPageProps {
  onClose: () => void
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-center gap-8 border-b border-[var(--color-border)] py-5 last:border-b-0">
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">{title}</h2>
      {subtitle && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{subtitle}</p>}
    </div>
  )
}

function getProviderStatusLabelKey(entry: GenerationProviderCapabilityEntry) {
  if (entry.runtimeAvailable) return "settings.providerCapabilities.status.available"
  if (entry.status === "proposal-pending") return "settings.providerCapabilities.status.proposalPending"
  return "settings.providerCapabilities.status.unavailable"
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const llmConfigs = useSettingsStore((s) => s.llmConfigs)
  const activeLlmIndex = useSettingsStore((s) => s.activeLlmIndex)
  const setLlmConfigs = useSettingsStore((s) => s.setLlmConfigs)
  const setActiveLlm = useSettingsStore((s) => s.setActiveLlm)
  const imageGenConfig = useSettingsStore((s) => s.imageGenConfig)
  const setImageGenConfig = useSettingsStore((s) => s.setImageGenConfig)
  const videoGenConfig = useSettingsStore((s) => s.videoGenConfig)
  const editorSettings = useSettingsStore((s) => s.editorSettings)
  const setEditorSettings = useSettingsStore((s) => s.setEditorSettings)
  const exportSettings = useSettingsStore((s) => s.exportSettings)
  const setExportSettings = useSettingsStore((s) => s.setExportSettings)
  const appZoomLevel = useSettingsStore((s) => s.appZoomLevel)
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)
  const { t } = useI18n()
  const { theme, toggle: toggleTheme } = useTheme()
  const { showToast } = useToast()

  const [activeSection, setActiveSection] = useState<SettingsSection>("ai")
  const [search, setSearch] = useState("")
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [saved, setSaved] = useState(false)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const [perfSnapshot, setPerfSnapshot] = useState<PerfDebugSnapshot | null>(null)
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentConfig = llmConfigs[activeLlmIndex] || llmConfigs[0] || createDefaultLlmConfig("openai")
  const currentPreset = LLM_PROVIDER_PRESET_BY_ID[currentConfig.provider]

  const navigation: {
    id: SettingsSection
    label: string
    icon: typeof Activity
    searchTerms?: string
  }[] = useMemo(
    () => [
      { id: "general" as const, label: t("settings.nav.general"), icon: Settings },
      { id: "appearance" as const, label: t("settings.nav.appearance"), icon: Sun },
      { id: "ai" as const, label: t("settings.nav.ai"), icon: Brain },
      { id: "image" as const, label: t("settings.nav.image"), icon: Image },
      { id: "video" as const, label: t("settings.nav.video"), icon: Zap },
      { id: "editor" as const, label: t("settings.nav.editor"), icon: Pencil },
      { id: "export" as const, label: t("settings.nav.export"), icon: Download },
      {
        id: "diagnostics" as const,
        label: t("settings.nav.diagnostics"),
        icon: Activity,
        searchTerms: "diagnostics performance linux 诊断 性能",
      },
      { id: "shortcuts" as const, label: t("settings.nav.shortcuts"), icon: Key },
      { id: "json" as const, label: t("settings.nav.json"), icon: Code2 },
    ],
    [t]
  )

  const filteredNavigation = navigation.filter((item) => {
    const query = search.trim().toLowerCase()
    if (query === "") return true
    return `${item.label} ${item.searchTerms ?? ""}`.toLowerCase().includes(query)
  })

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    }
  }, [])

  const inputClass =
    "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]/30"
  const buttonClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] disabled:cursor-not-allowed disabled:opacity-50"

  const formatSettingsJson = () =>
    JSON.stringify(
      {
        theme,
        appZoomLevel,
        activeLlmIndex,
        llmConfigs,
        imageGenConfig,
        videoGenConfig,
        editorSettings,
        exportSettings,
        locale,
      },
      null,
      2
    )

  const openJsonSettings = () => {
    setActiveSection("json")
    setJsonError(null)
    setJsonText(formatSettingsJson())
  }

  const flashSaved = () => {
    setSaved(true)
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSaved(false), SAVED_FEEDBACK_DURATION)
  }

  const updateConfig = (updates: Partial<LLMConfig>) => {
    const safeIndex = Math.max(0, activeLlmIndex)
    const newConfigs = llmConfigs.length > 0 ? [...llmConfigs] : [currentConfig]
    newConfigs[safeIndex] = { ...newConfigs[safeIndex], ...updates }
    setLlmConfigs(newConfigs)
  }

  const selectProvider = (provider: LLMProviderId) => {
    setTestResult(null)
    setModels([])
    const existingIndex = llmConfigs.findIndex((config) => config.provider === provider)
    if (existingIndex >= 0) {
      setActiveLlm(existingIndex)
      return
    }
    setLlmConfigs([...llmConfigs, createDefaultLlmConfig(provider)])
    setActiveLlm(llmConfigs.length)
  }

  const buildProvider = () => createLlmProvider(currentConfig).provider

  const handleTestConnection = async () => {
    const providerSetup = createLlmProvider(currentConfig)
    if (!providerSetup.provider) {
      setTestResult(providerSetup.error || t("settings.ai.providerNotConfigured"))
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const valid = await providerSetup.provider.validateConnection()
      setTestResult(valid ? t("settings.ai.connectionSuccess") : t("settings.ai.connectionFailed"))
    } catch (err) {
      setTestResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(false)
    }
  }

  const handleFetchModels = async () => {
    const provider = buildProvider()
    if (!provider) {
      setModels([])
      showToast("error", t("settings.ai.notFullyConfigured", { provider: getProviderDisplayName(currentConfig.provider) }))
      return
    }
    setLoadingModels(true)
    try {
      const list = await provider.listModels()
      setModels(list)
    } catch (err) {
      setModels([])
      showToast("error", t("settings.ai.fetchModelsFailed", { message: err instanceof Error ? err.message : String(err) }))
    } finally {
      setLoadingModels(false)
    }
  }

  const applyJsonSettings = () => {
    try {
      const parsed = JSON.parse(jsonText)

      // Validate llmConfigs entries and filter to those with known providers
      let finalLlmConfigs = llmConfigs
      if (Array.isArray(parsed.llmConfigs)) {
        finalLlmConfigs = parsed.llmConfigs.filter(
          (c: unknown): c is LLMConfig =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as LLMConfig).provider === "string" &&
            (c as LLMConfig).provider in LLM_PROVIDER_PRESET_BY_ID,
        )
        if (finalLlmConfigs.length === 0) {
          setJsonError(
            "No valid LLM configs found in imported settings. Each config entry must have a 'provider' field with a supported provider ID.",
          )
          return
        }
      }

      // Clamp activeLlmIndex to valid bounds relative to llmConfigs
      let finalActiveLlmIndex = activeLlmIndex
      if (typeof parsed.activeLlmIndex === "number") {
        if (finalLlmConfigs.length === 0) {
          finalActiveLlmIndex = 0
        } else {
          finalActiveLlmIndex = Math.max(0, Math.min(parsed.activeLlmIndex, finalLlmConfigs.length - 1))
        }
      } else if (finalLlmConfigs.length > 0 && activeLlmIndex >= finalLlmConfigs.length) {
        // activeLlmIndex not in parsed JSON, but existing index is out of bounds with new configs
        finalActiveLlmIndex = 0
      }

      useSettingsStore.setState({
        theme: parsed.theme === "dark" ? "dark" : "light",
        appZoomLevel: typeof parsed.appZoomLevel === "number" ? parsed.appZoomLevel : appZoomLevel,
        activeLlmIndex: finalActiveLlmIndex,
        llmConfigs: finalLlmConfigs,
        imageGenConfig: parsed.imageGenConfig ?? imageGenConfig,
        videoGenConfig: parsed.videoGenConfig ?? videoGenConfig,
        editorSettings: parsed.editorSettings ?? editorSettings,
        exportSettings: parsed.exportSettings ?? exportSettings,
        locale: parsed.locale === "en-US" || parsed.locale === "zh-CN" ? parsed.locale : locale,
      })
      setJsonError(null)
      flashSaved()
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : String(err))
    }
  }

  const currentImageProviderPreset = getImageProviderPreset(imageGenConfig.provider)
  const unsupportedImageMessage = !isImageProviderAvailable(imageGenConfig.provider)
    ? t("settings.image.unsupported", { provider: getImageProviderDisplayName(imageGenConfig.provider) })
    : null

  const renderProviderCapabilityPanel = () => (
    <section
      aria-label={t("settings.providerCapabilities.title")}
      className="mb-8 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)]"
    >
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          {t("settings.providerCapabilities.title")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">
          {t("settings.providerCapabilities.subtitle")}
        </p>
      </div>
      <div className="space-y-5 p-4">
        {providerCapabilityGroups.map((group) => {
          const entries = getGenerationProviderCapabilitiesByModality(group.modality)
          return (
            <section key={group.modality} aria-labelledby={`provider-capability-${group.modality}`}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h4
                    id={`provider-capability-${group.modality}`}
                    className="text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    {t(group.titleKey)}
                  </h4>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{t(group.descriptionKey)}</p>
                </div>
                <span className="rounded bg-[var(--color-bg-subtle)] px-2 py-1 text-[10px] text-[var(--color-text-muted)]">
                  {t("settings.providerCapabilities.providerCount", { count: entries.length })}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {entries.map((entry) => {
                  const statusLabel = t(getProviderStatusLabelKey(entry))
                  return (
                    <article
                      key={entry.id}
                      aria-label={`${entry.name} ${statusLabel}`}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-medium text-[var(--color-text-primary)]">{entry.name}</h5>
                          <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{entry.id}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded px-2 py-1 text-[10px] ${
                            entry.runtimeAvailable
                              ? "bg-green-500/10 text-green-600"
                              : "bg-amber-500/10 text-amber-600"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {entry.capabilities.map((capability) => (
                          <span
                            key={capability}
                            className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]"
                          >
                            {t(capabilityLabelKeys[capability])}
                          </span>
                        ))}
                      </div>
                      {(entry.defaultModel || entry.defaultBaseUrl) && (
                        <dl className="mt-3 space-y-1 text-[11px] text-[var(--color-text-secondary)]">
                          {entry.defaultModel && (
                            <div className="flex gap-2">
                              <dt className="shrink-0 text-[var(--color-text-muted)]">
                                {t("settings.providerCapabilities.defaultModel")}
                              </dt>
                              <dd className="truncate font-mono">{entry.defaultModel}</dd>
                            </div>
                          )}
                          {entry.defaultBaseUrl && (
                            <div className="flex gap-2">
                              <dt className="shrink-0 text-[var(--color-text-muted)]">
                                {t("settings.providerCapabilities.defaultBaseUrl")}
                              </dt>
                              <dd className="truncate font-mono">{entry.defaultBaseUrl}</dd>
                            </div>
                          )}
                        </dl>
                      )}
                      {entry.unavailableReason && (
                        <p className="mt-3 text-xs leading-5 text-[var(--color-text-muted)]">{entry.unavailableReason}</p>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )

  const diagnosticsReport = useMemo(() => {
    if (activeSection !== "diagnostics") return ""
    return buildLinuxDiagnosticsReport({ perfSnapshot: perfSnapshot ?? undefined })
  }, [activeSection, perfSnapshot])

  const capturePerfSnapshot = () => {
    const snapshot = getPerfDebugSnapshot()
    if (!snapshot) {
      showToast("warning", t("settings.diagnostics.snapshotUnavailable"))
      return
    }
    setPerfSnapshot(snapshot)
    showToast("success", t("settings.diagnostics.snapshotCaptured"))
  }

  const copyDiagnosticsReport = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(diagnosticsReport)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = diagnosticsReport
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }
      setDiagnosticsCopied(true)
      window.setTimeout(() => setDiagnosticsCopied(false), 1200)
      showToast("success", t("settings.diagnostics.copySuccess"))
    } catch (err) {
      showToast("error", t("settings.diagnostics.copyFailed", { message: err instanceof Error ? err.message : String(err) }))
    }
  }

  const renderContent = () => {
    if (activeSection === "general") {
      return (
        <>
          <SectionTitle title={t("settings.general.title")} subtitle={t("settings.general.subtitle")} />
          <SettingRow title={t("settings.general.language")} description={t("settings.general.languageDesc")}>
            <Select
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
              options={localeOptions.map((option) => ({ value: option.value, label: option.label }))}
            />
          </SettingRow>
          <SettingRow title={t("settings.general.activeModel")} description={t("settings.general.activeModelDesc")}>
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2 text-sm text-[var(--color-text-primary)]">
              {getProviderDisplayName(currentConfig.provider)} · {currentConfig.model}
            </div>
          </SettingRow>
          <SettingRow title={t("settings.general.appZoom")} description={t("settings.general.appZoomDesc")}>
            <div className="text-sm text-[var(--color-text-secondary)]">{appZoomLevel === 0 ? t("common.default") : appZoomLevel}</div>
          </SettingRow>
        </>
      )
    }

    if (activeSection === "appearance") {
      return (
        <>
          <SectionTitle title={t("settings.appearance.title")} subtitle={t("settings.appearance.subtitle")} />
          <SettingRow title={t("settings.appearance.theme")} description={t("settings.appearance.themeDesc")}>
            <button onClick={toggleTheme} className={buttonClass}>
              {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
              {theme === "light" ? t("common.light") : t("common.dark")}
            </button>
          </SettingRow>
        </>
      )
    }

    if (activeSection === "ai") {
      return (
        <>
          <SectionTitle
            title={t("settings.ai.title")}
            subtitle={t("settings.ai.subtitle")}
          />
          {renderProviderCapabilityPanel()}
          <SettingRow title={t("settings.ai.provider")} description={t("settings.ai.providerDesc")}>
            <Select
              value={currentConfig.provider}
              onChange={(e) => selectProvider(e.target.value as LLMProviderId)}
              options={LLM_PROVIDER_PRESETS.map((preset) => ({
                value: preset.id,
                label: `${preset.name} · ${preset.region}`,
              }))}
            />
          </SettingRow>

          <div className="mb-5 grid grid-cols-2 gap-3">
            {LLM_PROVIDER_PRESETS.map((preset) => {
              const configured = llmConfigs.some((config) => config.provider === preset.id && (config.apiKey || preset.id === "ollama"))
              const active = currentConfig.provider === preset.id
              return (
                <button
                  key={preset.id}
                  onClick={() => selectProvider(preset.id)}
                  className={`rounded-lg border p-3 text-left ${
                    active
                      ? "border-[var(--color-accent)] bg-[var(--color-brand-red-soft)]"
                      : "border-[var(--color-border)] bg-[var(--color-bg-panel)] hover:bg-[var(--color-bg-hover)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{preset.name}</span>
                    <span className="rounded bg-[var(--color-bg-subtle)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-secondary)]">
                      {preset.region}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-text-secondary)]">{preset.description}</p>
                  <p className="mt-2 text-[10px] text-[var(--color-text-muted)]">
                    {configured ? t("common.configured") : t("common.preset")} · {preset.openAICompatible ? t("settings.ai.openAICompatible") : t("common.native")}
                  </p>
                </button>
              )
            })}
          </div>

          <SectionTitle title={t("settings.ai.configuration", { name: currentPreset.name })} />
          {currentConfig.provider !== "ollama" && (
            <SettingRow title={currentPreset.apiKeyLabel} description={t("settings.ai.apiKeyDesc")}>
              <div className="relative">
                <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
                <input
                  type="password"
                  value={currentConfig.apiKey || ""}
                  onChange={(e) => updateConfig({ apiKey: e.target.value || null })}
                  placeholder={t("settings.ai.apiKeyPlaceholder")}
                  className={`${inputClass} pl-9`}
                />
              </div>
            </SettingRow>
          )}
          <SettingRow title={t("settings.ai.model")} description={t("settings.ai.defaultModel", { model: currentPreset.defaultModel })}>
            <div className="flex gap-2">
              <input
                type="text"
                value={currentConfig.model}
                onChange={(e) => updateConfig({ model: e.target.value })}
                placeholder={currentPreset.defaultModel}
                className={inputClass}
              />
              <button onClick={handleFetchModels} disabled={loadingModels} className={buttonClass}>
                <RefreshCw size={14} className={loadingModels ? "animate-spin" : ""} />
              </button>
            </div>
            {models.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded-md border border-[var(--color-border)]">
                {models.map((model) => (
                  <button
                    key={model}
                    onClick={() => updateConfig({ model })}
                    className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
                  >
                    {model}
                  </button>
                ))}
              </div>
            )}
          </SettingRow>
          <SettingRow title={t("settings.ai.baseUrl")} description={t("settings.ai.baseUrlDesc")}>
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                type="text"
                value={currentConfig.baseUrl || ""}
                onChange={(e) => updateConfig({ baseUrl: e.target.value || null })}
                placeholder={currentPreset.defaultBaseUrl || t("settings.ai.providerDefault")}
                className={`${inputClass} pl-9`}
              />
            </div>
          </SettingRow>
          <SettingRow title={t("settings.ai.temperature")} description={t("settings.ai.temperatureDesc")}>
            <Slider
              min={0}
              max={2}
              step={0.1}
              value={currentConfig.temperature}
              onChange={(temperature) => updateConfig({ temperature })}
            />
          </SettingRow>
          <SettingRow title={t("settings.ai.connection")} description={t("settings.ai.connectionDesc")}>
            <div className="space-y-2">
              <button onClick={handleTestConnection} disabled={testing} className={buttonClass}>
                <Zap size={14} />
                {testing ? t("settings.ai.testing") : t("settings.ai.testConnection")}
              </button>
              {testResult && (
                <p className={`flex items-center gap-1 text-xs ${testResult.startsWith("Error") || testResult.includes("failed") || testResult.includes("required") ? "text-red-500" : "text-green-600"}`}>
                  {testResult.startsWith("Error") || testResult.includes("failed") || testResult.includes("required") ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                  {testResult}
                </p>
              )}
            </div>
          </SettingRow>
        </>
      )
    }

    if (activeSection === "image") {
      return (
        <>
          <SectionTitle title={t("settings.image.title")} subtitle={t("settings.image.subtitle")} />
          <SettingRow title={t("settings.ai.provider")} description={t("settings.image.providerDesc")}>
            <select
              value={imageGenConfig.provider}
              onChange={(e) => {
                const provider = e.target.value as ImageProviderId
                const preset = getImageProviderPreset(provider)
                if (!preset?.available) return
                setImageGenConfig({ provider, model: preset.defaultModel })
              }}
              className={inputClass}
            >
              {IMAGE_PROVIDER_PRESETS.map((provider) => (
                <option
                  key={provider.id}
                  value={provider.id}
                  disabled={!provider.available}
                  title={provider.unavailableReason ?? undefined}
                >
                  {provider.name}{provider.available ? "" : ` (${t("settings.image.unavailable")})`}
                </option>
              ))}
            </select>
          </SettingRow>
          {unsupportedImageMessage && <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{unsupportedImageMessage}</p>}
          <SettingRow title={t("settings.ai.model")} description={t("settings.image.modelDesc")}>
            {currentImageProviderPreset?.supportedModels.length ? (
              <Select
                value={imageGenConfig.model}
                onChange={(e) => setImageGenConfig({ model: e.target.value })}
                options={currentImageProviderPreset.supportedModels.map((m) => ({
                  value: m.id,
                  label: m.label,
                }))}
              />
            ) : (
              <input
                type="text"
                value={imageGenConfig.model}
                disabled
                className={`${inputClass} cursor-not-allowed opacity-60`}
              />
            )}
          </SettingRow>
          <SettingRow title={t("settings.image.apiKey")} description={t("settings.image.apiKeyDesc")}>
            <input
              type="password"
              value={imageGenConfig.apiKey || ""}
              onChange={(e) => setImageGenConfig({ apiKey: e.target.value || null })}
              placeholder={t("settings.image.apiKeyPlaceholder")}
              className={inputClass}
            />
          </SettingRow>
          <SettingRow title={t("settings.ai.baseUrl")} description={t("settings.image.baseUrlDesc")}>
            <input
              type="text"
              value={imageGenConfig.baseUrl || ""}
              onChange={(e) => setImageGenConfig({ baseUrl: e.target.value || null })}
              placeholder={currentImageProviderPreset?.defaultBaseUrl ?? ""}
              className={inputClass}
            />
          </SettingRow>
        </>
      )
    }

    if (activeSection === "video") {
      return (
        <>
          <SectionTitle title={t("settings.video.title")} subtitle={t("settings.video.subtitle")} />
          <div className="mb-5 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600">
            {t("settings.video.plannedPlaceholder")}
          </div>
          <SettingRow title={t("settings.ai.provider")} description={t("settings.video.providerDesc")}>
            <select
              value={videoGenConfig.provider}
              disabled
              className={`${inputClass} cursor-not-allowed opacity-60`}
            >
              <option value="sedans-video">Sedans Video ({t("settings.video.proposalPending")})</option>
            </select>
          </SettingRow>
          <SettingRow title={t("settings.ai.model")} description={t("settings.video.modelDesc")}>
            <input
              type="text"
              value={videoGenConfig.model}
              disabled
              className={`${inputClass} cursor-not-allowed opacity-60`}
            />
          </SettingRow>
          <SettingRow title={t("settings.video.apiKey")} description={t("settings.video.apiKeyDesc")}>
            <input
              type="password"
              value={videoGenConfig.apiKey || ""}
              disabled
              placeholder={t("settings.video.apiKeyPlaceholder")}
              className={`${inputClass} cursor-not-allowed opacity-60`}
            />
          </SettingRow>
          <SettingRow title={t("settings.ai.baseUrl")} description={t("settings.video.baseUrlDesc")}>
            <input
              type="text"
              value={videoGenConfig.baseUrl || ""}
              disabled
              className={`${inputClass} cursor-not-allowed opacity-60`}
            />
          </SettingRow>
        </>
      )
    }

    if (activeSection === "editor") {
      return (
        <>
          <SectionTitle title={t("settings.editor.title")} subtitle={t("settings.editor.subtitle")} />
          <SettingRow title={t("settings.editor.defaultFrameSize")} description={t("settings.editor.defaultFrameSizeDesc")}>
            <div className="flex items-center gap-2">
              <input type="number" min={8} max={512} value={editorSettings.defaultFrameWidth} onChange={(e) => setEditorSettings({ defaultFrameWidth: Number(e.target.value) })} className={inputClass} />
              <span className="text-xs text-[var(--color-text-muted)]">×</span>
              <input type="number" min={8} max={512} value={editorSettings.defaultFrameHeight} onChange={(e) => setEditorSettings({ defaultFrameHeight: Number(e.target.value) })} className={inputClass} />
            </div>
          </SettingRow>
          <SettingRow title={t("settings.editor.defaultFps")} description={t("settings.editor.defaultFpsDesc")}>
            <Slider min={1} max={60} step={1} value={editorSettings.defaultFps} onChange={(defaultFps) => setEditorSettings({ defaultFps })} />
          </SettingRow>
          <SettingRow title={t("settings.editor.artStyle")} description={t("settings.editor.artStyleDesc")}>
            <Select
              value={editorSettings.defaultArtStyle}
              onChange={(e) => setEditorSettings({ defaultArtStyle: e.target.value as EditorSettings["defaultArtStyle"] })}
              options={[
                { value: "pixel_art", label: "Pixel Art" },
                { value: "clean_hd", label: "Clean HD" },
                { value: "pixel_inspired", label: "Pixel Inspired" },
                { value: "retro_pixel", label: "Retro Pixel" },
              ]}
            />
          </SettingRow>
          <SettingRow title={t("settings.editor.gridSize")} description={t("settings.editor.gridSizeDesc")}>
            <Select
              value={String(editorSettings.gridSize)}
              onChange={(e) => setEditorSettings({ gridSize: Number(e.target.value) as EditorSettings["gridSize"] })}
              options={[
                { value: "8", label: "8 × 8" },
                { value: "16", label: "16 × 16" },
                { value: "32", label: "32 × 32" },
                { value: "0", label: t("common.off") },
              ]}
            />
          </SettingRow>
          <SettingRow title={t("settings.editor.canvasBackground")} description={t("settings.editor.canvasBackgroundDesc")}>
            <Select
              value={editorSettings.canvasBackground}
              onChange={(e) => setEditorSettings({ canvasBackground: e.target.value as EditorSettings["canvasBackground"] })}
              options={[
                { value: "checkerboard", label: t("settings.editor.checkerboard") },
                { value: "solid_white", label: t("settings.editor.solidWhite") },
                { value: "solid_black", label: t("settings.editor.solidBlack") },
                { value: "transparent", label: t("settings.editor.transparent") },
              ]}
            />
          </SettingRow>
        </>
      )
    }

    if (activeSection === "export") {
      return (
        <>
          <SectionTitle title={t("settings.exportSection.title")} subtitle={t("settings.exportSection.subtitle")} />
          <SettingRow title={t("settings.exportSection.defaultFormat")} description={t("settings.exportSection.defaultFormatDesc")}>
            <Select value={exportSettings.defaultFormat} onChange={(e) => setExportSettings({ defaultFormat: e.target.value as ExportSettings["defaultFormat"] })} options={[{ value: "png", label: "PNG" }, { value: "webp", label: "WebP" }, { value: "gif", label: "GIF" }]} />
          </SettingRow>
          <SettingRow title={t("settings.exportSection.defaultColumns")} description={t("settings.exportSection.defaultColumnsDesc")}>
            <Slider min={1} max={16} step={1} value={exportSettings.defaultColumns} onChange={(defaultColumns) => setExportSettings({ defaultColumns })} />
          </SettingRow>
          <SettingRow title={t("settings.exportSection.frameSpacing")} description={t("settings.exportSection.frameSpacingDesc")}>
            <Slider min={0} max={10} step={1} value={exportSettings.frameSpacing} onChange={(frameSpacing) => setExportSettings({ frameSpacing })} />
          </SettingRow>
          <SettingRow title={t("settings.exportSection.transparentBackground")} description={t("settings.exportSection.transparentBackgroundDesc")}>
            <input
              type="checkbox"
              checked
              disabled
              readOnly
              aria-label={t("settings.exportSection.transparentBackground")}
              className="h-4 w-4 cursor-not-allowed accent-[var(--color-accent)] opacity-60"
            />
          </SettingRow>
          <SettingRow title={t("settings.exportSection.enginePreset")} description={t("settings.exportSection.enginePresetDesc")}>
            <Select value={exportSettings.enginePreset} onChange={(e) => setExportSettings({ enginePreset: e.target.value as ExportSettings["enginePreset"] })} options={[{ value: "none", label: t("common.none") }, { value: "godot", label: "Godot" }, { value: "unity", label: "Unity" }, { value: "generic", label: t("settings.exportSection.generic") }]} />
          </SettingRow>
        </>
      )
    }

    if (activeSection === "diagnostics") {
      return (
        <>
          <SectionTitle title={t("settings.diagnostics.title")} subtitle={t("settings.diagnostics.subtitle")} />
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-text-secondary)]">{t("settings.diagnostics.description")}</p>
              <div className="flex items-center gap-2">
              <button onClick={capturePerfSnapshot} disabled={getPerfDebugSnapshot() === null} className={buttonClass}>
                <Activity size={14} />
                {t("settings.diagnostics.captureSnapshot")}
              </button>
              <button onClick={copyDiagnosticsReport} className={buttonClass}>
                {diagnosticsCopied ? <Check size={14} /> : <Clipboard size={14} />}
                {diagnosticsCopied ? t("settings.diagnostics.copied") : t("settings.diagnostics.copyReport")}
              </button>
              </div>
            </div>
            <textarea
              readOnly
              aria-label={t("settings.diagnostics.reportLabel")}
              value={diagnosticsReport}
              className="h-[520px] w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 font-mono text-xs leading-5 text-[var(--color-text-primary)] outline-none"
            />
          </div>
        </>
      )
    }

    if (activeSection === "shortcuts") {
      return (
        <>
          <SectionTitle title={t("settings.shortcuts.title")} subtitle={t("settings.shortcuts.subtitle")} />
          {availableShortcutKeys.map((shortcut) => (
            <SettingRow key={shortcut.keys} title={t(shortcut.action)} description={t(shortcut.note)}>
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-2 py-1 font-mono text-xs text-[var(--color-accent)]">{shortcut.keys}</kbd>
            </SettingRow>
          ))}
          {unavailableShortcutKeys.map((shortcut) => (
            <div
              key={shortcut.keys}
              aria-disabled="true"
              className="grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-center gap-8 border-b border-[var(--color-border)] py-5 opacity-60 last:border-b-0"
            >
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-primary)]">{t(shortcut.action)}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{t("settings.shortcuts.unavailablePrefix")} {t(shortcut.reason)}</p>
              </div>
              <kbd className="w-fit rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-2 py-1 font-mono text-xs text-[var(--color-text-muted)]">{shortcut.keys}</kbd>
            </div>
          ))}
        </>
      )
    }

    return (
      <>
        <SectionTitle title={t("settings.json.title")} subtitle={t("settings.json.subtitle")} />
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          spellCheck={false}
          className="h-[520px] w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-input-bg)] p-4 font-mono text-xs leading-5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
        />
        {jsonError && <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{t("settings.jsonError", { message: jsonError })}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setJsonText(formatSettingsJson())} className={buttonClass}>{t("settings.resetFromUi")}</button>
          <button onClick={applyJsonSettings} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]">{t("settings.applyJson")}</button>
        </div>
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "var(--color-overlay)" }}>
      <div className="flex h-[86vh] w-[min(1180px,92vw)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lg)] [contain:layout_paint_style]">
        <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <div className="border-b border-[var(--color-border)] p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("settings.searchPlaceholder")}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-input-bg)] py-2 pl-9 pr-3 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto p-3">
            {filteredNavigation.map((item) => {
              const Icon = item.icon
              const active = activeSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => (item.id === "json" ? openJsonSettings() : setActiveSection(item.id))}
                  className={`mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${
                    active
                      ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="border-t border-[var(--color-border)] p-4 text-xs text-[var(--color-text-muted)]">
            <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-1.5 py-0.5">Ctrl-Shift-E</kbd> {t("settings.focusNavbar")}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-6">
            <div className="flex items-center gap-3 text-sm">
              <span className="rounded-md bg-[var(--color-brand-red-soft)] px-2 py-1 text-[var(--color-accent)]">{t("common.user")}</span>
              <span className="font-mono text-[var(--color-text-primary)]">.mova/settings.json</span>
            </div>
            <div className="flex items-center gap-2">
              {saved && <span className="flex items-center gap-1 text-xs text-green-600"><Check size={14} /> {t("common.saved")}</span>}
              <button onClick={openJsonSettings} className={buttonClass}>{t("settings.editJson")}</button>
              <button onClick={toggleTheme} className={buttonClass}>{theme === "light" ? <Sun size={14} /> : <Moon size={14} />}{theme === "light" ? t("common.light") : t("common.dark")}</button>
              <button onClick={onClose} className="rounded-md p-2 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"><X size={18} /></button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-10 py-8">
            <div className="mx-auto max-w-4xl">{renderContent()}</div>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
            <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]">{t("common.cancel")}</button>
            <button onClick={flashSaved} className="rounded-md bg-[var(--color-accent)] px-5 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]">{t("common.save")}</button>
          </footer>
        </main>
      </div>
    </div>
  )
}
