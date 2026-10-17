# Canvas/Timeline Performance Optimization Stage 1 Plan

> Scope: Low-risk, verifiable Stage 1 optimizations for Canvas/Timeline high-frequency interaction and rendering hotspots. No tech stack replacement, no large-scale UI rewrite, no piAgent runtime or AI core changes.

## Pre-optimization baseline

- All 40 tests pass.
- `pnpm perf:baseline` passes (1 test, all budgets satisfied).
- Performance baseline JSON report: `Mova/reports/performance-baseline-stage1.json`

## Hotspot analysis (from code review)

### CanvasArea (`canvas-area.tsx`)
1. **~15 individual Zustand selectors** — each triggers re-render on any slice change.
2. **`handleWheel`** depends on `artboardHeight`, `artboardWidth`, `scale`, `stagePos`, `stageSize` — recreates on every zoom/pan/resize.
3. **`handleMouseMove` / `handleMouseDown` / `handleMouseUp`** have many closure deps (`selectedImageCanSave`, `selectedImagePath`, `activeAnimation`, `activeToolConfig`, `getArtboardPointer`).
4. **Large component with 3 conditional branches** — full re-render on any state change.
5. **`contentPosition`**, **`checkerPattern`**, **`animationFrameSrcs`** — correctly memoized.
6. **ResizeObserver** — correctly uses `requestAnimationFrame` coalescing.
7. **No throttle/debounce** on pan (`handleMouseMove` calls `setStagePos` on every mousemove).

### AnimationTimeline (`animation-timeline.tsx`)
1. **~25 individual Zustand selectors** (selectors + actions).
2. **Playback `useEffect`** correctly uses `getState()` internally — no fix needed.
3. **`handleDrop`**, **`handleContextMenu`**, **`handleDragStart`** — HOFs creating new closures on each render.
4. **Per-frame rendering** creates new `on*` HOF handlers for every frame in the map.
5. **`importDroppedFiles`**, **`importDroppedImage`** — have many closure deps.

### Animation Store (`animation-store.ts`)
1. State operations are synchronous — fine.
2. **`reorderFrames`** calls `normalizeAnimation` — O(n) per call, but acceptable.
3. **No derived selectors** — components subscribe to individual slices, which is idiomatic Zustand.

## Planned optimizations (low risk, incremental)

### A. Optimize Zustand subscriptions in CanvasArea
- Group related state reads into fewer selectors where possible (e.g., animation state object).
- Use `useAnimationStore.getState()` in event handlers to avoid closure deps on animation/project state.

### B. Add throttle for pan during mouse move
- Add a lightweight rAF throttle to `handleMouseMove` for panning to avoid per-event `setStagePos`.

### C. Extract pure helpers and memo boundaries
- Extract zoom math (`calculateZoomPosition`) as a pure helper.
- Extract viewport positioning logic (`useViewportPosition`) as a separate hook.
- Memoize the `timelineSelector` JSX block in AnimationTimeline.

### D. Optimize AnimationTimeline frame rendering
- Extract `TimelineFrameButton` as a `React.memo` component to avoid re-rendering all frames on playback tick.
- Memoize the frame handler factory functions.

### E. Add Canvas/Timeline perf smoke metrics
- Add new budgeted metrics for animation store operations.
- Add throttle/helper unit tests.

### F. Optimize grid overlay rendering
- Extract `getGridStrokeColor()` as a module-level helper (it reads CSS custom properties).
- Ensure `GridOverlay` renders are well-memoized.

## Non-goals
- No React/Konva replacement.
- No piAgent runtime or AI core changes.
- No large-scale Workbench architecture refactor.
- No E2E or Playwright tests.
- No Rust/Cargo changes.
- No provider/API calls.
- No product behavior changes (playback semantics, grid/onion skin functionality, keyboard shortcuts).

## Acceptance commands

```bash
cd Mova
pnpm lint
pnpm typecheck
pnpm test
pnpm perf:baseline
pnpm verify  # lint + typecheck + test + build
```

## Rollback strategy
- All changes are contained within Canvas/Timeline components and animation store.
- If any optimization causes regression, revert individual commits/files.
- The perf baseline smoke provides tripwire budgets to catch regressions early.

## Testing additions
- Add unit tests for throttle utility.
- Add unit tests for extracted pure helpers (zoom math, viewport positioning).
- Add new perf smoke metrics for animation store operations (append, insert, delete, duplicate at scale).
- Existing component behavior tests must continue passing unchanged.

## Residual risks
- rAF throttle for panning may introduce slight visual latency — test subjectively.
- Memo boundaries may cause stale closure bugs if deps are wrong — covered by existing behavior tests.
- Perf smoke budgets are deliberately loose; later stages should tighten them after repeated measurements.
