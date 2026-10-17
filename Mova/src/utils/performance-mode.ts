export const MOVA_PERFORMANCE_MODE_STORAGE_KEY = "mova.performanceMode"
export const MOVA_PERFORMANCE_MODE_QUERY_KEY = "mova_perf_mode"
const PERFORMANCE_MODES = ["lite"] as const

export type MovaPerformanceMode = (typeof PERFORMANCE_MODES)[number]

function isPerformanceMode(value: string | undefined): value is MovaPerformanceMode {
  return PERFORMANCE_MODES.some((mode) => mode === value)
}

export function resolvePerformanceMode(
  value: string | null | undefined,
): MovaPerformanceMode | undefined {
  const normalized = value?.trim().toLowerCase()
  if (normalized === undefined || normalized === "") return undefined
  return isPerformanceMode(normalized) ? normalized : undefined
}

function readGlobalLocationSearch(): string | undefined {
  return globalThis.location?.search || undefined
}

function readGlobalLocalStorage(): Pick<Storage, "getItem"> | undefined {
  return globalThis.localStorage
}

function readQueryPerformanceMode(search: string | undefined) {
  if (search === undefined || search === "") return undefined
  const params = new URLSearchParams(search)
  return resolvePerformanceMode(params.get(MOVA_PERFORMANCE_MODE_QUERY_KEY))
}

function readStoredPerformanceMode(storage: Pick<Storage, "getItem"> | undefined) {
  if (storage === undefined) return undefined
  return resolvePerformanceMode(
    storage.getItem(MOVA_PERFORMANCE_MODE_STORAGE_KEY) ?? undefined,
  )
}

export function getConfiguredPerformanceMode(options: {
  search?: string
  storage?: Pick<Storage, "getItem">
} = {}): MovaPerformanceMode | undefined {
  try {
    const search = options.search ?? readGlobalLocationSearch()
    const queryMode = readQueryPerformanceMode(search)
    if (queryMode !== undefined) return queryMode

    const storage = options.storage ?? readGlobalLocalStorage()
    return readStoredPerformanceMode(storage)
  } catch {
    return undefined
  }
}

export function applyConfiguredPerformanceMode(doc?: Document) {
  try {
    const targetDocument = doc ?? document
    const mode = getConfiguredPerformanceMode()
    if (mode === undefined) {
      targetDocument.documentElement.removeAttribute("data-mova-performance-mode")
      return
    }

    targetDocument.documentElement.setAttribute("data-mova-performance-mode", mode)
  } catch {
    // Performance mode is optional and must never block app startup.
  }
}
