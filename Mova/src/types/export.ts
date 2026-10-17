import type { ManifestBase } from "./manifest"

export interface SpriteSheetConfig {
  animations: AnimationExport[]
  columns: number
  frameWidth: number
  frameHeight: number
  padding: number
  backgroundColor: string
  format: "png" | "webp"
  outputPath: string
}

export interface AnimationExport {
  animationId: string
  direction: "right" | "left" | "up" | "down" | "all"
}

export interface ExportCommandResult {
  outputPath: string
  manifestPath: string
}

/**
 * Frontend manifest payload sent to Rust export commands.
 *
 * Includes `schemaVersion` and `manifestKind` so the payload satisfies
 * `ManifestBase`.  The Rust backend wraps these fields into the on-disk
 * `.mova-export.json` sidecar (`ExportManifest` struct in `export.rs`);
 * extra TS fields are silently ignored by serde during deserialization.
 */
export interface ExportManifestPayload extends ManifestBase {
  manifestKind: "export"
  project: ExportManifestProject
  animation: ExportManifestAnimation
  export: ExportManifestExportDetails
  sourceFrames: ExportManifestSourceFrame[]
}

export interface ExportManifestProject {
  id: string
  name: string
}

export interface ExportManifestAnimation {
  id: string
  name: string
  frameCount: number
  fps: number
}

export interface ExportManifestExportDetails {
  format: string
  outputPath: string
  settings: Record<string, unknown>
  dimensions: Record<string, unknown>
}

export interface ExportManifestSourceFrame {
  id: string
  index: number
  imagePath: string
  duration: number | null
  sourceFrameId: string | null
}
