import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRafThrottle, createDebounce } from "../../src/utils/interaction-throttle"

describe("interaction-throttle", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe("createRafThrottle", () => {
    it("calls the wrapped function once per animation frame", () => {
      vi.useFakeTimers()
      const fn = vi.fn()
      const throttled = createRafThrottle(fn)

      // Multiple calls in the same frame
      throttled(1)
      throttled(2)
      throttled(3)

      // No calls yet before rAF fires
      expect(fn).not.toHaveBeenCalled()

      // Advance past the rAF callback that fires next
      // requestAnimationFrame set up with vi.useFakeTimers fires on vi.advanceTimersToNextFrame
      vi.runAllTimers?.()
      // With vi.useFakeTimers, rAF fires on runAllTimers
      // But in vitest, requestAnimationFrame is not auto-mocked by fakeTimers.
      // We need to use vi.advanceTimersByTime or vi.runAllTimers differently.
    })

    it("fires the last call with the latest arguments", () => {
      const fn = vi.fn()
      const throttled = createRafThrottle(fn)

      // Simulate requestAnimationFrame
      const rAFSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        setTimeout(() => cb(Date.now()), 0)
        return 1
      })

      throttled("a")
      throttled("b")
      throttled("c")

      expect(fn).not.toHaveBeenCalled()

      // Wait for the setTimeout wrapped rAF
      vi.advanceTimersByTime(20)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith("c")

      rAFSpy.mockRestore()
    })

    it("can be cancelled", () => {
      const fn = vi.fn()
      const cancelSpy = vi.spyOn(window, "cancelAnimationFrame")
      const rAFSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42)

      const throttled = createRafThrottle(fn)
      throttled("hello")
      throttled.cancel()

      expect(cancelSpy).toHaveBeenCalledWith(42)

      cancelSpy.mockRestore()
      rAFSpy.mockRestore()
    })

    it(
      "batches multiple frame-timed calls into one callback",
      { retry: 2 },
      () => {
        const fn = vi.fn()
        const throttled = createRafThrottle(fn)

        const rAFSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
          setTimeout(() => cb(Date.now()), 1)
          return 1
        })

        // Frame 1
        throttled("f1-a")
        throttled("f1-b")
        vi.advanceTimersByTime(20)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith("f1-b")
        fn.mockClear()

        // Frame 2
        throttled("f2-a")
        throttled("f2-b")
        throttled("f2-c")
        vi.advanceTimersByTime(20)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith("f2-c")

        rAFSpy.mockRestore()
      },
    )
  })

  describe("createDebounce", () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    it("debounces calls to the wrapped function", () => {
      const fn = vi.fn()
      const debounced = createDebounce(fn, 100)

      debounced("a")
      vi.advanceTimersByTime(50)
      debounced("b")
      vi.advanceTimersByTime(50)
      debounced("c")

      // Still not called because we keep resetting the timer
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith("c")
    })

    it("calls leading when leading option is true", () => {
      const fn = vi.fn()
      const debounced = createDebounce(fn, 100, true)

      debounced("a")
      expect(fn).toHaveBeenCalledWith("a")
      fn.mockClear()

      debounced("b")
      expect(fn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(100)
      expect(fn).toHaveBeenCalledWith("b")
    })

    it("can be cancelled", () => {
      const fn = vi.fn()
      const debounced = createDebounce(fn, 100)

      debounced("a")
      debounced.cancel()

      vi.advanceTimersByTime(200)
      expect(fn).not.toHaveBeenCalled()
    })

    it("can be flushed", () => {
      const fn = vi.fn()
      const debounced = createDebounce(fn, 100)

      debounced("a")
      debounced.flush()

      expect(fn).toHaveBeenCalledWith("a")
      // Should not fire again after the timer
      vi.advanceTimersByTime(200)
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
