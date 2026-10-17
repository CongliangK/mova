import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SettingsPage } from "../../src/pages/settings-page"
import { useSettingsStore } from "../../src/stores/settings-store"
import { getPerfDebugState } from "../../src/utils/perf-debug"
import type { PerfDebugSnapshot } from "../../src/utils/perf-debug"
import { buildLinuxDiagnosticsReport } from "../../src/utils/diagnostics-report"

const showToast = vi.fn()

const mockGetPerfDebugSnapshot = vi.fn<() => PerfDebugSnapshot | null>()

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast }),
}))

vi.mock("../../src/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", toggle: vi.fn() }),
}))

vi.mock("../../src/utils/perf-debug", async () => {
  const actual = await vi.importActual<typeof import("../../src/utils/perf-debug")>("../../src/utils/perf-debug")
  return {
    ...actual,
    getPerfDebugSnapshot: (...args: unknown[]) => mockGetPerfDebugSnapshot(...args as []),
  }
})

describe("Settings diagnostics report", () => {
  beforeEach(() => {
    showToast.mockClear()
    mockGetPerfDebugSnapshot.mockReset().mockReturnValue(null)
    window.history.pushState({}, "", "/?mova_perf_mode=lite&mova_perf_debug=1&api_key=url-secret")
    window.localStorage.clear()
    window.localStorage.setItem("mova.performanceMode", "lite")
    window.localStorage.setItem("mova.perfDebug", "1")

    useSettingsStore.setState({
      locale: "en-US",
      llmConfigs: [
        {
          provider: "openai",
          model: "gpt-4o",
          apiKey: "sk-settings-secret",
          baseUrl: "https://example.test/v1",
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 2048,
          frequencyPenalty: 0,
          systemPrompt: "private prompt text",
        },
      ],
      activeLlmIndex: 0,
      imageGenConfig: {
        provider: "suchuang",
        model: "nanobanana",
        apiKey: "image-settings-secret",
        baseUrl: "https://images.example.test",
        defaultParams: {},
      },
    })
  })

  it("renders a copyable Linux diagnostics report without secrets", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    render(<SettingsPage onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "diagnostics" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Diagnostics \/ Performance/i }))

    const report = screen.getByLabelText("Linux diagnostics report draft") as HTMLTextAreaElement
    expect(report.value).toContain("# Mova Linux UI performance diagnostic draft")
    expect(report.value).toContain("System: manual collection required")
    expect(report.value).toContain("Frontend options: performance mode=lite; perf debug overlay=enabled (query)")
    expect(report.value).toContain("mova_perf_mode=lite")
    expect(report.value).toContain("api_key=[redacted]")
    expect(report.value).not.toContain("sk-settings-secret")
    expect(report.value).not.toContain("image-settings-secret")
    expect(report.value).not.toContain("private prompt text")
    expect(report.value).not.toContain("url-secret")

    fireEvent.click(screen.getByRole("button", { name: /Copy report/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const copiedReport = writeText.mock.calls[0]?.[0] as string
    expect(copiedReport).toContain("manual collection required")
    expect(copiedReport).toContain("api_key=[redacted]")
    expect(copiedReport).not.toContain("sk-settings-secret")
    expect(copiedReport).not.toContain("image-settings-secret")
    expect(showToast).toHaveBeenCalledWith("success", "Diagnostics report copied.")
  })

  it("returns disabled when storage getItem throws (blocked storage path)", () => {
    const state = getPerfDebugState({
      search: "",
      storage: { getItem: () => { throw new Error("blocked") } },
    })
    expect(state).toEqual({ enabled: false, source: "unavailable" })
  })

  it("builds diagnostics report without crashing when storage is unavailable", () => {
    const report = buildLinuxDiagnosticsReport({
      now: new Date("2025-01-01T00:00:00Z"),
      search: "",
      storage: { getItem: () => { throw new Error("blocked") } },
    })
    expect(report).toContain("# Mova Linux UI performance diagnostic draft")
    expect(report).toContain("perf debug overlay=disabled (unavailable)")
  })

  it("inserts snapshot data into the report when Capture snapshot is clicked", async () => {
    const snapshot: PerfDebugSnapshot = {
      rafFps: 58.3,
      resizePerSecond: 0.5,
      totalResizeEvents: 12,
      longTaskCount: 3,
      longTaskSupported: true,
      uptimeSeconds: 245,
    }
    mockGetPerfDebugSnapshot.mockReturnValue(snapshot)

    render(<SettingsPage onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "diagnostics" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Diagnostics \/ Performance/i }))

    fireEvent.click(screen.getByRole("button", { name: /Capture snapshot/i }))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith("success", "Perf snapshot captured and inserted into report.")
    )

    const report = screen.getByLabelText("Linux diagnostics report draft") as HTMLTextAreaElement
    expect(report.value).toContain("rAF FPS=58.3")
    expect(report.value).toContain("resize=0.5/s (12 total)")
    expect(report.value).toContain("longtask=3")
    expect(report.value).toContain("uptime=245s")
    expect(report.value).not.toContain("Idle overlay: manual collection required")
  })

  it("auto-populates idle overlay row when getPerfDebugSnapshot returns live metrics", async () => {
    const snapshot: PerfDebugSnapshot = {
      rafFps: 58.3,
      resizePerSecond: 0.5,
      totalResizeEvents: 12,
      longTaskCount: 3,
      longTaskSupported: true,
      uptimeSeconds: 245,
    }
    mockGetPerfDebugSnapshot.mockReturnValue(snapshot)

    render(<SettingsPage onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "diagnostics" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Diagnostics \/ Performance/i }))

    // No capture button click — report should auto-populate from live getter
    const report = screen.getByLabelText("Linux diagnostics report draft") as HTMLTextAreaElement
    expect(report.value).toContain("rAF FPS=58.3")
    expect(report.value).toContain("resize=0.5/s (12 total)")
    expect(report.value).toContain("longtask=3")
    expect(report.value).toContain("uptime=245s")
    expect(report.value).not.toContain("Idle overlay: manual collection required")
  })

  it("auto-populates idle overlay when buildLinuxDiagnosticsReport is called without perfSnapshot option", () => {
    const snapshot: PerfDebugSnapshot = {
      rafFps: 60.0,
      resizePerSecond: 0.0,
      totalResizeEvents: 0,
      longTaskCount: 0,
      longTaskSupported: false,
      uptimeSeconds: 10,
    }
    mockGetPerfDebugSnapshot.mockReturnValue(snapshot)

    const report = buildLinuxDiagnosticsReport({
      now: new Date("2025-01-01T00:00:00Z"),
      search: "",
    })

    expect(report).toContain("rAF FPS=60.0")
    expect(report).toContain("resize=0.0/s (0 total)")
    expect(report).toContain("longtask=unsupported")
    expect(report).not.toContain("Idle overlay: manual collection required")
  })

  it("includes the full Linux runtime comparison matrix in the report", () => {
    const report = buildLinuxDiagnosticsReport({
      now: new Date("2025-01-01T00:00:00Z"),
      search: "",
    })

    // Matrix section header
    expect(report).toContain("## Linux runtime comparison matrix")
    expect(report).toContain("Test the same project, display, and interaction with each mode:")

    // Table headers
    expect(report).toContain("| # | Mode | Dev command | Install command | What's tested | Result |")

    // All 5 modes present with their commands
    expect(report).toContain("| 1 | Default | `pnpm tauri dev` | `mova` |")
    expect(report).toContain("| 2 | Fast / DMABuf | `pnpm tauri:dev:linux-fast` | `mova-fast` |")
    expect(report).toContain("| 3 | Compat / CPU | `pnpm tauri:dev:linux-compat` | `mova-compat` |")
    expect(report).toContain("| 4 | X11 compat | `pnpm tauri:dev:linux-x11` | `mova-x11` |")
    expect(report).toContain("| 5 | Force compositing | `pnpm tauri:dev:linux-force-compositing` | `mova-force-compositing` |")

    // Result placeholders are present
    expect(report).toContain("smooth / janky / visually corrupted / not tested")

    // Collection instructions
    expect(report).toContain("Collect with each result:")

    // Secrets are not leaked (cross-check with redaction logic)
    expect(report).not.toContain("api_key")
    expect(report).not.toContain("sk-")
  })

  it("shows disabled capture button when perf overlay is not available", () => {
    mockGetPerfDebugSnapshot.mockReturnValue(null)

    render(<SettingsPage onClose={vi.fn()} />)

    fireEvent.change(screen.getByPlaceholderText("Search settings..."), {
      target: { value: "diagnostics" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Diagnostics \/ Performance/i }))

    const captureBtn = screen.getByRole("button", { name: /Capture snapshot/i })
    expect(captureBtn).toBeDisabled()

    const report = screen.getByLabelText("Linux diagnostics report draft") as HTMLTextAreaElement
    expect(report.value).toContain("Idle overlay: manual collection required")
  })
})
