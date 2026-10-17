import { useState, useCallback, useRef, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { save } from "@tauri-apps/plugin-dialog"
import { useProjectStore } from "../../stores/project-store"
import { useSettingsStore } from "../../stores/settings-store"
import { Button } from "../ui/button"
import { Modal } from "../ui/modal"
import { Select } from "../ui/select"
import type { Animation } from "../../types/animation"
import type { ExportCommandResult, ExportManifestPayload } from "../../types/export"
import type { Project } from "../../types/project"
import type { ExportSettings } from "../../stores/settings-store"

export type ExportFormat = "png" | "webp" | "gif" | "godot"

export interface ExportWizardProps {
  open: boolean
  onClose: () => void
}

interface WizardState {
  step: number
  selectedAnimationId: string
  format: ExportFormat
  columns: number
  frameSpacing: number
  scale: number
  outputPath: string
  isExporting: boolean
  exportResult: { success: boolean; message: string } | null
  exportProgress: number | null
  exportStage: string | null
}

const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "png", label: "PNG Sprite Sheet" },
  { value: "webp", label: "WebP Sprite Sheet" },
  { value: "gif", label: "GIF Animation" },
  { value: "godot", label: "Godot .tres" },
]

const SPRITE_SHEET_TRANSPARENT_BACKGROUND = true
const SPRITE_SHEET_ALPHA_MODE = "preserved"
const GIF_TRANSPARENT_BACKGROUND = false
const GIF_ALPHA_MODE = "flattenedToIndexedPalette"
const GODOT_ALPHA_MODE = "sourceTextures"

function createInitialState(exportSettings: ExportSettings): WizardState {
  return {
    step: 1,
    selectedAnimationId: "",
    format: exportSettings.defaultFormat,
    columns: exportSettings.defaultColumns,
    frameSpacing: exportSettings.frameSpacing,
    scale: 1,
    outputPath: "",
    isExporting: false,
    exportResult: null,
    exportProgress: null,
    exportStage: null,
  }
}

function getBlankFrameNumbers(framePaths: string[]): number[] {
  return framePaths.reduce<number[]>((blankFrames, framePath, index) => {
    if (!framePath.trim()) {
      blankFrames.push(index + 1)
    }
    return blankFrames
  }, [])
}

function formatBlankFrameError(frameNumbers: number[]): string {
  const frameLabel = frameNumbers.length === 1 ? "frame" : "frames"
  const verb = frameNumbers.length === 1 ? "is" : "are"
  return `Cannot export because ${frameLabel} ${frameNumbers.join(", ")} ${verb} blank. Fill or remove blank frames before exporting.`
}

function createExportManifestPayload(params: {
  project: Project
  animation: Animation
  format: ExportFormat
  outputPath: string
  settings: Record<string, unknown>
  dimensions: Record<string, unknown>
}): ExportManifestPayload {
  const { project, animation, format, outputPath, settings, dimensions } = params
  return {
    schemaVersion: "1",
    manifestKind: "export" as const,
    createdAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
    },
    animation: {
      id: animation.id,
      name: animation.name,
      frameCount: animation.frames.length,
      fps: animation.fps,
    },
    export: {
      format,
      outputPath,
      settings,
      dimensions,
    },
    sourceFrames: animation.frames.map((frame) => ({
      id: frame.id,
      index: frame.index,
      imagePath: frame.imagePath,
      duration: frame.duration,
      sourceFrameId: frame.sourceFrameId,
    })),
  }
}

function formatExportSuccess(result: ExportCommandResult): string {
  return `Exported to: ${result.outputPath}\nManifest: ${result.manifestPath}`
}

export function ExportWizard({ open, onClose }: ExportWizardProps) {
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const exportSettings = useSettingsStore((s) => s.exportSettings)

  const [state, setState] = useState<WizardState>(() => createInitialState(exportSettings))
  const unlistenRef = useRef<(() => void) | null>(null)

  // Clean up listener on unmount.
  useEffect(() => {
    return () => {
      unlistenRef.current?.()
    }
  }, [])

  const animations: { characterName: string; animation: Animation }[] = []
  if (project) {
    for (const character of project.characters) {
      for (const animation of character.animations) {
        animations.push({ characterName: character.name, animation })
      }
    }
  }

  const selectedAnimation = animations.find(
    (a) => a.animation.id === state.selectedAnimationId
  )

  const updateState = useCallback(
    (updates: Partial<WizardState>) => {
      setState((prev) => ({ ...prev, ...updates }))
    },
    []
  )

  const handleNext = useCallback(() => {
    if (state.step < 4) {
      updateState({ step: state.step + 1 })
    }
  }, [state.step, updateState])

  const handleBack = useCallback(() => {
    if (state.step > 1) {
      updateState({ step: state.step - 1 })
    }
  }, [state.step, updateState])

  const handleClose = useCallback(() => {
    unlistenRef.current?.()
    unlistenRef.current = null
    setState(createInitialState(exportSettings))
    onClose()
  }, [exportSettings, onClose])

  const handleBrowseOutput = useCallback(async () => {
    try {
      const selected = await save({
        title: "Choose export location",
        defaultPath: state.outputPath || undefined,
        filters:
          state.format === "gif"
            ? [{ name: "GIF", extensions: ["gif"] }]
            : state.format === "godot"
              ? [{ name: "Godot Resource", extensions: ["tres"] }]
              : state.format === "webp"
                ? [{ name: "WebP", extensions: ["webp"] }]
                : [{ name: "PNG", extensions: ["png"] }],
      })
      if (selected) {
        updateState({ outputPath: selected as string })
      }
    } catch {
      // Dialog cancelled or error — ignore
    }
  }, [state.format, state.outputPath, updateState])

  const handleExport = useCallback(async () => {
    if (!selectedAnimation) return

    updateState({ isExporting: true, exportResult: null, exportProgress: null, exportStage: null })

    try {
      const { animation } = selectedAnimation
      const framePaths = animation.frames.map((f) => f.imagePath)
      const blankFrameNumbers = getBlankFrameNumbers(framePaths)
      if (blankFrameNumbers.length > 0) {
        updateState({
          isExporting: false,
          exportResult: {
            success: false,
            message: formatBlankFrameError(blankFrameNumbers),
          },
        })
        return
      }

      if (!project) {
        updateState({
          isExporting: false,
          exportResult: { success: false, message: "No project loaded" },
        })
        return
      }

      let result: ExportCommandResult

      if (state.format === "godot") {
        // Listen to job-progress events for Godot exports.
        // Clean up any stale listener first.
        unlistenRef.current?.()

        let unlisten: (() => void) | null = null
        try {
          unlisten = await listen<{
            job_id: string
            status: string
            progress?: number
            stage?: string
            error?: string
          }>("mova:job-progress", (event) => {
            updateState({
              exportProgress: event.payload.progress ?? null,
              exportStage: event.payload.stage ?? null,
            })
          })
          unlistenRef.current = unlisten

          const resourceDir = projectPath ?? ""
          const manifest = createExportManifestPayload({
            project,
            animation,
            format: state.format,
            outputPath: state.outputPath,
            settings: {
              resourceDir,
              alphaMode: GODOT_ALPHA_MODE,
              animations: [
                {
                  name: animation.name,
                  speed: animation.fps,
                  loop: animation.loop,
                },
              ],
            },
            dimensions: {
              frameWidth: project.settings.defaultFrameWidth,
              frameHeight: project.settings.defaultFrameHeight,
            },
          })

          result = await invoke<ExportCommandResult>("export_godot_sprite_frames", {
            req: {
              animations: [
                {
                  name: animation.name,
                  frame_paths: framePaths,
                  speed: animation.fps,
                  loop_: animation.loop,
                },
              ],
              output_path: state.outputPath,
              resource_dir: resourceDir,
              manifest,
            },
          })
        } finally {
          unlisten?.()
          unlistenRef.current = null
          updateState({ exportProgress: null, exportStage: null })
        }
      } else {
        // Listen to job-progress events for sprite-sheet and GIF exports.
        // Clean up any stale listener first.
        unlistenRef.current?.()

        let unlisten: (() => void) | null = null
        try {
          unlisten = await listen<{
            job_id: string
            status: string
            progress?: number
            stage?: string
            error?: string
          }>("mova:job-progress", (event) => {
            updateState({
              exportProgress: event.payload.progress ?? null,
              exportStage: event.payload.stage ?? null,
            })
          })
          unlistenRef.current = unlisten

          if (state.format === "png" || state.format === "webp") {
            const frameWidth = project.settings.defaultFrameWidth
            const frameHeight = project.settings.defaultFrameHeight
            const scaledFrameWidth = Math.round(frameWidth * state.scale)
            const scaledFrameHeight = Math.round(frameHeight * state.scale)
            const rows = Math.ceil(framePaths.length / state.columns)
            const sheetWidth = state.columns * (scaledFrameWidth + state.frameSpacing) + state.frameSpacing
            const sheetHeight = rows * (scaledFrameHeight + state.frameSpacing) + state.frameSpacing
            const manifest = createExportManifestPayload({
              project,
              animation,
              format: state.format,
              outputPath: state.outputPath,
              settings: {
                columns: state.columns,
                frameWidth: scaledFrameWidth,
                frameHeight: scaledFrameHeight,
                padding: state.frameSpacing,
                scale: state.scale,
                transparentBackground: SPRITE_SHEET_TRANSPARENT_BACKGROUND,
                alphaMode: SPRITE_SHEET_ALPHA_MODE,
              },
              dimensions: {
                frameWidth: scaledFrameWidth,
                frameHeight: scaledFrameHeight,
                sheetWidth,
                sheetHeight,
              },
            })

            result = await invoke<ExportCommandResult>("export_sprite_sheet", {
              req: {
                frame_paths: framePaths,
                output_path: state.outputPath,
                columns: state.columns,
                frame_width: scaledFrameWidth,
                frame_height: scaledFrameHeight,
                padding: state.frameSpacing,
                manifest,
              },
            })
          } else {
            // GIF export
            const frameWidth = project.settings.defaultFrameWidth
            const frameHeight = project.settings.defaultFrameHeight
            const width = Math.round(frameWidth * state.scale)
            const height = Math.round(frameHeight * state.scale)
            const manifest = createExportManifestPayload({
              project,
              animation,
              format: state.format,
              outputPath: state.outputPath,
              settings: {
                fps: animation.fps,
                width,
                height,
                scale: state.scale,
                transparentBackground: GIF_TRANSPARENT_BACKGROUND,
                alphaMode: GIF_ALPHA_MODE,
              },
              dimensions: { width, height },
            })

            result = await invoke<ExportCommandResult>("export_gif", {
              req: {
                frame_paths: framePaths,
                output_path: state.outputPath,
                fps: animation.fps,
                width,
                height,
                manifest,
              },
            })
          }
        } finally {
          unlisten?.()
          unlistenRef.current = null
          updateState({ exportProgress: null, exportStage: null })
        }
      }

      updateState({
        isExporting: false,
        exportResult: { success: true, message: formatExportSuccess(result) },
      })
    } catch (err) {
      updateState({
        isExporting: false,
        exportResult: {
          success: false,
          message: err instanceof Error ? err.message : String(err),
        },
      })
    }
  }, [selectedAnimation, state, project, projectPath, updateState])

  const canProceed = () => {
    switch (state.step) {
      case 1:
        return !!state.selectedAnimationId
      case 2:
        return true
      case 3:
        return !!state.outputPath.trim()
      case 4:
        return !state.isExporting
      default:
        return false
    }
  }

  const stepTitles = ["", "Select Animation", "Configure", "Output Path", "Export"]

  return (
    <Modal open={open} onClose={handleClose} title="Export Wizard" size="lg">
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", height: "100%" }}>
        {/* Step indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-sm)",
            paddingBottom: "var(--space-md)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          {[1, 2, 3, 4].map((s) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  backgroundColor:
                    s === state.step
                      ? "var(--color-accent)"
                      : s < state.step
                        ? "var(--color-success)"
                        : "var(--color-bg-panel)",
                  color:
                    s === state.step
                      ? "#ffffff"
                      : s < state.step
                        ? "#ffffff"
                        : "var(--color-text-secondary)",
                  transition: `all var(--duration-fast) var(--ease-default)`,
                }}
              >
                {s < state.step ? "✓" : s}
              </div>
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  fontWeight: 500,
                  color:
                    s === state.step
                      ? "var(--color-text-primary)"
                      : "var(--color-text-secondary)",
                }}
              >
                {stepTitles[s]}
              </span>
              {s < 4 && (
                <div
                  style={{
                    width: "16px",
                    height: "1px",
                    backgroundColor: "var(--color-border)",
                    marginLeft: "var(--space-xs)",
                    marginRight: "var(--space-xs)",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {state.step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <label
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                }}
              >
                Choose an animation to export
              </label>
              {animations.length === 0 ? (
                <div
                  style={{
                    padding: "var(--space-xl)",
                    textAlign: "center",
                    color: "var(--color-text-secondary)",
                    fontSize: "var(--text-sm)",
                    backgroundColor: "var(--color-bg-secondary)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  No animations found in the current project.
                </div>
              ) : (
                <Select
                  value={state.selectedAnimationId}
                  onChange={(e) => updateState({ selectedAnimationId: e.target.value })}
                  options={animations.map((a) => ({
                    value: a.animation.id,
                    label: `${a.characterName} — ${a.animation.name}`,
                  }))}
                />
              )}
              {selectedAnimation && (
                <div
                  style={{
                    padding: "var(--space-md)",
                    backgroundColor: "var(--color-bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  <div>
                    <strong style={{ color: "var(--color-text-primary)" }}>Character:</strong>{" "}
                    {selectedAnimation.characterName}
                  </div>
                  <div style={{ marginTop: "var(--space-xs)" }}>
                    <strong style={{ color: "var(--color-text-primary)" }}>Animation:</strong>{" "}
                    {selectedAnimation.animation.name}
                  </div>
                  <div style={{ marginTop: "var(--space-xs)" }}>
                    <strong style={{ color: "var(--color-text-primary)" }}>Frames:</strong>{" "}
                    {selectedAnimation.animation.frameCount}
                  </div>
                </div>
              )}
            </div>
          )}

          {state.step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <label
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Export Format
                </label>
                <Select
                  value={state.format}
                  onChange={(e) => updateState({ format: e.target.value as ExportFormat })}
                  options={EXPORT_FORMATS}
                />
              </div>

              {(state.format === "png" || state.format === "webp") && (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                    <label
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      Columns
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={state.columns}
                      onChange={(e) => updateState({ columns: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{
                        width: "100%",
                        height: "32px",
                        padding: "0 var(--space-sm)",
                        backgroundColor: "var(--color-input-bg)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-sm)",
                        outline: "none",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border-active)"
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border)"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                    <label
                      style={{
                        fontSize: "var(--text-sm)",
                        fontWeight: 500,
                        color: "var(--color-text-primary)",
                      }}
                    >
                      Frame Spacing (px)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={64}
                      value={state.frameSpacing}
                      onChange={(e) =>
                        updateState({ frameSpacing: Math.max(0, parseInt(e.target.value) || 0) })
                      }
                      style={{
                        width: "100%",
                        height: "32px",
                        padding: "0 var(--space-sm)",
                        backgroundColor: "var(--color-input-bg)",
                        border: "1px solid var(--color-border)",
                        borderRadius: "var(--radius-md)",
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-sans)",
                        fontSize: "var(--text-sm)",
                        outline: "none",
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border-active)"
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "var(--color-border)"
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <label
                  style={{
                    fontSize: "var(--text-sm)",
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Scale
                </label>
                <input
                  type="number"
                  min={0.25}
                  max={4}
                  step={0.25}
                  value={state.scale}
                  onChange={(e) =>
                    updateState({ scale: Math.max(0.25, parseFloat(e.target.value) || 1) })
                  }
                  style={{
                    width: "100%",
                    height: "32px",
                    padding: "0 var(--space-sm)",
                    backgroundColor: "var(--color-input-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-active)"
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)"
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-sm)",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-primary)",
                    cursor: "default",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={state.format === "png" || state.format === "webp"}
                    disabled
                    readOnly
                    style={{ cursor: "not-allowed" }}
                  />
                  Transparent background
                </label>
                <div
                  style={{
                    fontSize: "var(--text-xs)",
                    lineHeight: 1.5,
                    color: "var(--color-text-secondary)",
                  }}
                >
                  {state.format === "png" || state.format === "webp"
                    ? "PNG/WebP sprite sheets always use transparent padding and preserve source alpha; opaque backgrounds are not supported yet."
                    : "This export format does not have a configurable background transparency option."}
                </div>
              </div>
            </div>
          )}

          {state.step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
              <label
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: 500,
                  color: "var(--color-text-primary)",
                }}
              >
                Output Path
              </label>
              <div style={{ display: "flex", gap: "var(--space-sm)" }}>
                <input
                  type="text"
                  value={state.outputPath}
                  onChange={(e) => updateState({ outputPath: e.target.value })}
                  placeholder="/path/to/output.png"
                  style={{
                    flex: 1,
                    height: "32px",
                    padding: "0 var(--space-sm)",
                    backgroundColor: "var(--color-input-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--color-text-primary)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--text-sm)",
                    outline: "none",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border-active)"
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--color-border)"
                  }}
                />
                <Button variant="secondary" onClick={handleBrowseOutput}>
                  Browse
                </Button>
              </div>
              {state.outputPath && (
                <div
                  style={{
                    padding: "var(--space-md)",
                    backgroundColor: "var(--color-bg-secondary)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--text-xs)",
                    fontFamily: "var(--font-mono)",
                    color: "var(--color-text-secondary)",
                    wordBreak: "break-all",
                  }}
                >
                  {state.outputPath}
                </div>
              )}
            </div>
          )}

          {state.step === 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
              {!state.isExporting && !state.exportResult && (
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      marginBottom: "var(--space-md)",
                    }}
                  >
                    Ready to Export
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--color-text-secondary)",
                      marginBottom: "var(--space-lg)",
                    }}
                  >
                    {selectedAnimation
                      ? `${selectedAnimation.characterName} — ${selectedAnimation.animation.name} → ${state.outputPath}`
                      : state.outputPath}
                  </div>
                  <Button size="lg" onClick={handleExport} aria-label="Export sprite sheet">
                    Execute Export
                  </Button>
                </div>
              )}

              {state.isExporting && (
                <div style={{ textAlign: "center", width: "100%", maxWidth: "320px" }}>
                  {state.exportProgress !== null ? (
                    <>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          backgroundColor: "var(--color-bg-panel)",
                          borderRadius: "var(--radius-sm)",
                          overflow: "hidden",
                          marginBottom: "var(--space-md)",
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.round(state.exportProgress * 100)}%`,
                            height: "100%",
                            backgroundColor: "var(--color-accent)",
                            borderRadius: "var(--radius-sm)",
                            transition: "width var(--duration-fast) var(--ease-default)",
                          }}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text-secondary)",
                          marginBottom: "var(--space-xs)",
                        }}
                      >
                        {state.exportStage ?? "Exporting..."}
                      </div>
                      <div
                        style={{
                          fontSize: "var(--text-xs)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        {Math.round(state.exportProgress * 100)}%
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          border: "3px solid var(--color-border)",
                          borderTopColor: "var(--color-accent)",
                          borderRadius: "50%",
                          animation: "spin 1s linear infinite",
                          margin: "0 auto var(--space-md)",
                        }}
                      />
                      <div
                        style={{
                          fontSize: "var(--text-sm)",
                          color: "var(--color-text-secondary)",
                        }}
                      >
                        Exporting...
                      </div>
                    </>
                  )}
                </div>
              )}

              {state.exportResult && (
                <div style={{ textAlign: "center", width: "100%" }}>
                  <div
                    style={{
                      fontSize: "var(--text-xl)",
                      marginBottom: "var(--space-md)",
                      color: state.exportResult.success
                        ? "var(--color-success)"
                        : "var(--color-danger)",
                    }}
                  >
                    {state.exportResult.success ? "✓" : "✗"}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-lg)",
                      fontWeight: 600,
                      color: state.exportResult.success
                        ? "var(--color-success)"
                        : "var(--color-danger)",
                      marginBottom: "var(--space-sm)",
                    }}
                  >
                    {state.exportResult.success ? "Export Successful" : "Export Failed"}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      color: "var(--color-text-secondary)",
                      wordBreak: "break-all",
                      padding: "var(--space-md)",
                      backgroundColor: "var(--color-bg-secondary)",
                      borderRadius: "var(--radius-md)",
                      fontFamily: state.exportResult.success ? "var(--font-mono)" : "var(--font-sans)",
                      whiteSpace: state.exportResult.success ? "pre-wrap" : "normal",
                    }}
                  >
                    {state.exportResult.message}
                  </div>
                  {state.exportResult.success && (
                    <Button
                      variant="secondary"
                      style={{ marginTop: "var(--space-lg)" }}
                      onClick={handleClose}
                    >
                      Close
                    </Button>
                  )}
                  {!state.exportResult.success && (
                    <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "center", marginTop: "var(--space-lg)" }}>
                      <Button variant="secondary" onClick={handleClose}>
                        Cancel
                      </Button>
                      <Button onClick={() => updateState({ exportResult: null })}>
                        Retry
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        {state.step < 4 && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              paddingTop: "var(--space-md)",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
              {state.step > 1 && (
                <Button variant="secondary" onClick={handleBack}>
                  Back
                </Button>
              )}
            </div>
            <div style={{ display: "flex", gap: "var(--space-sm)" }}>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleNext} disabled={!canProceed()}>
                {state.step === 3 ? "Export" : "Next"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Modal>
  )
}
