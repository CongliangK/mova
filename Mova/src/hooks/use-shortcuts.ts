import { useEffect, useCallback } from "react"

export interface ShortcutCallbacks {
  undo?: () => void
  redo?: () => void
  playPause?: () => void
  export?: () => void
  save?: () => void
  newProject?: () => void
  zoomIn?: () => void
  zoomOut?: () => void
  zoomReset?: () => void
  escape?: () => void
}

export interface ShortcutConfig {
  /** Custom key bindings. Keys are the action names, values are the key to listen for.
   *  Modifiers are specified separately via the `modifiers` field.
   */
  bindings?: Partial<Record<keyof ShortcutCallbacks, string>>
  /** Whether to prevent default browser behavior for handled shortcuts */
  preventDefault?: boolean
}

const DEFAULT_BINDINGS: Record<keyof ShortcutCallbacks, string> = {
  undo: "z",
  redo: "z",
  playPause: " ",
  export: "e",
  save: "s",
  newProject: "n",
  zoomIn: "=",
  zoomOut: "-",
  zoomReset: "0",
  escape: "escape",
}

export const DEFAULT_SHORTCUTS = DEFAULT_BINDINGS

export type ShortcutMap = typeof DEFAULT_SHORTCUTS

function isInputElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  let element: HTMLElement | null = target
  while (element) {
    const tag = element.tagName.toLowerCase()
    const contentEditable = element.getAttribute("contenteditable")
    if (
      tag === "input" ||
      tag === "textarea" ||
      tag === "select" ||
      element.isContentEditable ||
      (contentEditable !== null && contentEditable.toLowerCase() !== "false")
    ) {
      return true
    }
    element = element.parentElement
  }
  return false
}

function isZoomInShortcut(key: string, code: string, binding: string): boolean {
  return key === binding || key === "+" || code === "Equal" || code === "NumpadAdd"
}

function isZoomOutShortcut(key: string, code: string, binding: string): boolean {
  return (
    key === binding ||
    key === "-" ||
    key === "_" ||
    code === "Minus" ||
    code === "NumpadSubtract"
  )
}

function isZoomResetShortcut(key: string, code: string, binding: string): boolean {
  return key === binding || key === ")" || code === "Digit0" || code === "Numpad0"
}

export function useShortcuts(
  callbacks: ShortcutCallbacks,
  config: ShortcutConfig = {}
) {
  const { bindings = {}, preventDefault = true } = config

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const code = event.code
      const ctrlOrMeta = event.ctrlKey || event.metaKey
      const shift = event.shiftKey

      const getBinding = (action: keyof ShortcutCallbacks): string =>
        (bindings[action] ?? DEFAULT_BINDINGS[action]).toLowerCase()

      const run = (action: keyof ShortcutCallbacks) => {
        const callback = callbacks[action]
        if (!callback) return false
        callback()
        return true
      }

      const isZoomInKey = isZoomInShortcut(key, code, getBinding("zoomIn"))
      const isZoomOutKey = isZoomOutShortcut(key, code, getBinding("zoomOut"))
      const isZoomResetKey = isZoomResetShortcut(key, code, getBinding("zoomReset"))
      const isModifiedZoomShortcut = ctrlOrMeta && (isZoomInKey || isZoomOutKey || isZoomResetKey)

      if (isModifiedZoomShortcut) {
        event.preventDefault()
      }

      if (isInputElement(event.target) && key !== "escape" && !isModifiedZoomShortcut) {
        return
      }

      let handled = false
      let handledZoom = false

      // Undo: Ctrl+Z / Cmd+Z (no shift)
      if (ctrlOrMeta && !shift && key === getBinding("undo")) {
        handled = run("undo")
      }
      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z
      else if (ctrlOrMeta && shift && key === getBinding("redo")) {
        handled = run("redo")
      }
      // Play/Pause: Space
      else if (!ctrlOrMeta && !shift && key === getBinding("playPause")) {
        handled = run("playPause")
      }
      // Export: Ctrl+E / Cmd+E
      else if (ctrlOrMeta && !shift && key === getBinding("export")) {
        handled = run("export")
      }
      // Save: Ctrl+S / Cmd+S
      else if (ctrlOrMeta && !shift && key === getBinding("save")) {
        handled = run("save")
      }
      // New Project: Ctrl+N / Cmd+N
      else if (ctrlOrMeta && !shift && key === getBinding("newProject")) {
        handled = run("newProject")
      }
      else if (ctrlOrMeta && isZoomInKey) {
        handled = run("zoomIn")
        handledZoom = true
      }
      else if (ctrlOrMeta && isZoomOutKey) {
        handled = run("zoomOut")
        handledZoom = true
      }
      else if (ctrlOrMeta && isZoomResetKey) {
        handled = run("zoomReset")
        handledZoom = true
      }
      // Escape
      else if (!ctrlOrMeta && !shift && key === getBinding("escape")) {
        handled = run("escape")
      }

      if (handled && (preventDefault || handledZoom)) {
        event.preventDefault()
      }
    },
    [callbacks, bindings, preventDefault]
  )

  useEffect(() => {
    const options: AddEventListenerOptions = { capture: true, passive: false }
    window.addEventListener("keydown", handleKeyDown, options)
    return () => {
      window.removeEventListener("keydown", handleKeyDown, options)
    }
  }, [handleKeyDown])
}
