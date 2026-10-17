# Image Generation → Save → Preview / Project State Closed-Loop Smoke Test Plan

Created: 2026-06-12
Branch: smoke-worktree-main
Status: Draft → Implementation

## 1. Motivation

The Mova app currently has good **unit-level** test coverage for AI tools, project
store, animation store, and Rust image commands.  However, no **smoke test** chains the
full user-critical path in a single test:

```
AI/Image-Gen tool → save image bytes to project assets →
project store records the asset as a character animation →
animation store can read and normalize frames →
asset-url helpers recognize generated paths →
chat store preserves tool-call results across stream updates
```

This gap means regressions in the "glue" between these layers could go unnoticed.

## 2. Automation Boundary (What We Test)

| Layer | Automated? | Mechanism |
|-------|-----------|-----------|
| AI Tool (generateSpriteSheet, processSprite, extractAnimationFrames) | ✅ | Mock image-gen provider + mock Tauri invoke |
| Image save (Rust `save_image_bytes`) | ✅ (Rust) | Rust unit tests already cover byte-level save |
| Frame split / magenta removal (Rust) | ✅ (Rust) | Rust unit tests already cover split/remove |
| Project store animation registration | ✅ | Via `extractAnimationFramesTool` → `updateCharacter` |
| Animation store frame normalization | ✅ | Existing `animation-store.test.ts` |
| Asset URL helpers (`toDisplayAssetUrl`, `isTimelineImagePath`) | ✅ | Existing `asset-url.test.ts` |
| Chat store tool-call persistence | ✅ | Existing `chat-store-toolcalls.test.ts` |
| **Full pipeline (generate → save → store → verify)** | ❌ → ✅ **NEW** | `image-generation-pipeline.test.ts` |

## 3. Non-Goals (What We Do NOT Test)

| Area | Reason |
|------|--------|
| Real LLM provider (OpenAI, Ollama, etc.) | Requires API key / network; covered by unit mocks |
| Real image-gen provider (Suchuang, etc.) | Requires API key / network; covered by mock provider |
| Tauri WebView preview (actual canvas rendering) | Requires E2E + real rendering; out of scope for smoke |
| Visual regression (pixel output comparison) | Requires screenshot diffing infrastructure |
| Playwright / Cypress E2E | Heavy dependency; not needed for store/tool layer smoke |
| Rust `image_io.rs` direct testing | No dedicated test module; image processing is covered in `commands/image.rs` tests |
| Export wizard full flow | Covered by `export-wizard-godot.test.tsx` |

## 4. Test Matrix

| Test File | What It Covers | Status |
|-----------|---------------|--------|
| `ai-sprite-tools.test.ts` | Individual sprite tools with mocks | ✅ Exists |
| `ai-map-tools.test.ts` | Individual map tools with mocks | ✅ Exists |
| `project-store.test.ts` | Character CRUD, auto-save, Rust mapping | ✅ Exists |
| `animation-store.test.ts` | Frame normalization, duplicate, paste, delete | ✅ Exists |
| `asset-url.test.ts` | Path detection, URL conversion | ✅ Exists |
| `chat-store-toolcalls.test.ts` | Tool-call persistence across updates | ✅ Exists |
| `agent-orchestrator.test.ts` | Streaming, tool loop, error handling | ✅ Exists |
| `image-generation-pipeline.test.ts` | **Full generate→save→store→verify loop** | ✅ NEW |
| (Rust) `commands/image.rs` tests | save_image_bytes, get_image_dimensions, split_frames, remove_magenta | ✅ Exists |
| (Rust) `commands/project.rs` tests | Roundtrip, migration, save/open | ✅ Exists |
| (Rust) `services/sprite_sheet.rs` tests | compose validation, pixel correctness | ✅ Exists |
| (Rust) `commands/map_commands.rs` tests | compose_preview, extract_prop_pack, anchor math (6 tests) | ✅ Exists (audit confirmed) |

## 5. New Test: `image-generation-pipeline.test.ts`

### 5.1 Scope

A single test file that chains the full loop **without any real external API calls**:

1. **Mock ImageGen provider** — yields deterministic fake `Uint8Array` image data
2. **Mock Tauri invoke** — handles `save_image_bytes`, `remove_magenta_background`, `split_frames` with in-memory path recording
3. **Set up project store** — with a character, project path, settings
4. **Run generateSpriteSheet** → verify save path, mock invoke calls
5. **Run processSprite** → verify frame split results
6. **Run extractAnimationFrames** → verify project store character now has animation
7. **Verify animation store** can load and normalize the extracted animation
8. **Verify asset-url helpers** recognize the generated frame/image paths
9. **Boundary/edge cases**: missing project, missing character, empty frame paths, invalid grid

### 5.2 Test Cases

```
describe("Image generation → save → preview pipeline")
  describe("full generation pipeline")
    it("generates a sprite sheet, processes it, extracts frames into project")
    it("project store animation can be read by animation store with frame normalization")
    it("generated asset paths are recognized by asset-url helpers")
    it("generated asset paths are NOT remote/data URLs (they are local)")
  describe("pipeline edge cases")
    it("rejects generate when no project is loaded")
    it("rejects extract when character does not exist")
    it("rejects extract when frame paths are empty")
    it("rejects process with invalid grid format")
  describe("pipeline integration with chat store")
    it("tool-call results survive updateMessage streaming (existing coverage verify)")
```

### 5.3 Mock Strategy

```typescript
// Mock image-gen provider: deterministic bytes
vi.mock("../../src/services/ai/providers/image-gen", () => ({
  SuchuangProvider: class MockSuchuangProvider {
    async *generate(request: ImageGenRequest): AsyncGenerator<ImageGenChunk> {
      pipelineRequests.push(request)
      yield { type: "image", imageUrl: "mock://generated/sprite.png", imageData: new Uint8Array([80, 78, 71]) }
      yield { type: "done" }
    }
  },
}))

// Mock Tauri invoke: record all invocations, simulate success
invokeMock.mockImplementation((cmd, args) => {
  recordedInvocations.push({ cmd, args })
  // Return deterministic paths
  if (cmd === "split_frames") return Promise.resolve({ frames: [...], cell_width: 64, cell_height: 64 })
  return Promise.resolve(undefined)
})
```

## 6. Rust Test Coverage (Audit, No New Tests This Stage)

Audit of `src-tauri/` confirmed that the Rust layer already has solid unit test coverage:

- `commands/image.rs` — `save_image_bytes`, `get_image_dimensions`, `split_frames` (edge-touch, missing-file), `remove_magenta_background`
- `commands/project.rs` — serialization roundtrip, migration (old schema, missing fields), save/open roundtrip
- `services/sprite_sheet.rs` — compose validation (zero columns, empty frames, zero dimensions, missing folder, missing frame), pixel correctness with padding
- `commands/map_commands.rs` — placement JSON parsing, `compute_top_left` anchor math, end-to-end compose, invalid JSON error, prop-pack manifest extraction

No new Rust tests are added in this stage. The existing coverage is sufficient for the frontend closed-loop smoke test.

## 7. Verification Commands

```bash
# Frontend-only:
cd Mova && pnpm verify

# Full (includes Rust):
cd Mova && pnpm verify:full

# Or individually:
cd Mova && pnpm lint
cd Mova && pnpm typecheck
cd Mova && pnpm test -- src/__tests__/image-generation-pipeline.test.ts
cd Mova && pnpm test:rust
```

## 8. Residual Gaps (Documented, Not Fixed)

| Gap | Why Not Fixed |
|-----|---------------|
| Real provider integration tests | Requires API keys; use manual testing or integration env |
| Canvas DOM preview rendering | Konva canvas doesn't render in jsdom; needs E2E framework |
| Visual regression (generated image pixel diff) | Requires screenshot infrastructure |
| Tauri WebView IPC roundtrip | Mocked in jsdom; real IPC needs `tauri dev` E2E |
| File watcher real-time updates | Requires real filesystem; unit-tested with mock invoke |
| Export wizard full render path | Partially covered by `export-wizard-godot.test.tsx` |

## 9. Implementation Checklist

- [x] Write this plan document
- [x] Create `Mova/src/__tests__/image-generation-pipeline.test.ts` (13 tests)
- [x] Rust test audit — `map_commands.rs` already has 6 tests (compose, extract, anchor math); `image.rs`/`project.rs`/`sprite_sheet.rs` all well-covered; no new Rust tests needed this stage
- [x] Run `pnpm verify` — ✅ all 40 files, 268 tests pass; lint + typecheck + build pass
- [x] Run `pnpm verify:full` — Rust blocked by pre-existing `cookie`/`time` crate conflict (not caused by this change)
- [x] Document residual gaps in this plan
- [x] Report changed files and test counts

## 9a. Final Verification Results

```
$ cd Mova && pnpm verify
  lint:     ✅ passed
  typecheck: ✅ passed
  test:      ✅ 40 files, 268 tests passed (includes 13 new pipeline tests)
  build:     ✅ passed
```

Rust (`pnpm test:rust`): blocked by pre-existing `cookie` crate compilation error:
```
error[E0119]: conflicting implementations of trait `From<...>` for type `...`
  --> cookie-0.18.1/src/expiration.rs:129:1
```
This is a `time` + `cookie` upstream dependency conflict, unrelated to this change.

### Changed Files

| File | Type | Lines |
|------|------|-------|
| `research/image-generation-preview-smoke-plan.md` | New (plan/doc) | ~200 |
| `Mova/src/__tests__/image-generation-pipeline.test.ts` | New (test) | 510 |

Zero existing files modified.

## 10. Decision Log

| Decision | Rationale |
|----------|-----------|
| No Canvas DOM testing | Konva renders to canvas; jsdom has no Canvas API. Store-level testing is sufficient for smoke. |
| Mock all external providers | Avoids network/API dependency; fast, deterministic, parallel-safe. |
| Keep new tests in single file | Easier to maintain, clear scope, single "does the pipeline work?" answer point. |
| No new Rust tests this stage | Audit confirmed existing Rust coverage is sufficient (image, project, sprite_sheet, map_commands all have unit tests). |
