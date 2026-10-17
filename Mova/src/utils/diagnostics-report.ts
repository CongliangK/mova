import type { PerfDebugSnapshot } from "./perf-debug"
import { MOVA_PERF_DEBUG_QUERY_KEY, getPerfDebugSnapshot, getPerfDebugState } from "./perf-debug"
import { MOVA_PERFORMANCE_MODE_QUERY_KEY, getConfiguredPerformanceMode } from "./performance-mode"

const MANUAL = "manual collection required"
const SAFE_QUERY_KEYS = new Set([MOVA_PERF_DEBUG_QUERY_KEY, MOVA_PERFORMANCE_MODE_QUERY_KEY])
const SENSITIVE_QUERY_KEY = /api|key|token|secret|password|credential|auth|bearer|prompt|payload|message|path|dir|folder|project/i

interface DiagnosticsReportOptions {
  now?: Date
  search?: string
  storage?: Pick<Storage, "getItem">
  userAgent?: string
  viewportWidth?: number
  viewportHeight?: number
  devicePixelRatio?: number
  perfSnapshot?: PerfDebugSnapshot
}

function readLocationSearch() {
  if (typeof window === "undefined") return ""
  return window.location.search
}

function readStorage() {
  if (typeof window === "undefined") return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function readUserAgent() {
  if (typeof navigator === "undefined") return "unavailable"
  return navigator.userAgent || "unavailable"
}

function readViewportWidth() {
  if (typeof window === "undefined") return undefined
  return window.innerWidth
}

function readViewportHeight() {
  if (typeof window === "undefined") return undefined
  return window.innerHeight
}

function readDevicePixelRatio() {
  if (typeof window === "undefined") return undefined
  return window.devicePixelRatio
}

function redactQueryValue(key: string, value: string) {
  if (!SAFE_QUERY_KEYS.has(key) || SENSITIVE_QUERY_KEY.test(key)) return "[redacted]"
  return value === "" ? "(empty)" : value
}

export function formatSafeQueryFlags(search: string) {
  const params = new URLSearchParams(search)
  const entries = Array.from(params.entries())
  if (entries.length === 0) return "none"

  return entries.map(([key, value]) => `${key}=${redactQueryValue(key, value)}`).join(", ")
}

export function buildLinuxDiagnosticsReport(options: DiagnosticsReportOptions = {}) {
  const now = options.now ?? new Date()
  const search = options.search ?? readLocationSearch()
  const storage = options.storage ?? readStorage()
  const performanceMode = getConfiguredPerformanceMode({ search, storage }) ?? "default"
  const perfDebug = getPerfDebugState({ search, storage })
  const width = options.viewportWidth ?? readViewportWidth()
  const height = options.viewportHeight ?? readViewportHeight()
  const dpr = options.devicePixelRatio ?? readDevicePixelRatio()
  const viewport = width === undefined || height === undefined ? "unavailable" : `${width} × ${height}`
  const pixelRatio = dpr === undefined ? "unavailable" : String(dpr)

  return [
    "# Mova Linux UI performance diagnostic draft",
    "",
    `Date/time: ${now.toISOString()}`,
    `Commit/branch: ${MANUAL}`,
    `System: ${MANUAL} (distro, kernel, CPU, GPU, driver)`,
    `Session: ${MANUAL} (XDG_SESSION_TYPE, display server, monitor scale/refresh)`,
    `Launch mode: ${MANUAL} (Chrome dev server / pnpm tauri dev / linux-fast / linux-compat / linux-x11 / linux-force-compositing / env vars)`,
    `Frontend options: performance mode=${performanceMode}; perf debug overlay=${perfDebug.enabled ? "enabled" : "disabled"} (${perfDebug.source})`,
    `URL/query flags: ${formatSafeQueryFlags(search)}`,
    `User agent: ${options.userAgent ?? readUserAgent()}`,
    `Viewport: ${viewport}; devicePixelRatio=${pixelRatio}`,
    `OS/GPU/WebKitGTK details: ${MANUAL}`,
    "",
    "## Linux runtime comparison matrix",
    "",
    "Test the same project, display, and interaction with each mode:",
    "",
    "| # | Mode | Dev command | Install command | What's tested | Result |",
    "|---|------|-------------|-----------------|---------------|--------|",
    "| 1 | Default | `pnpm tauri dev` | `mova` | App default; baseline to confirm desktop-only issue | smooth / janky / visually corrupted / not tested |",
    "| 2 | Fast / DMABuf | `pnpm tauri:dev:linux-fast` | `mova-fast` | GPU buffer import (DMABuf) | smooth / janky / visually corrupted / not tested |",
    "| 3 | Compat / CPU | `pnpm tauri:dev:linux-compat` | `mova-compat` | Disables compositing + DMABuf; CPU path | smooth / janky / visually corrupted / not tested |",
    "| 4 | X11 compat | `pnpm tauri:dev:linux-x11` | `mova-x11` | Forces GDK_BACKEND=x11 + compat flags | smooth / janky / visually corrupted / not tested |",
    "| 5 | Force compositing | `pnpm tauri:dev:linux-force-compositing` | `mova-force-compositing` | Compositing enabled, DMABuf disabled | smooth / janky / visually corrupted / not tested |",
    "",
    "Collect with each result: distro/version, DE/compositor, session type, GPU/driver, WebKitGTK version, monitor scale/refresh.",
    "",
    "Scenario steps: manual collection required",
    (() => {
      const snapshot = options.perfSnapshot ?? getPerfDebugSnapshot()
      if (snapshot) {
        return `Idle overlay: rAF FPS=${snapshot.rafFps.toFixed(1)}, resize=${snapshot.resizePerSecond.toFixed(1)}/s (${snapshot.totalResizeEvents} total), longtask=${snapshot.longTaskSupported ? snapshot.longTaskCount : "unsupported"}, uptime=${snapshot.uptimeSeconds.toFixed(0)}s`
      }
      return "Idle overlay: manual collection required (rAF FPS, resize/s, longtask count/support)"
    })(),
    "During scenario overlay: manual collection required",
    "After scenario overlay: manual collection required",
    "Observed symptoms: manual collection required",
    "Notes/screenshots/logs: manual collection required",
    "",
    "Sensitive settings excluded: API keys, provider payloads, prompts, and project paths are intentionally not included.",
  ].join("\n")
}
