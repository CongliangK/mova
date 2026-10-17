# Versioned asset registry schema proposal

Status: draft proposal for the v0.2 project model. This document does not implement the registry or migrate existing projects.

## Scope

Mova's current `project.json` is centered on `characters[]` and character animations, while existing generation and export flows already write additional project files such as maps, prop sheets, extracted props, processed sprite sheets, split frames, and `*.mova-export.json` sidecar manifests. The proposed registry makes those files discoverable and traceable without changing current loading behavior.

The proposed registry is additive to `project.json`:

```json
{
  "id": "project-1",
  "name": "Demo Project",
  "version": 1,
  "characters": [],
  "assetRegistry": {
    "schemaVersion": 1,
    "assets": [],
    "manifests": []
  }
}
```

Until implementation lands, path conventions and `characters[]` remain the source of truth. Projects without `assetRegistry` must continue to load unchanged.

## Design goals

- Use stable IDs for assets and manifest records so UI, exports, and later migrations can reference them without relying only on file paths.
- Cover current asset kinds: character images, sprite sheets, processed sheets, animation frames, maps, prop sheets, prop packs, and exports.
- Reserve space for future video assets without committing to providers, codecs, timelines, or generation APIs.
- Link saved export and extraction manifests from project data while keeping runtime job attempts separate.
- Preserve compatibility with existing `characters[]` projects and current folder conventions.

## Proposed registry shape

```json
{
  "assetRegistry": {
    "schemaVersion": 1,
    "assets": [
      {
        "id": "asset_anim_idle",
        "kind": "character_animation",
        "status": "complete",
        "files": [],
        "source": {
          "type": "existing_project_data"
        },
        "generation": null,
        "manifests": [],
        "metadata": {},
        "createdAt": "2026-06-15T00:00:00Z",
        "updatedAt": "2026-06-15T00:00:00Z"
      }
    ],
    "manifests": [
      {
        "id": "manifest_export_idle_png",
        "kind": "export",
        "path": "exports/idle.png.mova-export.json",
        "schemaVersion": "1",
        "assetIds": ["asset_export_idle_png"],
        "createdAt": "2026-06-15T00:00:00Z"
      }
    ]
  }
}
```

### Required now

These fields are required for every v1 asset record once the registry is implemented:

| Field | Purpose |
| --- | --- |
| `id` | Stable project-local ID. Prefer UUIDs or deterministic import IDs; do not use mutable filenames as IDs. |
| `kind` | Asset kind such as `character_image`, `character_animation`, `sprite_sheet`, `processed_sprite_sheet`, `animation_frame_set`, `map`, `map_preview`, `prop_sheet`, `prop_pack`, or `export`. |
| `status` | Lifecycle status: `pending`, `processing`, `complete`, `failed`, `missing`, or `deleted`. |
| `files` | One or more project-relative file references. Empty only for logical assets that reference existing character/animation/frame IDs. |
| `source` | Where the asset came from: user import, existing character data, AI tool output, processing step, or export flow. |
| `generation` | Generation metadata when applicable, or `null` for manual/imported/export-only assets. Provider/model details remain reserved until provider policy is defined. |
| `manifests` | IDs of saved manifest records related to the asset; empty when none exist. |
| `createdAt`, `updatedAt` | ISO timestamps for registry bookkeeping. |

Required file fields:

```json
{
  "role": "source_image",
  "path": "assets/maps/map-123.png",
  "mimeType": "image/png",
  "sizeBytes": 123456,
  "exists": true
}
```

`sizeBytes` may be omitted when unknown. `exists` is a cached observation; missing files should update the asset `status` to `missing` rather than deleting registry history automatically.

Required source fields: `source.type` is always required. Other fields depend on the source type.

```json
{
  "type": "ai_tool",
  "tool": "generate_map_base",
  "inputAssetIds": [],
  "promptSummary": "top-down forest clearing base map"
}
```

### Reserved for later phases

These fields may appear but are not required in the first registry implementation:

| Field | Reserved use |
| --- | --- |
| `generation.provider`, `generation.model`, `generation.params`, `generation.seed` | Trace AI generation settings without committing to a provider contract. |
| `generation.jobRecordIds` | Link to runtime job records if a later job history store exists. |
| `relationships` | Parent/derived asset graph beyond `source.inputAssetIds`. |
| `metadata.dimensions`, `metadata.frameCount`, `metadata.fps`, `metadata.grid`, `metadata.layers`, `metadata.collision` | Kind-specific metadata used by UI and export reports. |
| `metadata.video` | Future video fields such as duration, dimensions, frame rate, audio tracks, or thumbnails. Exact model remains open. |
| `tags` | User or tool labels for filtering. |

## Asset kind examples

Examples use project-relative paths. They are illustrative, not a migration output produced by current code.

### Existing character animation asset

Current character data remains in `characters[]`. The registry record references existing IDs instead of duplicating the whole animation.

```json
{
  "id": "asset_character_hero_idle",
  "kind": "character_animation",
  "status": "complete",
  "files": [
    {
      "role": "frame",
      "path": "assets/frames/idle-run/frame_0.png",
      "mimeType": "image/png",
      "exists": true,
      "linkedFrameId": "frame-idle-0"
    },
    {
      "role": "frame",
      "path": "assets/frames/idle-run/frame_1.png",
      "mimeType": "image/png",
      "exists": true,
      "linkedFrameId": "frame-idle-1"
    }
  ],
  "source": {
    "type": "existing_project_data",
    "characterId": "char-hero",
    "animationId": "anim-idle"
  },
  "generation": {
    "params": {
      "source": "sprite_sheet",
      "frameCount": 2,
      "fps": 12
    }
  },
  "manifests": [],
  "metadata": {
    "characterId": "char-hero",
    "animationId": "anim-idle",
    "frameCount": 2,
    "fps": 12
  },
  "createdAt": "2026-06-15T00:00:00Z",
  "updatedAt": "2026-06-15T00:00:00Z"
}
```

### Generated sprite sheet, processed sheet, and frames

A sprite workflow may produce multiple related assets. The raw sheet, processed sheet, and frame set can be separate records so failures or missing files can be tracked per step.

```json
{
  "assets": [
    {
      "id": "asset_sheet_knight_walk_raw",
      "kind": "sprite_sheet",
      "status": "complete",
      "files": [
        {
          "role": "source_image",
          "path": "assets/sheets/uuid-sheet.png",
          "mimeType": "image/png",
          "exists": true
        }
      ],
      "source": {
        "type": "ai_tool",
        "tool": "generate_sprite_sheet",
        "promptSummary": "4x4 knight walk sheet on magenta background"
      },
      "generation": {
        "provider": "reserved-provider-id",
        "model": "reserved-model-id",
        "params": {
          "size": "1K",
          "aspectRatio": "1:1"
        }
      },
      "manifests": [],
      "metadata": {
        "grid": "4x4"
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    },
    {
      "id": "asset_frames_knight_walk",
      "kind": "animation_frame_set",
      "status": "complete",
      "files": [
        {
          "role": "processed_sheet",
          "path": "assets/processed/uuid-processed.png",
          "mimeType": "image/png",
          "exists": true
        },
        {
          "role": "frame_directory",
          "path": "assets/frames/uuid-processed",
          "exists": true
        }
      ],
      "source": {
        "type": "processing_step",
        "tool": "process_sprite",
        "inputAssetIds": ["asset_sheet_knight_walk_raw"]
      },
      "generation": null,
      "manifests": [],
      "metadata": {
        "frameCount": 16,
        "cellWidth": 64,
        "cellHeight": 64,
        "sharedScale": 1
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    }
  ]
}
```

`generation.provider` and `generation.model` above are placeholders for future traceability. The proposal does not define provider names or require provider support.

### Generated map, prop sheet, prop pack, and preview

```json
{
  "assets": [
    {
      "id": "asset_map_forest_base",
      "kind": "map",
      "status": "complete",
      "files": [
        {
          "role": "base_map",
          "path": "assets/maps/map-uuid.png",
          "mimeType": "image/png",
          "exists": true
        }
      ],
      "source": {
        "type": "ai_tool",
        "tool": "generate_map_base",
        "promptSummary": "top-down forest terrain only"
      },
      "generation": {
        "params": {
          "mode": "top-down",
          "size": "2K",
          "aspectRatio": "16:9"
        }
      },
      "manifests": [],
      "metadata": {
        "mapMode": "top-down"
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    },
    {
      "id": "asset_props_forest_sheet",
      "kind": "prop_sheet",
      "status": "complete",
      "files": [
        {
          "role": "source_sheet",
          "path": "assets/props/sheets/props-uuid.png",
          "mimeType": "image/png",
          "exists": true
        }
      ],
      "source": {
        "type": "ai_tool",
        "tool": "generate_props",
        "promptSummary": "forest props on magenta background"
      },
      "generation": {
        "params": {
          "count": 4,
          "grid": "2x2"
        }
      },
      "manifests": [],
      "metadata": {
        "propCount": 4,
        "grid": "2x2"
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    },
    {
      "id": "asset_props_forest_pack",
      "kind": "prop_pack",
      "status": "complete",
      "files": [
        {
          "role": "source_sheet",
          "path": "assets/props/sheets/props-uuid.png",
          "mimeType": "image/png",
          "exists": true
        },
        {
          "role": "extracted_directory",
          "path": "assets/props/extracted/pack-uuid",
          "exists": true
        }
      ],
      "source": {
        "type": "processing_step",
        "tool": "extract_props",
        "inputAssetIds": ["asset_props_forest_sheet"]
      },
      "generation": null,
      "manifests": ["manifest_prop_pack_forest"],
      "metadata": {
        "propCount": 4,
        "grid": "2x2"
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    },
    {
      "id": "asset_map_forest_preview",
      "kind": "map_preview",
      "status": "complete",
      "files": [
        {
          "role": "preview_image",
          "path": "assets/maps/previews/preview-uuid.png",
          "mimeType": "image/png",
          "exists": true
        }
      ],
      "source": {
        "type": "processing_step",
        "tool": "compose_preview",
        "inputAssetIds": ["asset_map_forest_base", "asset_props_forest_pack"]
      },
      "generation": null,
      "manifests": [],
      "metadata": {
        "layerModel": "flattened_preview"
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    }
  ],
  "manifests": [
    {
      "id": "manifest_prop_pack_forest",
      "kind": "asset_extraction",
      "path": "assets/props/extracted/pack-uuid/manifest.json",
      "schemaVersion": null,
      "assetIds": ["asset_props_forest_pack"],
      "createdAt": "2026-06-15T00:00:00Z"
    }
  ]
}
```

The prop extraction manifest is a saved asset-processing manifest. It is not a runtime job record.

### Saved export manifest link

Exports are first-class assets because users need to discover output files and reports later. The sidecar manifest remains the detailed export report; the registry stores a pointer and summary.

```json
{
  "assets": [
    {
      "id": "asset_export_idle_png",
      "kind": "export",
      "status": "complete",
      "files": [
        {
          "role": "export_output",
          "path": "exports/hero-idle.png",
          "mimeType": "image/png",
          "exists": true
        },
        {
          "role": "export_manifest",
          "path": "exports/hero-idle.png.mova-export.json",
          "mimeType": "application/json",
          "exists": true
        }
      ],
      "source": {
        "type": "export_flow",
        "inputAssetIds": ["asset_character_hero_idle"],
        "characterId": "char-hero",
        "animationId": "anim-idle"
      },
      "generation": null,
      "manifests": ["manifest_export_idle_png"],
      "metadata": {
        "format": "png",
        "frameCount": 2,
        "fps": 12
      },
      "createdAt": "2026-06-15T00:00:00Z",
      "updatedAt": "2026-06-15T00:00:00Z"
    }
  ],
  "manifests": [
    {
      "id": "manifest_export_idle_png",
      "kind": "export",
      "path": "exports/hero-idle.png.mova-export.json",
      "schemaVersion": "1",
      "assetIds": ["asset_export_idle_png", "asset_character_hero_idle"],
      "createdAt": "2026-06-15T00:00:00Z"
    }
  ]
}
```

### Future video asset fields (reserved)

Video support is reserved and not delivered by this proposal. A future video record should use the same asset envelope but keep implementation-specific choices open.

```json
{
  "id": "asset_video_cutscene_reserved",
  "kind": "video",
  "status": "pending",
  "files": [],
  "source": {
    "type": "reserved_video_workflow",
    "inputAssetIds": ["asset_character_hero_idle", "asset_map_forest_base"]
  },
  "generation": {
    "provider": null,
    "model": null,
    "params": {}
  },
  "manifests": [],
  "metadata": {
    "video": {
      "durationMs": null,
      "width": null,
      "height": null,
      "fps": null,
      "codec": null,
      "thumbnailAssetId": null
    }
  },
  "createdAt": "2026-06-15T00:00:00Z",
  "updatedAt": "2026-06-15T00:00:00Z"
}
```

Open decisions for video include timeline representation, audio handling, provider APIs, export formats, thumbnails, and whether generated video jobs are resumable.

## Saved manifests vs runtime job records

Saved manifests are project artifacts. They describe durable outputs and should be linkable from registry records:

- export sidecars such as `*.mova-export.json`, with `manifestKind: "export"` and `schemaVersion: "1"`;
- extraction manifests such as `assets/props/extracted/{id}/manifest.json`;
- future saved generation or processing manifests if they are written to disk as durable reports.

Runtime job records are different. They describe attempts to perform work: queue status, provider request IDs, retries, token/cost accounting, progress events, partial logs, cancellation state, and errors. They may be useful for debugging or resuming workflows, but they should not be required to open a project or discover completed assets.

Proposed separation:

```json
{
  "assetRegistry": {
    "assets": [],
    "manifests": []
  },
  "runtimeJobs": {
    "schemaVersion": 1,
    "records": []
  }
}
```

`runtimeJobs` is shown only to reserve a boundary. It is not part of the v1 asset registry contract and should be designed separately.

## Compatibility and migration rules

1. `assetRegistry` is optional. If it is absent, the app loads the project exactly as it does today using `characters[]`, settings, and existing path-based file tree behavior.
2. Existing `characters[]`, `active_character_id`, animation frames, and settings remain valid. Registry records may reference those IDs but do not replace them in the first implementation phase.
3. Current generated files remain valid in their existing locations:
   - `assets/characters/`
   - `assets/sheets/`
   - `assets/processed/`
   - `assets/frames/`
   - `assets/maps/`
   - `assets/maps/previews/`
   - `assets/props/sheets/`
   - `assets/props/extracted/`
   - `exports/`
4. No automatic migration is part of this proposal. A later migration may derive initial registry records from `characters[]`, export sidecars, and known asset folders.
5. Unknown registry fields should be preserved where possible, matching the current project schema's forward-compatible `extra` behavior.
6. If a file referenced by a registry record is missing, keep the record and mark the asset `missing` until the user repairs, removes, or regenerates it.

## Open decisions

- Whether the existing numeric top-level `version` becomes the project schema version, or whether a new `projectSchemaVersion` field should be added beside it.
- Whether `assetRegistry.schemaVersion` should be numeric like `project.version` or string-based like export manifest `schemaVersion`.
- Whether the embedded registry should use frontend-style camelCase keys as shown here or match the current Rust-owned `project.json` snake_case fields.
- Whether the registry is embedded in `project.json` for git-friendly review or split into a sidecar when large projects create many assets.
- Whether registry IDs should always be UUIDs or can include readable deterministic prefixes.
- Which UI surfaces become registry-authoritative first: file tree, export history, chat artifacts, or canvas/timeline selection.
- How much provider metadata is safe to persist, especially request IDs, prompts, seeds, cost, and account-related details.
- How runtime job records should be stored, pruned, and redacted if they include provider logs or error payloads.
- The exact future video data model, supported formats, provider contracts, timeline semantics, and migration path.

## Suggested rollout

1. Add parser/types that tolerate missing `assetRegistry` and preserve unknown registry fields.
2. Register newly generated maps, props, sheets, processed sheets, frames, and exports as additive metadata while leaving current `characters[]` writes unchanged.
3. Link export sidecar manifests from export asset records.
4. Add a read-only asset browser view backed by the registry with path fallback for legacy projects.
5. Add optional one-shot migration or repair tooling only after the registry is exercised by new projects.
