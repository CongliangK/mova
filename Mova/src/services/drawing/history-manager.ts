/**
 * Command-pattern undo/redo manager with a fixed max depth.
 * Generic over the snapshot type `T` so it can be used with any
 * serialisable canvas / application state.
 */
export class HistoryManager<T> {
  private undoStack: T[] = []
  private redoStack: T[] = []
  private readonly maxDepth: number

  constructor(maxDepth = 20) {
    this.maxDepth = Math.max(1, maxDepth)
  }

  /** Push a new state snapshot onto the undo stack. Clears redo. */
  push(state: T): void {
    this.undoStack.push(state)
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift()
    }
    this.redoStack = []
  }

  /** Undo one step. Returns the previous state or `null` if nothing to undo. */
  undo(): T | null {
    if (this.undoStack.length === 0) return null
    const current = this.undoStack.pop()!
    this.redoStack.push(current)
    return this.undoStack.length > 0
      ? this.undoStack[this.undoStack.length - 1]
      : null
  }

  /** Redo one step. Returns the restored state or `null` if nothing to redo. */
  redo(): T | null {
    if (this.redoStack.length === 0) return null
    const state = this.redoStack.pop()!
    this.undoStack.push(state)
    return state
  }

  canUndo(): boolean {
    return this.undoStack.length > 1
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Reset both stacks. */
  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  /** Current number of undo entries (useful for debugging). */
  get undoCount(): number {
    return this.undoStack.length
  }

  /** Current number of redo entries. */
  get redoCount(): number {
    return this.redoStack.length
  }
}
