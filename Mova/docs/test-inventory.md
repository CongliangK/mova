# Mova Test Inventory

> Generated 2026-06-16 · 53 test files · 463 tests · 102 Rust inline `#[test]` cases · all passing

This document maps the Mova test suite to product areas, catalogs known coverage gaps, and defines the minimum verification commands for each domain. Use it as a reference when creating or reviewing PRs and when writing new capability issues.

---

## 1. Verification command reference

| Command | What it does | When to use |
|---|---|---|
| `pnpm lint` | Runs ESLint across the frontend codebase (`eslint .`). | Every PR; catches style and correctness issues. |
| `pnpm typecheck` | Runs `tsc -b` using project references; checks full TypeScript compilation. | Every PR; catches type errors across the whole project. |
| `pnpm test` | Runs all 53 Vitest test files (jsdom, globals). Exit code 0 = all pass. | Every PR; fast enough for local pre-commit use. |
| `pnpm verify` | Shorthand: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`. | Before submitting a PR that touches frontend code. |
| `pnpm verify:full` | Same as `verify` plus `pnpm test:rust` (Rust `cargo test`). | Before merging a PR that touches Rust or both sides. |
| `pnpm verify:report` | Runs lint, typecheck, test, build, and test:rust in sequence; writes a machine-readable JSON report to `reports/verify-gate.json` with per-step timing, exit codes, and pass/fail status. | Release gate evidence; produces a portable artifact suitable for review. |
| `pnpm test:rust` | Runs `cargo test --manifest-path src-tauri/Cargo.toml` (102 inline `#[test]` cases across 10 Rust source files). | Any PR touching `src-tauri/`. |
| `pnpm perf:baseline` | Runs the single `performance-baseline.test.ts` file with `MOVA_WRITE_PERF_BASELINE=1` to record/compare performance metrics. | Performance-sensitive PRs; generates a baseline for future regression detection. |
| `pnpm test:report` | Runs vitest with `--reporter=json` and writes a structured QA report (`reports/qa-report-v0.json`) conforming to `docs/qa-report-v0.schema.json`. | When a curated QA artifact is needed (e.g., for release notes); **do not** commit `reports/` except curated samples. |

---

## 2. Test file → product area map

### 2.1 Project & Layout

| Test file | What it covers |
|---|---|
| `project-store.test.ts` | Project load, save, path state, dirty tracking in Zustand store. |
| `asset-url.test.ts` | Asset URL helpers (project-relative paths, image URL derivation). |
| `filename-validation.test.ts` | `validateFileName` utility (illegal chars, length limits, reserved names). |
| `browser-demo-workspace.test.tsx` | Browser demo workspace opt-in and basic render guard. |
| `app-header.test.tsx` | `AppHeader` component rendering and controls. |
| `app-layout-drag-import.test.tsx` | `AppLayout` drag-and-drop import IPC payload construction. |
| `app-layout-panels.test.tsx` | `AppLayout` dock panel visibility, resize, and collapse behavior. |
| `sidebar.test.tsx` | `Sidebar` component render and navigation. |
| `resizable-panel.test.tsx` | `ResizablePanel` drag-resize and min/max constraints. |
| `setup.test.ts` | Vitest setup sanity check (basic test passes). |

### 2.2 Canvas & Timeline

| Test file | What it covers |
|---|---|
| `animation-store.test.ts` | `AnimationStore` frame mutation contracts: add, remove, reorder frames. |
| `animation-timeline.test.tsx` | `AnimationTimeline` component renders empty timeline correctly. |
| `canvas-image-editor.test.tsx` | `CanvasArea` image file editor, Konva stage setup, and basic interactions. |
| `viewport-math.test.ts` | Viewport coordinate math: zoom, pan, screen↔world transforms. |
| `interaction-throttle.test.ts` | RAF-based interaction throttling (`createRafThrottle`). |
| `keyboard-shortcuts.test.tsx` | Global keyboard shortcuts: undo/redo, delete, navigation, tool switching. |
| `context-menu.test.tsx` | `ContextMenu` component right-click behavior and menu items. |
| `document-preview.test.tsx` | `DocumentPreview` component rendering. |

### 2.3 Drawing & Raster Editing

| Test file | What it covers |
|---|---|
| `drawing-integration.test.ts` | `DrawingStore` state management: tool selection, brush, colors. |
| `raster-editing-service.test.ts` | Byte-level PNG mutations in the raster editing service. |
| `dnd-debug.test.ts` | Drag-and-drop debug logging (diagnostic tool). |

### 2.4 AI / Orchestration

| Test file | What it covers |
|---|---|
| `agent-orchestrator.test.ts` | `AgentOrchestrator` plain text conversation flow, streaming, tool round limits. |
| `agent-runtime-contract.test.ts` | AI runtime mode contract: mode selection, flag validation. |
| `agent-runtime.test.ts` | Agent runtime config and factory (`createAgentRuntime`). |
| `ai-map-tools.test.ts` | AI map generation tools: tool definitions, parameter validation. |
| `ai-sprite-tools.test.ts` | AI sprite generation tools: tool definitions, parameter validation. |
| `image-generation-pipeline.test.ts` | Image generation → save → preview end-to-end pipeline with mock provider. |
| `piagent-core-runtime.test.ts` | `PiAgentCoreRuntime` lazy loading and basic lifecycle. |
| `piagent-runtime-adapter.test.ts` | piAgent event adapter: event bridging between piAgent and Mova. |
| `skill-registry.test.ts` | `SkillRegistry` skill registration, lookup, and routing. |
| `skill-selection.test.ts` | Skill selection UI and state management. |
| `tool-runner.test.ts` | `ToolRunner` malformed JSON handling and error recovery. |
| `use-agent-full-chat-flow.test.tsx` | `useAgent` full chat flow with real runtimes (integration-level). |
| `use-agent-runtime.test.tsx` | `useAgent` runtime integration: provider setup failure, loading states. |

### 2.5 AI / Providers & Messages

| Test file | What it covers |
|---|---|
| `llm-provider-tool-messages.test.ts` | LLM provider tool message serialization and deserialization. |

### 2.6 Chat

| Test file | What it covers |
|---|---|
| `chat-isolation.test.ts` | Chat project isolation: conversations scoped to project. |
| `chat-panel-drop.test.tsx` | `ChatPanel` image path drops: file-tree payloads → project-relative paths. |
| `chat-panel-message.test.tsx` | `ChatPanel` message rendering: user/assistant/tool messages. |
| `chat-project-storage.test.ts` | Chat project storage: save/load conversation state. |
| `chat-store-fix.test.ts` | Regression fix verification for `ChatStore` edge cases. |
| `chat-store.test.ts` | `ChatStore` conversation-scoped updates: add message, clear, switch. |
| `chat-store-toolcalls.test.ts` | `ChatStore` toolCalls preservation across re-renders and updates. |

### 2.7 Export

| Test file | What it covers |
|---|---|
| `export-wizard-godot.test.tsx` | `ExportWizard` Godot export path: sprite sheet, JSON metadata, frame export. |

### 2.8 File Tree & Git

| Test file | What it covers |
|---|---|
| `file-tree-create-file.test.tsx` | `FileTree` create_file IPC payload construction. |
| `file-tree-git-badges.test.tsx` | Git file tree badges: staged/unstaged/modified indicators. |
| `file-tree-node.test.tsx` | `FileTreeNode` component render, expand/collapse, icons. |
| `file-tree-store.test.ts` | `FileTreeStore` expandedPaths persistence across operations. |

### 2.9 Settings

| Test file | What it covers |
|---|---|
| `settings-store.test.ts` | Settings store: app zoom persistence, defaults. |
| `settings-provider-guard.test.tsx` | Settings provider guards: supported LLM providers, image provider metadata. |
| `settings-diagnostics.test.tsx` | Settings diagnostics report: Linux diagnostics without secrets, blocked storage paths. |

### 2.10 QA & Performance Reporting

| Test file | What it covers |
|---|---|
| `qa-report.test.ts` | QA report schema validation (`QaReportV0` type, `createVerifyGateReport`). |
| `perf/performance-baseline.test.ts` | Performance baseline recording and comparison (canvas, chat, file tree interactions). |

### 2.11 Error Handling & Crash Recovery

| Test file | What it covers |
|---|---|
| `error-boundary.test.tsx` | Error boundary fallback UI, error message display, and reload recovery. |

---

## 3. Known coverage gaps

These areas have **no dedicated test coverage** as of 2026-06-16. When a PR introduces or heavily modifies one of these areas, add at least one test or document in the PR why it was not added.

| # | Gap | Details |
|---|---|---|
| 1 | **Canvas visual regression** | Canvas tests mock Konva and assert DOM structure, but there are no pixel-level or visual regression tests (e.g., snapshot comparison). Visual correctness relies on manual review. |
| 2 | **File watcher ↔ file tree real integration** | Rust file watcher emits events (`file_watcher.rs`), and the file tree consumes them. The watcher has **no Rust tests**, and the frontend file tree tests use mock IPC — there is no end-to-end test of a real watcher cycle. |
| 3 | **Rust-side integration tests** | All 102 Rust tests are **inline unit tests** (`#[cfg(test)] mod tests` inside each source file). There are no separate integration test files in `src-tauri/tests/`, no cross-module integration tests, and no Tauri-command-level integration tests. |
| 4 | **Settings: provider runtime availability** | Settings tests verify provider metadata and guard components, but no test validates that a selected provider is actually available at runtime (e.g., API key present, endpoint reachable). This is inherently runtime-dependent and left to manual verification. |

---

## 4. Minimum verification per product domain

When a PR touches a domain, these are the **minimum `pnpm` commands** that must pass. Use `pnpm verify` or `pnpm verify:full` as a catch-all when the PR crosses multiple domains.

| Product domain | Minimum verification |
|---|---|
| Project & Layout | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/project-store src/__tests__/app-` |
| Canvas & Timeline | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/animation- src/__tests__/canvas- src/__tests__/viewport-` |
| Drawing & Raster Editing | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/drawing- src/__tests__/raster-editing-` |
| AI / Orchestration & Runtime | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/agent- src/__tests__/piagent- src/__tests__/tool-runner src/__tests__/use-agent-` |
| AI / Tools (map, sprite) | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/ai-` |
| AI / Providers & Messages | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/llm-provider-` |
| AI / Skills | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/skill-` |
| Chat | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/chat-` |
| Export | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/export-` |
| File Tree & Git | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/file-tree-` |
| Settings | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/settings-` |
| QA / Performance Reporting | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/qa-report src/__tests__/perf/` |
| Error Handling & Crash Recovery | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/error-boundary` |
| Keyboard & Interactions | `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/keyboard- src/__tests__/interaction-` |
| Rust backend (`src-tauri/`) | `pnpm test:rust` (must also pass `pnpm lint && pnpm typecheck` if frontend types change) |
| Cross-domain (multiple areas) | `pnpm verify` (frontend only) or `pnpm verify:full` (includes Rust) |

---

## 5. How to use this inventory

### For PR authors

Run the minimum verification for every domain your PR touches (Section 4). If your PR introduces a new capability:

- Check Section 3 for related gaps — your PR may be the right time to fill one.
- State the verification command(s) you ran in the PR description.

### For issue creators (new capability issues)

Every new capability issue must state its **minimum verification method** in the issue body. Use Section 4 as a template: pick the closest domain and specify the exact `pnpm test -- …` glob or command.

Example:

> **Minimum verification**: `pnpm lint && pnpm typecheck && pnpm test -- src/__tests__/agent-`

### For reviewers

Confirm the PR description lists verification commands that match the touched domains. Section 4 is the authoritative reference for which tests belong to which domain.
