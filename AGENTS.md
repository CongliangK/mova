# AGENTS.md

This file provides guidance to pi and other AI coding agents when working with code in this repository.

## Project overview

Mova is an AI-assisted 2D game character animation desktop app. Users describe animations in chat; the app uses LLM/image-generation providers to create frames and can export sprite sheets and related assets.

Tech stack verified from `Mova/README.md`, `Mova/package.json`, and `Mova/src-tauri/Cargo.toml`:

- Desktop shell/backend: Tauri v2 + Rust 2021.
- Frontend: React 19, TypeScript 6, Vite 8.
- Styling: Tailwind CSS 4 via `@tailwindcss/vite` and `@import "tailwindcss"` in CSS.
- State/UI: Zustand, Konva/react-konva.
- Tests: Vitest with jsdom and globals.
- Package manager: pnpm.

## Repository layout

- Repo root is this directory. The runnable app lives one level deeper in `Mova/`.
- `Mova/src/`: React frontend.
  - `main.tsx`: React entry; wraps `App` in `ErrorBoundary` and `ToastProvider`.
  - `App.tsx`: top-level flow; shows `WelcomePage` until a project is loaded, then `AppLayout` with sidebar/canvas/chat.
  - `components/canvas/`: Konva canvas, drawing, image editing, timeline UI.
  - `components/chat/`: AI chat UI.
  - `components/export/`: export wizard UI.
  - `components/file-tree/`: project file browser.
  - `components/layout/`: app shell, panels, toolbar/status UI.
  - `services/ai/`: agent orchestrator, skill registry, providers, tools.
  - `services/drawing/`: drawing tools and raster editing.
  - `stores/`: Zustand stores for project, animation, chat, settings, drawing, git, and file tree.
  - `styles/globals.css`: design tokens, theme variables, Tailwind import.
- `Mova/src-tauri/`: Rust backend.
  - `src/lib.rs`: Tauri builder, plugins, IPC command registration.
  - `src/commands/`: IPC handlers for project/image/export/map/file tree/git/file ops/file watcher.
  - `src/services/`: image I/O and sprite sheet services.
  - `capabilities/default.json`: Tauri permissions/capabilities.
- Outer `skills/generate2dmap/` and `skills/generate2dsprite/` helpers, prompts and associated documents are not distributed because their provenance is uncertain. Local originals remain outside the public snapshot. The app-owned runtime under `Mova/src/services/ai/skills/` remains unchanged.
- `tauri-tauri-ext/`: untracked nested Tauri source checkout in the current worktree; do not treat it as part of the Mova app unless the user explicitly asks.

## Common commands

Run these from the inner app directory:

```bash
cd Mova
pnpm install
pnpm dev                 # Vite dev server only on port 5173
pnpm tauri dev           # Full Tauri desktop app with hot reload
pnpm tauri:dev:x11-cpu   # Tauri dev with GDK_BACKEND=x11
pnpm lint                # ESLint flat config
pnpm typecheck           # tsc -b using tsconfig project references
pnpm test                # vitest run
pnpm test -- src/__tests__/file-tree-store.test.ts  # single test file
pnpm build               # tsc -b && vite build; frontend only
pnpm tauri build         # production Tauri build/bundles
pnpm tauri:build:linux   # Linux .deb/.rpm/AppImage helper
pnpm update:local        # build release binary and install/update local app on Linux/Windows
```

`package.json` has no format script. Prettier is installed as a dev dependency, but no Prettier config or repository format command was found.

Recommended verification order from the README/previous guidance:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Do not run `pnpm update:local` as routine verification: it installs/replaces user programs and requires a separate explicit deployment request. Verification must not change the user's installed app.

## Architecture notes

- Tauri dev startup is configured in `Mova/src-tauri/tauri.conf.json`: before dev, Tauri runs `corepack pnpm dev` and loads `http://localhost:5173`; production runs `corepack pnpm build` and serves `../dist`.
- `Mova/src-tauri/src/lib.rs` registers Tauri dialog and fs plugins plus IPC commands for project, export, image, map, file tree, git, file ops, and file watching.
- Frontend-to-backend calls use Tauri IPC (`@tauri-apps/api/core` in the frontend dependencies).
- AI flow: `AgentOrchestrator` requires a configured LLM provider and active skill, builds a system prompt plus context, streams provider responses, executes tool calls through `ToolRunner`, and allows up to 5 tool rounds per user message.
- Skill routing lives in `services/ai/skills/skill-registry.ts`; registered skills are character creation, general, sprite generation, and map generation.
- Project storage is directory-based according to the README (`project.json` plus asset folders such as characters/sheets/frames/maps/props), intended to be git-friendly.

## Coding conventions and constraints

- TypeScript config uses `verbatimModuleSyntax`; use `import type` for type-only imports.
- TypeScript config enables `erasableSyntaxOnly`; avoid syntax that cannot be erased cleanly, such as enums, namespaces, and parameter properties.
- TypeScript config also enables `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.
- ESLint ignores `dist`, `src-tauri/target`, and `.linux-toolchain`.
- Tailwind is v4: there is no Tailwind config in the app; styling configuration is via CSS and the Vite plugin.
- Vite watches exclude `src-tauri/**`; Tauri handles Rust rebuilds.
- If adding Tauri plugins or filesystem/dialog permissions, update `Mova/src-tauri/capabilities/default.json` as needed.
- Rust git integration uses `gix` (gitoxide), not `git2`; the rationale is documented in `Mova/src-tauri/Cargo.toml` comments.

## Testing and verification

- Tests live in `Mova/src/__tests__/` and use Vitest with `globals: true`, `environment: "jsdom"`, and `setupFiles: ['./src/__tests__/setup.ts']`.
- Component tests use Testing Library packages present in `package.json`.
- Rust inline unit tests live under `Mova/src-tauri/src/`; run Cargo tests with `--locked`.
- GitHub CI is in `.github/workflows/ci.yml`; it checks the frontend and Rust on Linux without publishing.

## Known project gotchas

- Commands must be run from the inner `Mova/` app directory, not the repository root.
- Vite uses strict port `5173`; it fails instead of selecting another port if occupied.
- `TAURI_DEV_HOST` controls Vite `server.host` and HMR host for remote development.
- Check provider registry availability; presets do not guarantee current remote API compatibility.
- `Cargo.lock` is tracked for reproducible application builds. Use `--locked` for checks/tests.

## Commit style

Use Conventional Commits, e.g. `feat(scope): description` and `fix(scope): description`. Read the root [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md) and [release checklist](docs/RELEASE_CHECKLIST.md) before preparing publication changes.
