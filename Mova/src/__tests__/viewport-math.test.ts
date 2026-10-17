import { describe, expect, it } from "vitest"
import {
  clampScale,
  calculateContentPosition,
  calculateBasePosition,
  calculateOriginPosition,
  zoomScale,
  zoomAroundPoint,
  scalePercent,
  MIN_SCALE,
  MAX_SCALE,
  ZOOM_FACTOR,
} from "../../src/utils/viewport-math"

describe("viewport-math", () => {
  describe("clampScale", () => {
    it("clamps below minimum", () => {
      expect(clampScale(0)).toBe(MIN_SCALE)
      expect(clampScale(-1)).toBe(MIN_SCALE)
    })

    it("clamps above maximum", () => {
      expect(clampScale(100)).toBe(MAX_SCALE)
    })

    it("returns value in range unchanged", () => {
      expect(clampScale(1)).toBe(1)
      expect(clampScale(5)).toBe(5)
    })
  })

  describe("zoomScale", () => {
    it("zooms in with factor", () => {
      expect(zoomScale(1, 1)).toBeCloseTo(ZOOM_FACTOR)
      expect(zoomScale(1, 2)).toBeCloseTo(2 * ZOOM_FACTOR)
    })

    it("zooms out with factor", () => {
      expect(zoomScale(-1, 1)).toBeCloseTo(1 / ZOOM_FACTOR)
      expect(zoomScale(-1, 2)).toBeCloseTo(2 / ZOOM_FACTOR)
    })

    it("clamps to bounds", () => {
      expect(zoomScale(-1, MIN_SCALE)).toBe(MIN_SCALE)
      expect(zoomScale(1, MAX_SCALE)).toBe(MAX_SCALE)
    })
  })

  describe("calculateContentPosition", () => {
    it("centers artboard in stage with no pan offset", () => {
      const pos = calculateContentPosition({
        scale: 1,
        stagePos: { x: 0, y: 0 },
        stageSize: { width: 800, height: 600 },
        artboardWidth: 400,
        artboardHeight: 300,
      })
      expect(pos.x).toBe(200) // (800 - 400) / 2
      expect(pos.y).toBe(150) // (600 - 300) / 2
    })

    it("accounts for pan offset", () => {
      const pos = calculateContentPosition({
        scale: 1,
        stagePos: { x: 50, y: -30 },
        stageSize: { width: 800, height: 600 },
        artboardWidth: 400,
        artboardHeight: 300,
      })
      expect(pos.x).toBe(250) // 200 + 50
      expect(pos.y).toBe(120) // 150 + (-30)
    })

    it("accounts for scale", () => {
      const pos = calculateContentPosition({
        scale: 2,
        stagePos: { x: 0, y: 0 },
        stageSize: { width: 800, height: 600 },
        artboardWidth: 400,
        artboardHeight: 300,
      })
      expect(pos.x).toBe(0) // (800 - 800) / 2
      expect(pos.y).toBe(0) // (600 - 600) / 2
    })
  })

  describe("calculateBasePosition", () => {
    it("centers when scale is 1", () => {
      const base = calculateBasePosition({ width: 1000, height: 800 }, 500, 400, 1)
      expect(base.x).toBe(250)
      expect(base.y).toBe(200)
    })

    it("handles larger-than-stage artboard", () => {
      const base = calculateBasePosition({ width: 800, height: 600 }, 1600, 1200, 1)
      expect(base.x).toBe(-400)
      expect(base.y).toBe(-300)
    })
  })

  describe("calculateOriginPosition", () => {
    it("adds stagePos to base", () => {
      const origin = calculateOriginPosition(
        { x: 100, y: 200 },
        { x: 30, y: -40 },
      )
      expect(origin).toEqual({ x: 130, y: 160 })
    })
  })

  describe("zoomAroundPoint", () => {
    it("zooms in around pointer position at center", () => {
      const result = zoomAroundPoint(
        { x: 400, y: 300 },
        1,
        1,
        400,
        300,
        { width: 800, height: 600 },
        { x: 0, y: 0 },
      )
      expect(result.newScale).toBeCloseTo(ZOOM_FACTOR)
      // Pointer was at center of stage and center of artboard, so
      // zooming around center should still have stage near center
      expect(result.newStagePos.x).toBeCloseTo(0, 0)
      expect(result.newStagePos.y).toBeCloseTo(0, 0)
    })

    it("zooms out around pointer", () => {
      const result = zoomAroundPoint(
        { x: 400, y: 300 },
        1,
        -1,
        400,
        300,
        { width: 800, height: 600 },
        { x: 0, y: 0 },
      )
      expect(result.newScale).toBeCloseTo(1 / ZOOM_FACTOR)
    })

    it("zooms around offset pointer away from center", () => {
      const result = zoomAroundPoint(
        { x: 100, y: 100 },
        2,
        1,
        400,
        300,
        { width: 800, height: 600 },
        { x: 0, y: 0 },
      )
      // When pointer is not centered, new stage pos should shift
      expect(result.newScale).toBeCloseTo(2 * ZOOM_FACTOR)
      expect(result.newStagePos.x).not.toBe(0)
      expect(result.newStagePos.y).not.toBe(0)
    })
  })

  describe("scalePercent", () => {
    it("rounds to nearest integer", () => {
      expect(scalePercent(1)).toBe(100)
      expect(scalePercent(0.5)).toBe(50)
      expect(scalePercent(2.75)).toBe(275)
    })
  })

  describe("constants", () => {
    it("has valid zoom factor", () => {
      expect(ZOOM_FACTOR).toBeGreaterThan(1)
    })

    it("has min less than max", () => {
      expect(MIN_SCALE).toBeLessThan(MAX_SCALE)
    })
  })
})
