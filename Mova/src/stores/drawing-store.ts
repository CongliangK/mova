import { create } from "zustand"

export interface DrawingLayer {
  id: string
  name: string
  visible: boolean
  opacity: number
  order: number
  locked: boolean
}

export interface DrawingState {
  layers: DrawingLayer[]
  activeLayerId: string | null
}

interface DrawingActions {
  addLayer: (name?: string) => boolean
  removeLayer: (id: string) => void
  renameLayer: (id: string, name: string) => void
  toggleVisibility: (id: string) => void
  setOpacity: (id: string, opacity: number) => void
  setActiveLayer: (id: string | null) => void
  reorderLayers: (sourceIndex: number, targetIndex: number) => void
}

const MAX_LAYERS = 5
const INITIAL_LAYER_ID = "layer-1"

function generateId(): string {
  return crypto.randomUUID()
}

export const useDrawingStore = create<DrawingState & DrawingActions>((set, get) => ({
  layers: [
    {
      id: INITIAL_LAYER_ID,
      name: "Layer 1",
      visible: true,
      opacity: 1,
      order: 0,
      locked: false,
    },
  ],
  activeLayerId: INITIAL_LAYER_ID,

  addLayer: (name) => {
    const state = get()
    if (state.layers.length >= MAX_LAYERS) {
      return false
    }

    const maxOrder = state.layers.reduce((max, l) => Math.max(max, l.order), -1)
    const newLayer: DrawingLayer = {
      id: generateId(),
      name: name ?? `Layer ${state.layers.length + 1}`,
      visible: true,
      opacity: 1,
      order: maxOrder + 1,
      locked: false,
    }

    set({
      layers: [...state.layers, newLayer],
      activeLayerId: newLayer.id,
    })
    return true
  },

  removeLayer: (id) => {
    const state = get()
    const remaining = state.layers.filter((l) => l.id !== id)
    if (remaining.length === state.layers.length) return

    const newActiveId =
      state.activeLayerId === id
        ? remaining[0]?.id ?? null
        : state.activeLayerId

    set({ layers: remaining, activeLayerId: newActiveId })
  },

  renameLayer: (id, name) => {
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, name } : l
      ),
    }))
  },

  toggleVisibility: (id) => {
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    }))
  },

  setOpacity: (id, opacity) => {
    const clamped = Math.max(0, Math.min(1, opacity))
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, opacity: clamped } : l
      ),
    }))
  },

  setActiveLayer: (id) => {
    set({ activeLayerId: id })
  },

  reorderLayers: (sourceIndex, targetIndex) => {
    set((state) => {
      const sorted = [...state.layers].sort((a, b) => a.order - b.order)
      if (
        sourceIndex < 0 ||
        sourceIndex >= sorted.length ||
        targetIndex < 0 ||
        targetIndex >= sorted.length
      ) {
        return state
      }

      const [moved] = sorted.splice(sourceIndex, 1)
      sorted.splice(targetIndex, 0, moved)

      const updated = sorted.map((l, i) => ({ ...l, order: i }))
      return { layers: updated }
    })
  },
}))
