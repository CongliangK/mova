export const MOVA_PERF_DEBUG_QUERY_KEY = "mova_perf_debug"
export const MOVA_PERF_DEBUG_STORAGE_KEY = "mova.perfDebug"

const truthyValues = new Set(["1", "true", "yes", "on"])

const isTruthy = (value: string | null | undefined) => {
  if (!value) {
    return false
  }

  return truthyValues.has(value.trim().toLowerCase())
}

export function getPerfDebugState(options: {
  search?: string
  storage?: Pick<Storage, "getItem">
} = {}) {
  const search = options.search ?? (typeof window === "undefined" ? "" : window.location.search)

  const queryValue = new URLSearchParams(search).get(MOVA_PERF_DEBUG_QUERY_KEY)
  if (queryValue !== null) {
    return { enabled: isTruthy(queryValue), source: "query" as const }
  }

  try {
    const storage = options.storage ?? (typeof window === "undefined" ? undefined : window.localStorage)
    return { enabled: isTruthy(storage?.getItem(MOVA_PERF_DEBUG_STORAGE_KEY)), source: "storage" as const }
  } catch {
    return { enabled: false, source: "unavailable" as const }
  }
}

const isPerfDebugEnabled = () => getPerfDebugState().enabled

export interface PerfDebugSnapshot {
  rafFps: number
  resizePerSecond: number
  totalResizeEvents: number
  longTaskCount: number
  longTaskSupported: boolean
  uptimeSeconds: number
}

let _overlayInitialized = false
let _totalResizeEvents = 0
let _sampleResizeEvents = 0
let _sampleFrames = 0
let _rafFps = 0
let _longTaskCount = 0
let _longTaskSupported = false
let _lastSampleTime = 0
let _startedAt = 0

export function getPerfDebugSnapshot(): PerfDebugSnapshot | null {
  if (!_overlayInitialized) {
    return null
  }

  const now = performance.now()
  const elapsedMs = Math.max(now - _lastSampleTime, 1)
  const resizePerSecond = (_sampleResizeEvents * 1000) / elapsedMs

  return {
    rafFps: _rafFps,
    resizePerSecond,
    totalResizeEvents: _totalResizeEvents,
    longTaskCount: _longTaskCount,
    longTaskSupported: _longTaskSupported,
    uptimeSeconds: (now - _startedAt) / 1000,
  }
}

const formatNumber = (value: number, digits = 0) => value.toFixed(digits)

export const initPerfDebugOverlay = () => {
  if (!isPerfDebugEnabled()) {
    return
  }

  _overlayInitialized = true

  const overlay = document.createElement("div")
  overlay.setAttribute("data-mova-perf-debug", "true")
  overlay.style.position = "fixed"
  overlay.style.right = "12px"
  overlay.style.bottom = "12px"
  overlay.style.zIndex = "2147483647"
  overlay.style.pointerEvents = "none"
  overlay.style.padding = "8px 10px"
  overlay.style.borderRadius = "8px"
  overlay.style.background = "rgba(0, 0, 0, 0.72)"
  overlay.style.color = "#d1fae5"
  overlay.style.font = "12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
  overlay.style.whiteSpace = "pre"
  overlay.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.28)"
  document.body.appendChild(overlay)

  _totalResizeEvents = 0
  _sampleResizeEvents = 0
  _sampleFrames = 0
  _rafFps = 0
  _longTaskCount = 0
  _longTaskSupported = false
  let rafId = 0
  _lastSampleTime = performance.now()
  _startedAt = _lastSampleTime

  const onResize = () => {
    _totalResizeEvents += 1
    _sampleResizeEvents += 1
  }

  window.addEventListener("resize", onResize, { passive: true })

  const runFrame = () => {
    _sampleFrames += 1
    rafId = window.requestAnimationFrame(runFrame)
  }
  rafId = window.requestAnimationFrame(runFrame)

  let longTaskObserver: PerformanceObserver | undefined
  if ("PerformanceObserver" in window) {
    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes ?? []
    _longTaskSupported = supportedEntryTypes.includes("longtask")

    if (_longTaskSupported) {
      try {
        longTaskObserver = new PerformanceObserver((entryList) => {
          _longTaskCount += entryList.getEntries().length
        })
        longTaskObserver.observe({ entryTypes: ["longtask"] })
      } catch {
        _longTaskSupported = false
      }
    }
  }

  const render = () => {
    const now = performance.now()
    const elapsedMs = Math.max(now - _lastSampleTime, 1)
    const resizePerSecond = (_sampleResizeEvents * 1000) / elapsedMs
    _rafFps = (_sampleFrames * 1000) / elapsedMs
    _sampleFrames = 0
    _sampleResizeEvents = 0
    _lastSampleTime = now

    const uptimeSeconds = (now - _startedAt) / 1000
    overlay.textContent = [
      "Mova perf debug",
      `uptime: ${formatNumber(uptimeSeconds, 0)}s`,
      `rAF FPS: ${formatNumber(_rafFps, 1)}`,
      `resize: ${formatNumber(resizePerSecond, 1)}/s (${_totalResizeEvents} total)`,
      `longtask: ${_longTaskSupported ? `${_longTaskCount} total` : "unsupported"}`,
    ].join("\n")
  }

  render()
  const intervalId = window.setInterval(render, 1000)

  const cleanup = () => {
    _overlayInitialized = false
    window.removeEventListener("beforeunload", cleanup)
    window.removeEventListener("resize", onResize)
    window.cancelAnimationFrame(rafId)
    window.clearInterval(intervalId)
    longTaskObserver?.disconnect()
    overlay.remove()
  }

  window.addEventListener("beforeunload", cleanup)

  console.info(
    `[Mova perf debug] enabled via ?${MOVA_PERF_DEBUG_QUERY_KEY}=1 or localStorage ${MOVA_PERF_DEBUG_STORAGE_KEY}=1`,
  )
}
