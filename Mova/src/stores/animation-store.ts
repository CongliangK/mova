import { create } from "zustand"
import type { Animation, Frame } from "../types/animation"

type AnimationMutationResult = Animation | null

interface AnimationState {
  animations: Animation[]
  activeAnimationId: string | null
  currentFrameIndex: number
  isPlaying: boolean
  playbackSpeed: number
  onionSkinEnabled: boolean
  onionSkinOpacity: number
  frameClipboard: Frame | null

  setAnimations: (animations: Animation[]) => void
  addAnimation: (animation: Animation) => void
  removeAnimation: (id: string) => void
  updateAnimation: (id: string, updates: Partial<Animation>) => void
  setActiveAnimation: (id: string | null) => void
  setCurrentFrame: (index: number) => void
  togglePlayback: () => void
  setPlaying: (playing: boolean) => void
  setPlaybackSpeed: (speed: number) => void
  setFps: (animationId: string, fps: number) => AnimationMutationResult
  updateFrame: (
    animationId: string,
    frameId: string,
    updates: Partial<Frame>,
  ) => AnimationMutationResult
  reorderFrames: (
    animationId: string,
    fromIndex: number,
    toIndex: number,
  ) => AnimationMutationResult
  createAnimationFromImagePaths: (
    paths: string[],
    options?: { name?: string; fps?: number },
  ) => Animation | null
  appendFrameFromImagePath: (
    animationId: string,
    imagePath: string,
  ) => Animation | null
  insertFrameFromImagePath: (
    animationId: string,
    afterIndex: number,
    imagePath: string,
  ) => Animation | null
  /** Batch insertion: inserts multiple blank frames from `fromIndex` up to `toIndex` (inclusive) in a single store update. */
  ensureFrameCountToIndex: (
    animationId: string,
    toIndex: number,
  ) => AnimationMutationResult
  /** Batch append: appends multiple image paths to an animation in a single store update. */
  appendFrameFromImagePaths: (
    animationId: string,
    imagePaths: string[],
  ) => AnimationMutationResult
  /** Batch insert: inserts multiple image paths starting after `afterIndex` in a single store update. */
  insertFrameFromImagePaths: (
    animationId: string,
    afterIndex: number,
    imagePaths: string[],
  ) => AnimationMutationResult
  duplicateFrame: (animationId: string, frameIndex: number) => AnimationMutationResult
  deleteFrame: (animationId: string, frameIndex: number) => AnimationMutationResult
  copyFrame: (frame: Frame) => void
  pasteFrame: (animationId: string, afterIndex: number) => AnimationMutationResult
  toggleOnionSkin: () => void
  setOnionSkinOpacity: (opacity: number) => void
}

function createFrame(
  imagePath: string,
  index: number,
  description = `Imported frame ${index + 1}`,
): Frame {
  return {
    id: crypto.randomUUID(),
    index,
    imagePath,
    duration: null,
    description,
    sourceFrameId: null,
  }
}

function normalizeFrames(frames: Frame[]) {
  return frames.map((frame, index) => ({ ...frame, index }))
}

function normalizeAnimation(animation: Animation): Animation {
  const frames = normalizeFrames(animation.frames)
  return { ...animation, frames, frameCount: frames.length }
}

function clampFrameIndex(index: number, frameCount: number) {
  if (frameCount <= 0) return 0
  return Math.max(0, Math.min(frameCount - 1, index))
}

function cloneFrame(frame: Frame, index: number): Frame {
  return {
    ...frame,
    id: crypto.randomUUID(),
    index,
    sourceFrameId: frame.sourceFrameId ?? frame.id,
  }
}

function createImportedAnimation(
  paths: string[],
  options?: { name?: string; fps?: number },
): Animation {
  const name = options?.name ?? "Imported Frames"
  const frames = paths.map((path, index) =>
    createFrame(path, index, `${name} frame ${index + 1}`),
  )
  return {
    id: crypto.randomUUID(),
    name,
    direction: "right",
    frameCount: frames.length,
    fps: options?.fps ?? 12,
    loop: true,
    frames,
    status: "complete",
    metadata: {
      motionDescription: "Imported from project assets",
      keyframeHints: [],
      generationParams: {
        source: "file_tree_drag",
      },
    },
  }
}

export const useAnimationStore = create<AnimationState>((set) => ({
  animations: [],
  activeAnimationId: null,
  currentFrameIndex: 0,
  isPlaying: false,
  playbackSpeed: 1,
  onionSkinEnabled: false,
  onionSkinOpacity: 0.3,
  frameClipboard: null,

  setAnimations: (animations) =>
    set((state) => {
      const normalized = animations.map(normalizeAnimation)
      const activeAnimation = normalized.find(
        (animation) => animation.id === state.activeAnimationId,
      )
      return {
        animations: normalized,
        currentFrameIndex: activeAnimation
          ? clampFrameIndex(state.currentFrameIndex, activeAnimation.frames.length)
          : 0,
        isPlaying: activeAnimation ? state.isPlaying : false,
      }
    }),

  addAnimation: (animation) =>
    set((state) => ({
      animations: [...state.animations, normalizeAnimation(animation)],
    })),

  removeAnimation: (id) =>
    set((state) => ({
      animations: state.animations.filter((a) => a.id !== id),
      activeAnimationId:
        state.activeAnimationId === id ? null : state.activeAnimationId,
    })),

  updateAnimation: (id, updates) =>
    set((state) => {
      const animations = state.animations.map((animation) => {
        if (animation.id !== id) return animation
        const nextAnimation = normalizeAnimation({ ...animation, ...updates })
        return nextAnimation
      })
      const activeUpdatedAnimation = animations.find(
        (animation) => animation.id === id,
      )
      return {
        animations,
        currentFrameIndex:
          state.activeAnimationId === id && activeUpdatedAnimation
            ? clampFrameIndex(
                state.currentFrameIndex,
                activeUpdatedAnimation.frames.length,
              )
            : state.currentFrameIndex,
      }
    }),

  setActiveAnimation: (id) =>
    set({ activeAnimationId: id, currentFrameIndex: 0, isPlaying: false }),

  setCurrentFrame: (index) =>
    set((state) => {
      const activeAnimation = state.animations.find(
        (animation) => animation.id === state.activeAnimationId,
      )
      const clamped = clampFrameIndex(
        index,
        activeAnimation?.frames.length ?? 0,
      )
      // No-op guard: avoid publishing a new state object when the index is unchanged.
      // This prevents unnecessary React re-renders during playback.
      if (clamped === state.currentFrameIndex) return state
      return { currentFrameIndex: clamped }
    }),

  togglePlayback: () => set((state) => ({ isPlaying: !state.isPlaying })),

  setPlaying: (playing) => set({ isPlaying: playing }),

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  setFps: (animationId, fps) => {
    let updatedAnimation: Animation | null = null
    set((state) => ({
      animations: state.animations.map((animation) => {
        if (animation.id !== animationId) return animation
        const nextAnimation = normalizeAnimation({
          ...animation,
          fps: Math.max(1, Math.min(60, fps)),
        })
        updatedAnimation = nextAnimation
        return nextAnimation
      }),
    }))
    return updatedAnimation
  },

  updateFrame: (animationId, frameId, updates) => {
    let updatedAnimation: Animation | null = null
    set((state) => ({
      animations: state.animations.map((animation) => {
        if (animation.id !== animationId) return animation
        const nextAnimation = normalizeAnimation({
          ...animation,
          frames: animation.frames.map((frame) =>
            frame.id === frameId ? { ...frame, ...updates } : frame,
          ),
        })
        updatedAnimation = nextAnimation
        return nextAnimation
      }),
    }))
    return updatedAnimation
  },

  reorderFrames: (animationId, fromIndex, toIndex) => {
    let updatedAnimation: Animation | null = null
    let nextFrameIndex: number | null = null
    set((state) => ({
      animations: state.animations.map((animation) => {
        if (animation.id !== animationId) return animation
        if (
          fromIndex < 0 ||
          fromIndex >= animation.frames.length ||
          toIndex < 0 ||
          toIndex >= animation.frames.length
        ) {
          return animation
        }
        const frames = [...animation.frames]
        const [moved] = frames.splice(fromIndex, 1)
        if (!moved) return animation
        frames.splice(toIndex, 0, moved)
        const nextAnimation = normalizeAnimation({ ...animation, frames })
        updatedAnimation = nextAnimation
        nextFrameIndex = toIndex
        return nextAnimation
      }),
      currentFrameIndex:
        nextFrameIndex === null ? state.currentFrameIndex : nextFrameIndex,
    }))
    return updatedAnimation
  },

  createAnimationFromImagePaths: (paths, options) => {
    if (paths.length === 0) return null
    const animation = createImportedAnimation(paths, options)
    set((state) => ({
      animations: [...state.animations, animation],
      activeAnimationId: animation.id,
      currentFrameIndex: 0,
      isPlaying: false,
    }))
    return animation
  },

  appendFrameFromImagePath: (animationId, imagePath) => {
    let updatedAnimation: Animation | null = null
    set((state) => ({
      animations: state.animations.map((animation) => {
        if (animation.id !== animationId) return animation
        const frames = normalizeFrames([
          ...animation.frames,
          createFrame(imagePath, animation.frames.length),
        ])
        const nextAnimation = normalizeAnimation({ ...animation, frames })
        updatedAnimation = nextAnimation
        return nextAnimation
      }),
      currentFrameIndex: updatedAnimation
        ? updatedAnimation.frames.length - 1
        : state.currentFrameIndex,
    }))
    return updatedAnimation
  },

  insertFrameFromImagePath: (animationId, afterIndex, imagePath) => {
    let updatedAnimation: Animation | null = null
    set((state) => ({
      animations: state.animations.map((animation) => {
        if (animation.id !== animationId) return animation
        const insertIndex = Math.max(
          0,
          Math.min(animation.frames.length, afterIndex + 1),
        )
        const frames = [...animation.frames]
        frames.splice(insertIndex, 0, createFrame(imagePath, insertIndex))
        const normalized = normalizeFrames(frames)
        const nextAnimation = normalizeAnimation({ ...animation, frames: normalized })
        updatedAnimation = nextAnimation
        return nextAnimation
      }),
      currentFrameIndex: updatedAnimation
        ? Math.max(
            0,
            Math.min(updatedAnimation.frames.length - 1, afterIndex + 1),
          )
        : state.currentFrameIndex,
    }))
    return updatedAnimation
  },

  ensureFrameCountToIndex: (animationId, toIndex) => {
    let updatedAnimation: Animation | null = null
    set((state) => {
      const animation = state.animations.find((item) => item.id === animationId)
      if (!animation || toIndex < animation.frames.length) return state

      const newFrames = Array.from(
        { length: toIndex - animation.frames.length + 1 },
        (_, i) => createFrame("", animation.frames.length + i),
      )
      const frames = normalizeFrames([...animation.frames, ...newFrames])
      const nextAnimation = normalizeAnimation({ ...animation, frames })
      updatedAnimation = nextAnimation
      return {
        animations: state.animations.map((item) =>
          item.id === animationId ? nextAnimation : item,
        ),
        currentFrameIndex: toIndex,
      }
    })
    return updatedAnimation
  },

  appendFrameFromImagePaths: (animationId, imagePaths) => {
    if (imagePaths.length === 0) return null
    let updatedAnimation: Animation | null = null
    set((state) => {
      const animation = state.animations.find((item) => item.id === animationId)
      if (!animation) return state

      const startIndex = animation.frames.length
      const newFrames = imagePaths.map((path, i) =>
        createFrame(path, startIndex + i),
      )
      const frames = normalizeFrames([...animation.frames, ...newFrames])
      const nextAnimation = normalizeAnimation({ ...animation, frames })
      updatedAnimation = nextAnimation
      return {
        animations: state.animations.map((item) =>
          item.id === animationId ? nextAnimation : item,
        ),
        currentFrameIndex: nextAnimation.frames.length - 1,
      }
    })
    return updatedAnimation
  },

  insertFrameFromImagePaths: (animationId, afterIndex, imagePaths) => {
    if (imagePaths.length === 0) return null
    let updatedAnimation: Animation | null = null
    set((state) => {
      const animation = state.animations.find((item) => item.id === animationId)
      if (!animation) return state

      const insertIndex = Math.max(
        0,
        Math.min(animation.frames.length, afterIndex + 1),
      )
      const newFrames = imagePaths.map((path, i) =>
        createFrame(path, insertIndex + i),
      )
      const frames = [...animation.frames]
      frames.splice(insertIndex, 0, ...newFrames)
      const normalized = normalizeFrames(frames)
      const nextAnimation = normalizeAnimation({ ...animation, frames: normalized })
      updatedAnimation = nextAnimation
      return {
        animations: state.animations.map((item) =>
          item.id === animationId ? nextAnimation : item,
        ),
        currentFrameIndex: Math.max(
          0,
          Math.min(nextAnimation.frames.length - 1, afterIndex + imagePaths.length),
        ),
      }
    })
    return updatedAnimation
  },

  duplicateFrame: (animationId, frameIndex) => {
    let updatedAnimation: Animation | null = null
    let nextFrameIndex: number | null = null
    set((state) => ({
      animations: state.animations.map((animation) => {
        if (animation.id !== animationId) return animation
        if (frameIndex < 0 || frameIndex >= animation.frames.length) {
          return animation
        }
        const frame = animation.frames[frameIndex]
        if (!frame) return animation
        const frames = [...animation.frames]
        const insertIndex = frameIndex + 1
        frames.splice(insertIndex, 0, cloneFrame(frame, insertIndex))
        const nextAnimation = normalizeAnimation({ ...animation, frames })
        updatedAnimation = nextAnimation
        nextFrameIndex = insertIndex
        return nextAnimation
      }),
      currentFrameIndex:
        nextFrameIndex === null ? state.currentFrameIndex : nextFrameIndex,
    }))
    return updatedAnimation
  },

  deleteFrame: (animationId, frameIndex) => {
    let updatedAnimation: Animation | null = null
    set((state) => {
      const animation = state.animations.find((item) => item.id === animationId)
      if (
        !animation ||
        frameIndex < 0 ||
        frameIndex >= animation.frames.length
      ) {
        return state
      }
      const frames = animation.frames.filter((_, index) => index !== frameIndex)
      if (frames.length === 0) {
        return {
          animations: state.animations.filter((item) => item.id !== animationId),
          activeAnimationId:
            state.activeAnimationId === animationId ? null : state.activeAnimationId,
          currentFrameIndex: 0,
          isPlaying: state.activeAnimationId === animationId ? false : state.isPlaying,
        }
      }
      const nextAnimation = normalizeAnimation({ ...animation, frames })
      updatedAnimation = nextAnimation
      return {
        animations: state.animations.map((item) =>
          item.id === animationId ? nextAnimation : item,
        ),
        currentFrameIndex: clampFrameIndex(frameIndex, frames.length),
      }
    })
    return updatedAnimation
  },

  copyFrame: (frame) =>
    set({ frameClipboard: { ...frame, id: `clipboard-${Date.now()}` } }),

  pasteFrame: (animationId, afterIndex) => {
    let updatedAnimation: Animation | null = null
    let nextFrameIndex: number | null = null
    set((state) => {
      if (!state.frameClipboard) return state
      const clipboard = state.frameClipboard
      return {
        animations: state.animations.map((animation) => {
          if (animation.id !== animationId) return animation
          const insertIndex = Math.max(
            0,
            Math.min(animation.frames.length, afterIndex + 1),
          )
          const frames = [...animation.frames]
          frames.splice(insertIndex, 0, cloneFrame(clipboard, insertIndex))
          const nextAnimation = normalizeAnimation({ ...animation, frames })
          updatedAnimation = nextAnimation
          nextFrameIndex = insertIndex
          return nextAnimation
        }),
        currentFrameIndex:
          nextFrameIndex === null ? state.currentFrameIndex : nextFrameIndex,
      }
    })
    return updatedAnimation
  },

  toggleOnionSkin: () =>
    set((state) => ({ onionSkinEnabled: !state.onionSkinEnabled })),

  setOnionSkinOpacity: (opacity) =>
    set({ onionSkinOpacity: Math.max(0, Math.min(0.5, opacity)) }),
}))
