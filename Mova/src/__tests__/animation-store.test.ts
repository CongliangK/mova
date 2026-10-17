import { beforeEach, describe, expect, it } from "vitest"
import { useAnimationStore } from "../../src/stores/animation-store"
import type { Animation, Frame } from "../../src/types/animation"

function createFrame(id: string, index: number): Frame {
  return {
    id,
    index,
    imagePath: `/tmp/mova-project/assets/frames/${id}.png`,
    duration: null,
    description: id,
    sourceFrameId: null,
  }
}

function createAnimation(overrides: Partial<Animation> = {}): Animation {
  const frames = [createFrame("frame-1", 0), createFrame("frame-2", 1)]
  return {
    id: "animation-1",
    name: "Run",
    direction: "right",
    frameCount: frames.length,
    fps: 12,
    loop: true,
    status: "complete",
    frames,
    metadata: {
      motionDescription: "run",
      keyframeHints: [],
      generationParams: {},
    },
    ...overrides,
  }
}

describe("animation store frame mutation contracts", () => {
  beforeEach(() => {
    useAnimationStore.setState({
      animations: [],
      activeAnimationId: null,
      currentFrameIndex: 0,
      isPlaying: false,
      playbackSpeed: 1,
      onionSkinEnabled: false,
      onionSkinOpacity: 0.3,
      frameClipboard: null,
    })
  })

  it("normalizes loaded frame indexes and clamps the current frame", () => {
    const animation = createAnimation({
      frameCount: 99,
      frames: [createFrame("frame-1", 4), createFrame("frame-2", 8)],
    })
    useAnimationStore.setState({
      activeAnimationId: animation.id,
      currentFrameIndex: 7,
      isPlaying: true,
    })

    useAnimationStore.getState().setAnimations([animation])

    const state = useAnimationStore.getState()
    expect(state.animations[0]?.frameCount).toBe(2)
    expect(state.animations[0]?.frames.map((frame) => frame.index)).toEqual([
      0, 1,
    ])
    expect(state.currentFrameIndex).toBe(1)
    expect(state.isPlaying).toBe(true)
  })

  it("returns updated normalized data from duplicate and paste mutations", () => {
    const animation = createAnimation()
    useAnimationStore.setState({
      animations: [animation],
      activeAnimationId: animation.id,
      frameClipboard: createFrame("clipboard-frame", 12),
    })

    const duplicated = useAnimationStore
      .getState()
      .duplicateFrame(animation.id, 0)
    const pasted = useAnimationStore.getState().pasteFrame(animation.id, 1)

    expect(duplicated?.frameCount).toBe(3)
    expect(duplicated?.frames.map((frame) => frame.index)).toEqual([0, 1, 2])
    expect(pasted?.frameCount).toBe(4)
    expect(pasted?.frames.map((frame) => frame.index)).toEqual([0, 1, 2, 3])
    expect(useAnimationStore.getState().currentFrameIndex).toBe(2)
  })

  it("removes the animation and stops playback when deleting its last frame", () => {
    const animation = createAnimation({
      frameCount: 1,
      frames: [createFrame("frame-1", 0)],
    })
    useAnimationStore.setState({
      animations: [animation],
      activeAnimationId: animation.id,
      currentFrameIndex: 0,
      isPlaying: true,
    })

    const result = useAnimationStore.getState().deleteFrame(animation.id, 0)

    const state = useAnimationStore.getState()
    expect(result).toBeNull()
    expect(state.animations).toEqual([])
    expect(state.activeAnimationId).toBeNull()
    expect(state.currentFrameIndex).toBe(0)
    expect(state.isPlaying).toBe(false)
  })
})
