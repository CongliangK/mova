import { afterEach, describe, expect, it } from "vitest"
import {
  isTimelineImagePath,
  toDisplayAssetUrl,
} from "../../src/utils/asset-url"

const originalInternals = (globalThis as { __TAURI_INTERNALS__?: unknown })
  .__TAURI_INTERNALS__

describe("asset-url helpers", () => {
  afterEach(() => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: originalInternals,
      configurable: true,
    })
  })

  it("preserves remote and data URLs", () => {
    expect(toDisplayAssetUrl("https://example.com/hero.png")).toBe(
      "https://example.com/hero.png",
    )
    expect(toDisplayAssetUrl("data:image/png;base64,AQI=")).toBe(
      "data:image/png;base64,AQI=",
    )
  })

  it("uses the Tauri asset converter for local paths when available", () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      value: {
        convertFileSrc: (path: string, protocol?: string) =>
          `${protocol}://converted/${path}`,
      },
      configurable: true,
    })

    expect(toDisplayAssetUrl("/tmp/mova/assets/hero sprite.png")).toBe(
      "asset://converted//tmp/mova/assets/hero sprite.png",
    )
    expect(toDisplayAssetUrl("assets/frames/idle.png")).toBe(
      "asset://converted/assets/frames/idle.png",
    )
  })

  it("detects timeline-supported image paths", () => {
    expect(isTimelineImagePath("/tmp/hero.PNG")).toBe(true)
    expect(isTimelineImagePath("/tmp/hero.webp")).toBe(true)
    expect(isTimelineImagePath("/tmp/readme.md")).toBe(false)
  })
})
