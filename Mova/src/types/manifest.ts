/**
 * Unified versioned artifact manifest schema.
 *
 * Centralizes the 4 previously-scattered manifest types (export, sprite QC,
 * prop extraction, map compose) under a single `ManifestBase` + discriminated
 * union so that every generated/exported artifact carries consistent provenance
 * metadata and downstream features (asset registry, export history, QC
 * reporting) can switch on `manifestKind` instead of guessing.
 *
 * ## Relationship to existing types
 * - `ExportManifestPayload` (types/export.ts) mirrors the Rust
 *   `ExportManifestInput` that is serialised into `.mova-export.json`
 *   sidecar files; after this refactor it includes `schemaVersion` and
 *   `manifestKind: "export"` so it satisfies `ManifestBase`.
 * - `SpriteProcessingManifest` (services/ai/tools/sprite-tools.ts) already
 *   carries `schemaVersion` / `manifestKind`; this file exports a structural
 *   variant for the union and the concrete type is re-exported from
 *   sprite-tools.ts.
 * - `PropManifestItem` (previously defined in map-layer-panel.tsx) is
 *   now defined here alongside the versioned `PropExtractionManifest`
 *   wrapper.
 * - Rust `export.rs` constants `EXPORT_MANIFEST_SCHEMA_VERSION` / `EXPORT_MANIFEST_KIND`
 *   and `map_commands.rs` `PropManifestEntry` are kept in sync through
 *   doc comments; no Rust refactor is required.
 */

// ── Base ────────────────────────────────────────────────────────

/** Fields shared by every versioned artifact manifest. */
export interface ManifestBase {
  /** Schema version for forward/backward compatibility. */
  schemaVersion: string
  /** Discriminator identifying the manifest kind. */
  manifestKind: ManifestKind
  /** ISO-8601 timestamp when the manifest was created. */
  createdAt: string
  /** Optional ID linking back to the job that produced this artifact. */
  sourceJobId?: string
  /** Optional reference to the AI provider / model used for generation. */
  sourceProviderRef?: string
}

/**
 * Known manifest-kind discriminators.
 *
 * The same string values are used as Rust-side constants / struct tags:
 * - `"export"`               → `EXPORT_MANIFEST_KIND` in `export.rs`
 * - `"prop_extraction"`      → prop manifest envelope in `map_commands.rs`
 * - `"sprite_processing_qc"` → `SpriteProcessingManifest` in `sprite-tools.ts`
 */
export type ManifestKind =
  | "sprite_processing_qc"
  | "export"
  | "prop_extraction"
  | "map_compose"
  | "video_export"

// ── Prop extraction ─────────────────────────────────────────────

/** Lightweight descriptor for a single extracted prop (mirrors Rust `PropManifestEntry`). */
export interface PropManifestItem {
  index: number
  filename: string
  width: number
  height: number
  cell_x: number
  cell_y: number
}

/** QC result attached to a prop-extraction manifest. */
export interface PropExtractionQc {
  /** Expected prop count based on grid rows × cols. */
  expectedPropCount: number
  /** Number of props actually extracted. */
  actualPropCount: number
  /** Grid positions (row, col) where no prop was found. */
  missingPropIndexes: Array<{ row: number; col: number }>
  /** Size-consistency analysis across extracted props. */
  sizeConsistency: {
    consistent: boolean
    sizes: Array<{ width: number; height: number; count: number }>
  }
  /** Human-readable quality warnings. */
  warnings: string[]
  /** Overall grade: pass, pass_with_warnings, or fail. */
  grade: "pass" | "pass_with_warnings" | "fail"
}

/** Versioned manifest envelope for a prop-extraction result. */
export interface PropExtractionManifest extends ManifestBase {
  manifestKind: "prop_extraction"
  /** The extracted props. */
  props: PropManifestItem[]
  /** Grid / source settings used during extraction. */
  settings?: {
    rows: number
    cols: number
    inputPath: string
    componentMode?: string
  }
  /** Optional QC summary for the extraction result. */
  qc?: PropExtractionQc
}

// ── Video export stubs (v0.4) ───────────────────────────────────

/**
 * Video export profile parameters.
 *
 * ⚠ Stub only – runtime encoding (MP4 / WebM / APNG) is deferred to v0.4.
 * The fields defined here reserve space so the schema is forward-compatible.
 */
export interface VideoExportProfile {
  /** Video container format. */
  format: "mp4" | "webm" | "apng"
  /** Video codec (e.g. "h264", "vp9", "vp8"). */
  codec?: string
  /** Frames per second. */
  fps: number
  /** Frame width in pixels. */
  width: number
  /** Frame height in pixels. */
  height: number
  /** Alpha-channel handling mode (e.g. "premultiplied", "straight", "none"). */
  alphaMode?: string
}

// ── Discriminated union ─────────────────────────────────────────

/**
 * Sprite-processing QC manifest (structural variant for the union).
 *
 * The full payload type is defined and exported from
 * `services/ai/tools/sprite-tools.ts` as `SpriteProcessingManifest`.
 */
export interface SpriteProcessingManifestVariant extends ManifestBase {
  manifestKind: "sprite_processing_qc"
}

/**
 * Export manifest (structural variant for the union).
 *
 * The full payload type is `ExportManifestPayload` in `types/export.ts`.
 */
export interface ExportManifestVariant extends ManifestBase {
  manifestKind: "export"
}

/** Map-compose manifest — persisted after compose_preview tool execution. */
export interface MapComposeManifest extends ManifestBase {
  manifestKind: "map_compose"
  /** Path to the base map image used as background. */
  baseImagePath: string
  /** Path to the composed map image output. */
  outputPath: string
  /** Placement entries describing prop overlays on the base map. */
  placements: Array<Record<string, unknown>>
  /** Arbitrary map metadata (size, tile count, etc.). */
  metadata?: Record<string, unknown>
}

/** Video-export manifest stub. Implementation deferred to v0.4. */
export interface VideoExportManifest extends ManifestBase {
  manifestKind: "video_export"
  profile: VideoExportProfile
  /** Paths to source frame images. */
  sourceFramePaths?: string[]
  /** Path to the output video file. */
  outputPath?: string
}

/**
 * Discriminated union of all persisted artifact manifest shapes.
 *
 * Consumers switch on `manifestKind` to narrow to the specific payload.
 */
export type ArtifactManifest =
  | ExportManifestVariant
  | SpriteProcessingManifestVariant
  | PropExtractionManifest
  | MapComposeManifest
  | VideoExportManifest

// ── Runtime job record (distinct from ArtifactManifest) ─────────

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled"

/**
 * In-flight / transient job state for runtime tracking.
 *
 * This is a **type-level** distinction from persisted `ArtifactManifest`:
 * `RuntimeJobRecord` models ephemeral progress while `ArtifactManifest`
 * models the final, saved output descriptor.
 *
 * ⚠ Persistent job storage is deferred to v0.2 / v0.3.
 */
export interface RuntimeJobRecord {
  /** Unique job identifier. */
  jobId: string
  /** Current execution status. */
  status: JobStatus
  /** Progress fraction 0..1 (optional while status is pending). */
  progress?: number
  /** Error message when status is "failed". */
  error?: string
  /** ISO-8601 timestamp when the job was created / started. */
  startedAt: string
  /** ISO-8601 timestamp when the job finished (set once terminal). */
  finishedAt?: string
}
