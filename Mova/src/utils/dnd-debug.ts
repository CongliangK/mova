const DND_LOG_STORAGE_KEY = "mova:dnd-debug-logs"
const DND_LOG_ENABLED_STORAGE_KEY = "mova:dnd-debug"
const DND_LOG_QUERY_KEY = "dndDebug"
const MAX_DND_LOGS = 200

declare global {
  interface Window {
    __MOVA_DND_LOGS__?: Array<{ at: string; label: string; data: unknown }>
  }
}

let cachedDndLoggingEnabled: boolean | null = null

function isDndLoggingEnabled() {
  if (cachedDndLoggingEnabled !== null) return cachedDndLoggingEnabled

  try {
    const params = new URLSearchParams(window.location.search)
    cachedDndLoggingEnabled =
      params.get(DND_LOG_QUERY_KEY) === "1" ||
      window.localStorage.getItem(DND_LOG_ENABLED_STORAGE_KEY) === "1"
  } catch {
    cachedDndLoggingEnabled = false
  }

  return cachedDndLoggingEnabled
}

export function resetDndDebugLoggingCacheForTests() {
  cachedDndLoggingEnabled = null
}

export function logDnd(label: string, data: unknown) {
  if (!isDndLoggingEnabled()) return

  const entry = { at: new Date().toISOString(), label, data }
  window.__MOVA_DND_LOGS__ = [...(window.__MOVA_DND_LOGS__ ?? []), entry].slice(
    -MAX_DND_LOGS,
  )
  try {
    window.localStorage.setItem(
      DND_LOG_STORAGE_KEY,
      JSON.stringify(window.__MOVA_DND_LOGS__),
    )
  } catch {
    // Debug logging must never block drag/drop interactions.
  }
  console.info(`[timeline-dnd] ${label}`, data)
}
