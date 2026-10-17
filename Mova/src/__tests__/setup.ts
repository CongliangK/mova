import "@testing-library/jest-dom/vitest"

function createMemoryStorage(): Storage {
  const values = new Map<string, string>()
  const storage = {
    clear() {
      for (const key of values.keys()) {
        delete (storage as Record<string, unknown>)[key]
      }
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
      delete (storage as Record<string, unknown>)[key]
    },
    setItem(key: string, value: string) {
      values.set(key, value)
      Object.defineProperty(storage, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    },
  }

  Object.defineProperty(storage, "length", {
    get() {
      return values.size
    },
  })

  return storage as Storage
}

const storage = createMemoryStorage()

Object.defineProperty(globalThis, "localStorage", {
  value: storage,
  configurable: true,
})

if (globalThis.window) {
  Object.defineProperty(globalThis.window, "localStorage", {
    value: storage,
    configurable: true,
  })
}
