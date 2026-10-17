import { isBrowserDemoWorkspaceEnabled } from "./browser-demo-workspace"

const DEMO_AI_MOCK_QUERY_KEY = "demoAiMock"
const DEMO_AI_MOCK_STORAGE_KEY = "mova:browserDemoAiMock"

type DemoAiMockEnv = Pick<ImportMetaEnv, "DEV"> & Partial<Pick<ImportMetaEnv, "MODE">>

function getDemoAiMockFlagFromLocation(location: Location | URL) {
  const params = new URLSearchParams(location.search)
  return params.get(DEMO_AI_MOCK_QUERY_KEY) === "1"
}

function getDemoAiMockFlagFromStorage(storage: Storage | undefined) {
  try {
    return storage?.getItem(DEMO_AI_MOCK_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function isBrowserDemoAiMockEnabled({
  env = import.meta.env,
  location = window.location,
  storage = window.localStorage,
}: {
  env?: DemoAiMockEnv
  location?: Location | URL
  storage?: Storage
} = {}) {
  const isSafeRuntime = env.DEV || env.MODE === "test"
  if (!isSafeRuntime) return false
  if (!isBrowserDemoWorkspaceEnabled({ env, location, storage })) return false
  return getDemoAiMockFlagFromLocation(location) || getDemoAiMockFlagFromStorage(storage)
}
