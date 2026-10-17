import { useCallback } from "react"
import { useAnimationStore } from "../stores/animation-store"
import { useProjectStore } from "../stores/project-store"
import type { Animation } from "../types/animation"
import type { Character } from "../types/project"
import { useToast } from "./use-toast"

export function useTimelineImageInsertion() {
  const animations = useAnimationStore((state) => state.animations)
  const activeAnimationId = useAnimationStore((state) => state.activeAnimationId)
  const createAnimationFromImagePaths = useAnimationStore(
    (state) => state.createAnimationFromImagePaths,
  )
  const setCurrentFrame = useAnimationStore((state) => state.setCurrentFrame)

  const project = useProjectStore((state) => state.project)
  const addCharacter = useProjectStore((state) => state.addCharacter)
  const updateCharacter = useProjectStore((state) => state.updateCharacter)
  const setActiveCharacter = useProjectStore((state) => state.setActiveCharacter)
  const { showToast } = useToast()

  const activeAnimation = animations.find(
    (animation) => animation.id === activeAnimationId,
  )

  const persistAnimation = useCallback(
    (animation: Animation) => {
      if (!project) return
      const activeCharacter = project.characters.find(
        (character) => character.id === project.activeCharacterId,
      )
      if (activeCharacter) {
        const animations = activeCharacter.animations.some(
          (item) => item.id === animation.id,
        )
          ? activeCharacter.animations.map((item) =>
              item.id === animation.id ? animation : item,
            )
          : [...activeCharacter.animations, animation]
        updateCharacter(activeCharacter.id, {
          animations,
          updatedAt: new Date().toISOString(),
        })
        return
      }

      const defaultArtStyle = project.settings.defaultArtStyle
      const artStyle =
        defaultArtStyle === "cartoon" ||
        defaultArtStyle === "anime" ||
        defaultArtStyle === "realistic"
          ? defaultArtStyle
          : "pixel-art"
      const now = new Date().toISOString()
      const character: Character = {
        id: crypto.randomUUID(),
        name: "Imported Character",
        description: "Created from a timeline image.",
        style: {
          artStyle,
          colorPalette: [],
          frameSize: {
            width: project.settings.defaultFrameWidth,
            height: project.settings.defaultFrameHeight,
          },
          referenceDescription: "",
        },
        baseImagePath: animation.frames[0]?.imagePath ?? null,
        animations: [animation],
        tags: [],
        createdAt: now,
        updatedAt: now,
      }
      addCharacter(character)
      setActiveCharacter(character.id)
    },
    [addCharacter, project, setActiveCharacter, updateCharacter],
  )

  const removePersistedAnimation = useCallback(
    (animationId: string) => {
      if (!project) return
      const activeCharacter = project.characters.find(
        (character) => character.id === project.activeCharacterId,
      )
      if (!activeCharacter) return
      updateCharacter(activeCharacter.id, {
        animations: activeCharacter.animations.filter(
          (animation) => animation.id !== animationId,
        ),
        updatedAt: new Date().toISOString(),
      })
    },
    [project, updateCharacter],
  )

  const persistUpdatedAnimation = useCallback(
    (animation: Animation | null) => {
      if (animation) persistAnimation(animation)
    },
    [persistAnimation],
  )

  const createTimelineAtIndex = useCallback(
    (targetIndex: number, paths?: string[]) => {
      if (!project) {
        showToast("error", "No project open")
        return false
      }

      const safeTargetIndex = Math.max(0, targetIndex)
      const framePaths =
        paths && paths.length > 0
          ? [...Array.from({ length: safeTargetIndex }, () => ""), ...paths]
          : Array.from({ length: safeTargetIndex + 1 }, () => "")
      const animation = createAnimationFromImagePaths(framePaths, {
        name:
          paths && paths.length > 0
            ? "Imported Frames"
            : `Timeline ${animations.length + 1}`,
        fps: project.settings.defaultFps,
      })

      if (animation) {
        persistAnimation(animation)
        setCurrentFrame(safeTargetIndex)
        showToast(
          "success",
          paths && paths.length > 0
            ? "Created timeline from image"
            : "Created blank timeline",
        )
      }
      return Boolean(animation)
    },
    [
      animations.length,
      createAnimationFromImagePaths,
      persistAnimation,
      project,
      setCurrentFrame,
      showToast,
    ],
  )

  const insertBlankFramesToIndex = useCallback(
    (targetIndex: number) => {
      if (!activeAnimation) return createTimelineAtIndex(targetIndex)

      const safeTargetIndex = Math.max(
        activeAnimation.frames.length,
        targetIndex,
      )
      if (safeTargetIndex < activeAnimation.frames.length) return Boolean(activeAnimation)

      const blankPaths = Array.from(
        { length: safeTargetIndex - activeAnimation.frames.length + 1 },
        () => "",
      )
      const updatedAnimation = useAnimationStore
        .getState()
        .appendFrameFromImagePaths(activeAnimation.id, blankPaths)

      if (updatedAnimation) {
        persistAnimation(updatedAnimation)
        showToast("success", "Added blank frame")
      }
      return Boolean(updatedAnimation)
    },
    [
      activeAnimation,
      createTimelineAtIndex,
      persistAnimation,
      showToast,
    ],
  )

  const addImagePathsToEmptyCell = useCallback(
    (paths: string[], targetIndex: number) => {
      if (!activeAnimation) return createTimelineAtIndex(targetIndex, paths)

      const safeTargetIndex = Math.max(0, targetIndex)
      const store = useAnimationStore.getState()

      // Ensure we have enough blank frames up to the target index
      if (safeTargetIndex > activeAnimation.frames.length) {
        const blankPaths = Array.from(
          { length: safeTargetIndex - activeAnimation.frames.length },
          () => "",
        )
        const afterAppend = store.appendFrameFromImagePaths(
          activeAnimation.id,
          blankPaths,
        )
        if (!afterAppend) return false
      }

      // Then insert the image paths in a single batch
      const lastBlankIndex = safeTargetIndex - 1
      const updatedAnimation = store.insertFrameFromImagePaths(
        activeAnimation.id,
        lastBlankIndex,
        paths,
      )

      if (updatedAnimation) {
        persistAnimation(updatedAnimation)
        showToast("success", "Added image to timeline")
      }
      return Boolean(updatedAnimation)
    },
    [
      activeAnimation,
      createTimelineAtIndex,
      persistAnimation,
      showToast,
    ],
  )

  const addImagePathsToTimeline = useCallback(
    (paths: string[], afterIndex?: number) => {
      if (!project) {
        showToast("error", "No project open")
        return false
      }

      if (activeAnimation) {
        const store = useAnimationStore.getState()
        const updatedAnimation =
          typeof afterIndex === "number"
            ? store.insertFrameFromImagePaths(
                activeAnimation.id,
                afterIndex,
                paths,
              )
            : store.appendFrameFromImagePaths(activeAnimation.id, paths)

        if (updatedAnimation) {
          persistAnimation(updatedAnimation)
          showToast("success", "Added image to timeline")
        }
        return Boolean(updatedAnimation)
      }

      const animation = createAnimationFromImagePaths(paths, {
        name: "Imported Frames",
        fps: project.settings.defaultFps,
      })
      if (animation) {
        persistAnimation(animation)
        showToast("success", "Created timeline from image")
      }
      return Boolean(animation)
    },
    [
      activeAnimation,
      createAnimationFromImagePaths,
      persistAnimation,
      project,
      showToast,
    ],
  )

  return {
    addImagePathsToEmptyCell,
    addImagePathsToTimeline,
    createTimelineAtIndex,
    insertBlankFramesToIndex,
    persistAnimation,
    persistUpdatedAnimation,
    removePersistedAnimation,
  }
}
