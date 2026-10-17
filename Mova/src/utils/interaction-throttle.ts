/**
 * Lightweight interaction throttling utilities for Canvas/Timeline events.
 * These are pure, framework-agnostic helpers that can be tested in isolation.
 */

/**
 * Creates a function wrapper that only passes through calls at most once per
 * requestAnimationFrame tick. The last call always fires.
 *
 * This is lighter than lodash.throttle and designed for DOM event rates
 * (mousemove, pointermove, wheel) where we want smooth visual updates
 * without per-event React state updates.
 */
export function createRafThrottle<T extends (...args: unknown[]) => void>(
  fn: T,
): T & { cancel: () => void } {
  let pending = false
  let latestArgs: Parameters<T> | null = null
  let rafId: number | null = null

  const throttled = ((...args: Parameters<T>) => {
    latestArgs = args
    if (!pending) {
      pending = true
      rafId = requestAnimationFrame(() => {
        rafId = null
        pending = false
        if (latestArgs) {
          fn(...latestArgs)
          latestArgs = null
        }
      })
    }
  }) as T & { cancel: () => void }

  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    pending = false
    latestArgs = null
  }

  return throttled
}

/**
 * Creates a function wrapper that debounces calls, only executing after
 * `delayMs` of inactivity. The leading call can optionally fire immediately.
 */
export function createDebounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number,
  leading = false,
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let leadingCalled = false
  let latestArgs: Parameters<T> | null = null

  const debounced = ((...args: Parameters<T>) => {
    latestArgs = args
    if (leading && !leadingCalled) {
      leadingCalled = true
      fn(...args)
    }
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      timeoutId = null
      leadingCalled = false
      if (latestArgs) {
        fn(...latestArgs)
        latestArgs = null
      }
    }, delayMs)
  }) as T & { cancel: () => void; flush: () => void }

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    leadingCalled = false
    latestArgs = null
  }

  debounced.flush = () => {
    if (timeoutId !== null && latestArgs) {
      clearTimeout(timeoutId)
      timeoutId = null
      leadingCalled = false
      fn(...latestArgs)
      latestArgs = null
    }
  }

  return debounced
}
