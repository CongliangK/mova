import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { logDnd, resetDndDebugLoggingCacheForTests } from "../utils/dnd-debug"

describe("dnd debug logging", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/")
    window.localStorage.clear()
    window.__MOVA_DND_LOGS__ = undefined
    resetDndDebugLoggingCacheForTests()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.__MOVA_DND_LOGS__ = undefined
    resetDndDebugLoggingCacheForTests()
  })

  it("is disabled by default to keep dragover paths cheap", () => {
    logDnd("dragover", { files: 1 })

    expect(window.__MOVA_DND_LOGS__).toBeUndefined()
    expect(window.localStorage.getItem("mova:dnd-debug-logs")).toBeNull()
    expect(console.info).not.toHaveBeenCalled()
  })

  it("records logs after explicit opt-in", () => {
    window.localStorage.setItem("mova:dnd-debug", "1")
    resetDndDebugLoggingCacheForTests()

    logDnd("drop", { files: 2 })

    expect(window.__MOVA_DND_LOGS__).toHaveLength(1)
    expect(window.localStorage.getItem("mova:dnd-debug-logs")).toContain("drop")
    expect(console.info).toHaveBeenCalledOnce()
  })
})
