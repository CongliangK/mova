import { describe, it, expect, beforeEach } from "vitest"
import { useDrawingStore } from "../stores/drawing-store"

describe("DrawingStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useDrawingStore.setState({
      layers: [
        {
          id: "layer-1",
          name: "Layer 1",
          visible: true,
          opacity: 1,
          order: 0,
          locked: false,
        },
      ],
      activeLayerId: "layer-1",
    })
  })

  describe("initial state", () => {
    it("should have 1 layer on initialization", () => {
      const state = useDrawingStore.getState()
      expect(state.layers).toHaveLength(1)
    })

    it("should have activeLayerId equal to the first layer id (layer-1)", () => {
      const state = useDrawingStore.getState()
      expect(state.activeLayerId).toBe("layer-1")
      expect(state.layers[0].id).toBe("layer-1")
    })
  })

  describe("addLayer", () => {
    it("should add a second layer when under the limit", () => {
      const { addLayer } = useDrawingStore.getState()
      const result = addLayer()
      const state = useDrawingStore.getState()

      expect(result).toBe(true)
      expect(state.layers).toHaveLength(2)
    })

    it("should return false when reaching MAX_LAYERS (5)", () => {
      const { addLayer } = useDrawingStore.getState()

      addLayer()
      addLayer()
      addLayer()
      addLayer()
      const result = addLayer()

      expect(result).toBe(false)
      expect(useDrawingStore.getState().layers).toHaveLength(5)
    })

    it("should set new layer as active when added", () => {
      const { addLayer } = useDrawingStore.getState()
      const initialActiveId = useDrawingStore.getState().activeLayerId

      addLayer()
      const state = useDrawingStore.getState()

      expect(state.activeLayerId).not.toBe(initialActiveId)
      expect(state.layers[state.layers.length - 1].id).toBe(state.activeLayerId)
    })
  })

  describe("removeLayer", () => {
    it("should update activeLayerId when the active layer is removed", () => {
      const { addLayer, removeLayer } = useDrawingStore.getState()

      // Add a second layer
      addLayer()
      const secondLayerId = useDrawingStore.getState().layers[1].id

      // Remove the second (active) layer
      removeLayer(secondLayerId)
      const state = useDrawingStore.getState()

      expect(state.layers).toHaveLength(1)
      expect(state.activeLayerId).toBe("layer-1")
    })

    it("should set activeLayerId to null when removing the last layer", () => {
      const { removeLayer } = useDrawingStore.getState()

      removeLayer("layer-1")
      const state = useDrawingStore.getState()

      expect(state.layers).toHaveLength(0)
      expect(state.activeLayerId).toBeNull()
    })
  })

  describe("toggleVisibility", () => {
    it("should toggle layer visibility from visible to hidden", () => {
      const { toggleVisibility } = useDrawingStore.getState()
      const layerId = useDrawingStore.getState().layers[0].id

      toggleVisibility(layerId)
      const state = useDrawingStore.getState()

      expect(state.layers[0].visible).toBe(false)
    })

    it("should toggle layer visibility from hidden to visible", () => {
      const { toggleVisibility } = useDrawingStore.getState()
      const layerId = useDrawingStore.getState().layers[0].id

      toggleVisibility(layerId)
      toggleVisibility(layerId)
      const state = useDrawingStore.getState()

      expect(state.layers[0].visible).toBe(true)
    })
  })

  describe("setOpacity", () => {
    it("should set opacity within valid range (0-1)", () => {
      const { setOpacity } = useDrawingStore.getState()
      const layerId = useDrawingStore.getState().layers[0].id

      setOpacity(layerId, 0.5)
      const state = useDrawingStore.getState()

      expect(state.layers[0].opacity).toBe(0.5)
    })

    it("should clamp opacity to 0 when given negative value", () => {
      const { setOpacity } = useDrawingStore.getState()
      const layerId = useDrawingStore.getState().layers[0].id

      setOpacity(layerId, -0.5)
      const state = useDrawingStore.getState()

      expect(state.layers[0].opacity).toBe(0)
    })

    it("should clamp opacity to 1 when given value greater than 1", () => {
      const { setOpacity } = useDrawingStore.getState()
      const layerId = useDrawingStore.getState().layers[0].id

      setOpacity(layerId, 1.5)
      const state = useDrawingStore.getState()

      expect(state.layers[0].opacity).toBe(1)
    })
  })
})