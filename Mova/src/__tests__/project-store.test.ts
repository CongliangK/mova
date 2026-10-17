import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { useProjectStore, setProjectAutoSaveErrorHandler } from "../../src/stores/project-store"
import { mapRustProject, serializeProjectForRust } from "../../src/types/project"
import type { Character, Project, RustProjectData } from "../../src/types/project"

// Mock Tauri invoke: save_project resolves silently so auto-save doesn't throw
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}))

const makeCharacter = (overrides: Partial<Character> = {}): Character => ({
  id: "char-1",
  name: "Test Warrior",
  description: "A brave warrior",
  style: {
    artStyle: "pixel-art",
    colorPalette: ["#ff0000", "#00ff00"],
    frameSize: { width: 64, height: 64 },
    referenceDescription: "red and green pixel warrior",
  },
  baseImagePath: null,
  animations: [],
  tags: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
})

const mockProject: Project = {
  id: "proj-1",
  name: "Test Project",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  characters: [],
  activeCharacterId: null,
  settings: {
    defaultFrameWidth: 64,
    defaultFrameHeight: 64,
    defaultFps: 8,
    defaultArtStyle: "pixel-art",
  },
}

describe("ProjectStore", () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: null,
      projectPath: null,
      isLoaded: false,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    useProjectStore.getState().closeProject()
    vi.useRealTimers()
  })

  describe("addCharacter", () => {
    it("should add a character to the project and return success result", () => {
      useProjectStore.setState({
        project: mockProject,
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      const character = makeCharacter({ id: "char-1", name: "Warrior" })
      const result = useProjectStore.getState().addCharacter(character)

      expect(result).toEqual({
        success: true,
        characterId: "char-1",
        name: "Warrior",
      })

      const state = useProjectStore.getState()
      expect(state.project!.characters).toHaveLength(1)
      expect(state.project!.characters[0].id).toBe("char-1")
    })

    it("should add multiple characters", () => {
      useProjectStore.setState({
        project: mockProject,
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().addCharacter(makeCharacter({ id: "char-1", name: "Warrior" }))
      useProjectStore.getState().addCharacter(makeCharacter({ id: "char-2", name: "Mage" }))

      const state = useProjectStore.getState()
      expect(state.project!.characters).toHaveLength(2)
      expect(state.project!.characters[0].name).toBe("Warrior")
      expect(state.project!.characters[1].name).toBe("Mage")
    })

    it("should not mutate state when no project is loaded", () => {
      const char = makeCharacter()
      const result = useProjectStore.getState().addCharacter(char)

      expect(result).toEqual({
        success: true,
        characterId: "char-1",
        name: "Test Warrior",
      })

      const state = useProjectStore.getState()
      expect(state.project).toBeNull()
    })
  })

  describe("auto-save on addCharacter", () => {
    it("should schedule an auto-save when a character is added and project is loaded", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")

      useProjectStore.setState({
        project: mockProject,
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().addCharacter(makeCharacter({ id: "char-3" }))

      // Fast-forward past the 500ms debounce
      vi.advanceTimersByTime(500)
      // Let the promise microtask flush
      await vi.runAllTimersAsync()

      expect(invoke).toHaveBeenCalledWith("save_project", expect.objectContaining({
        path: "/tmp/test-project",
      }))
    })

    it("should NOT auto-save when no project is loaded", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")

      useProjectStore.getState().addCharacter(makeCharacter({ id: "char-4" }))

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(invoke).not.toHaveBeenCalled()
    })

    it("should flush a pending save before loading another project", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")
      const projectA = { ...mockProject, id: "proj-a", name: "Project A" }
      const projectB = { ...mockProject, id: "proj-b", name: "Project B" }

      useProjectStore.getState().loadProject(projectA, "/tmp/project-a")
      useProjectStore.getState().updateSettings({ defaultFps: 10 })

      useProjectStore.getState().loadProject(projectB, "/tmp/project-b")
      useProjectStore.getState().updateSettings({ defaultFps: 14 })

      expect(invoke).toHaveBeenCalledTimes(1)
      expect(invoke).toHaveBeenNthCalledWith(1, "save_project", {
        path: "/tmp/project-a",
        project: expect.objectContaining({
          id: "proj-a",
          settings: expect.objectContaining({ default_fps: 10 }),
        }),
      })

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(invoke).toHaveBeenCalledTimes(2)
      expect(invoke).toHaveBeenNthCalledWith(2, "save_project", {
        path: "/tmp/project-b",
        project: expect.objectContaining({
          id: "proj-b",
          settings: expect.objectContaining({ default_fps: 14 }),
        }),
      })
    })

    it("should flush a pending save before closing a project", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")
      const projectA = { ...mockProject, id: "proj-a", name: "Project A" }

      useProjectStore.getState().loadProject(projectA, "/tmp/project-a")
      useProjectStore.getState().updateSettings({ defaultFps: 10 })
      useProjectStore.getState().closeProject()

      expect(useProjectStore.getState().project).toBeNull()
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(invoke).toHaveBeenCalledWith("save_project", {
        path: "/tmp/project-a",
        project: expect.objectContaining({
          id: "proj-a",
          settings: expect.objectContaining({ default_fps: 10 }),
        }),
      })

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(invoke).toHaveBeenCalledTimes(1)
    })

    it("should persist full character style, tags, animations, frames, and timestamps", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")
      const character = makeCharacter({
        id: "char-rich",
        style: {
          artStyle: "anime",
          colorPalette: ["#112233", "#445566"],
          frameSize: { width: 96, height: 128 },
          referenceDescription: "blue cape and brass goggles",
        },
        animations: [
          {
            id: "anim-run",
            name: "Run",
            direction: "right",
            frameCount: 1,
            fps: 12,
            loop: true,
            frames: [
              {
                id: "frame-1",
                index: 0,
                imagePath: "assets/frames/run-1.png",
                duration: 80,
                description: "contact pose",
                sourceFrameId: null,
              },
            ],
            status: "complete",
            metadata: {
              motionDescription: "fast run",
              keyframeHints: ["contact"],
              generationParams: { seed: 7 },
            },
          },
        ],
        tags: ["hero", "runner"],
      })

      useProjectStore.setState({
        project: { ...mockProject, characters: [] },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().addCharacter(character)

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(invoke).toHaveBeenCalledWith("save_project", {
        path: "/tmp/test-project",
        project: expect.objectContaining({
          characters: [
            expect.objectContaining({
              id: "char-rich",
              style: character.style,
              animations: character.animations,
              tags: ["hero", "runner"],
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            }),
          ],
        }),
      })
    })

    it("should preserve unknown project and character metadata in autosave payloads", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")
      const loadedProject = mapRustProject({
        id: "proj-custom",
        name: "Custom Project",
        version: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        future_project_field: { source: "external-tool" },
        characters: [
          {
            id: "char-custom",
            name: "Custom Hero",
            description: "original desc",
            base_image_path: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
            future_character_field: ["keep", "me"],
          },
        ],
      })

      useProjectStore.setState({
        project: loadedProject,
        projectPath: "/tmp/custom-project",
        isLoaded: true,
      })

      useProjectStore.getState().updateCharacter("char-custom", { description: "updated desc" })

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(invoke).toHaveBeenCalledWith("save_project", {
        path: "/tmp/custom-project",
        project: expect.objectContaining({
          future_project_field: { source: "external-tool" },
          characters: [
            expect.objectContaining({
              id: "char-custom",
              description: "updated desc",
              future_character_field: ["keep", "me"],
            }),
          ],
        }),
      })
    })

    it("calls error handler when auto-save invoke rejects", async () => {
      vi.useFakeTimers()
      const { invoke } = await import("@tauri-apps/api/core")
      const errorHandler = vi.fn()
      setProjectAutoSaveErrorHandler(errorHandler)

      vi.mocked(invoke).mockRejectedValueOnce(new Error("Disk full"))

      useProjectStore.setState({
        project: mockProject,
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().addCharacter(makeCharacter({ id: "char-err" }))

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(errorHandler).toHaveBeenCalledWith("Auto-save failed: Disk full")
    })
  })

  describe("Rust project mapping", () => {
    it("should migrate old schema characters with default style and empty animations", () => {
      const oldProject: RustProjectData = {
        id: "legacy-project",
        name: "Legacy Project",
        version: 1,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-02T00:00:00Z",
        characters: [
          {
            id: "char-legacy",
            name: "Legacy Hero",
            description: "old saved character",
            base_image_path: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-02T00:00:00Z",
          },
        ],
        settings: {
          default_frame_width: 32,
          default_frame_height: 48,
          default_fps: 10,
          default_art_style: "cartoon",
        },
      }

      const project = mapRustProject(oldProject)

      expect(project.characters[0].style).toEqual({
        artStyle: "cartoon",
        colorPalette: [],
        frameSize: { width: 32, height: 48 },
        referenceDescription: "",
      })
      expect(project.characters[0].animations).toEqual([])
      expect(project.characters[0].tags).toEqual([])
      expect(project.activeCharacterId).toBeNull()
    })

    it("should round trip new schema data through the shared WelcomePage and Sidebar mapper", () => {
      const sourceProject: Project = {
        ...mockProject,
        characters: [
          makeCharacter({
            id: "char-roundtrip",
            style: {
              artStyle: "realistic",
              colorPalette: ["#101010"],
              frameSize: { width: 128, height: 128 },
              referenceDescription: "silver armor",
            },
            animations: [
              {
                id: "anim-idle",
                name: "Idle",
                direction: "down",
                frameCount: 1,
                fps: 6,
                loop: true,
                frames: [
                  {
                    id: "frame-idle-1",
                    index: 0,
                    imagePath: "assets/frames/idle-1.png",
                    duration: null,
                    description: "breathing",
                    sourceFrameId: "base-frame",
                  },
                ],
                status: "complete",
                metadata: {
                  motionDescription: "breathing idle",
                  keyframeHints: ["up", "down"],
                  generationParams: { prompt: "idle" },
                },
              },
            ],
            tags: ["idle", "armored"],
          }),
        ],
        activeCharacterId: "char-roundtrip",
      }

      const rustData = serializeProjectForRust(sourceProject)
      const welcomeMapped = mapRustProject(rustData)
      const sidebarMapped = mapRustProject(rustData)

      expect(welcomeMapped).toEqual(sidebarMapped)
      expect(welcomeMapped.characters[0].style).toEqual(sourceProject.characters[0].style)
      expect(welcomeMapped.characters[0].animations).toEqual(sourceProject.characters[0].animations)
      expect(welcomeMapped.characters[0].tags).toEqual(["idle", "armored"])
      expect(welcomeMapped.characters[0].createdAt).toBe("2026-01-01T00:00:00Z")
      expect(welcomeMapped.activeCharacterId).toBe("char-roundtrip")
    })

    it("should omit assetRegistry for projects that do not define one", () => {
      const project = mapRustProject({
        id: "proj-no-registry",
        name: "No Registry Project",
        version: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        future_project_field: { enabled: true },
        characters: [],
      })

      const serialized = serializeProjectForRust(project)

      expect(project.assetRegistry).toBeUndefined()
      expect(project.extra).toEqual({ future_project_field: { enabled: true } })
      expect(serialized.assetRegistry).toBeUndefined()
      expect(serialized.future_project_field).toEqual({ enabled: true })
    })

    it("should round trip a typed assetRegistry as a top-level project field", () => {
      const assetRegistry = {
        schemaVersion: 1,
        assets: [
          {
            id: "asset-map-1",
            kind: "map",
            status: "complete",
            files: [
              {
                role: "base_map",
                path: "assets/maps/map-1.png",
                mimeType: "image/png",
                exists: true,
              },
            ],
            source: { type: "ai_tool", tool: "generate_map_base" },
            generation: null,
            manifests: ["manifest-map-1"],
            metadata: { mapMode: "top-down" },
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
          },
        ],
        manifests: [
          {
            id: "manifest-map-1",
            kind: "map_compose",
            path: "assets/maps/previews/map-1.manifest.json",
            schemaVersion: "1",
            assetIds: ["asset-map-1"],
            createdAt: "2026-01-02T00:00:00Z",
          },
        ],
      }

      const project = mapRustProject({
        id: "proj-registry",
        name: "Registry Project",
        version: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        assetRegistry,
        characters: [],
      })
      const serialized = serializeProjectForRust(project)

      expect(project.assetRegistry).toEqual(assetRegistry)
      expect(project.extra).toBeUndefined()
      expect(serialized.assetRegistry).toEqual(assetRegistry)
    })

    it("should preserve unknown fields inside assetRegistry records", () => {
      const assetRegistry = {
        schemaVersion: 1,
        rolloutNote: "future registry field",
        assets: [
          {
            id: "asset-frames-1",
            kind: "animation_frame_set",
            status: "complete",
            files: [
              {
                role: "frame_directory",
                path: "assets/frames/run",
                exists: true,
                linkedAnimationId: "anim-run",
              },
            ],
            source: {
              type: "processing_step",
              tool: "process_sprite",
              inputAssetIds: ["asset-sheet-1"],
              futureSourceField: { keep: true },
            },
            generation: {
              params: { sharedScale: 1 },
              futureGenerationField: "keep me",
            },
            manifests: [],
            metadata: { frameCount: 4, futureMetadataField: ["keep"] },
            relationships: { parentAssetIds: ["asset-sheet-1"] },
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
            futureAssetField: { plugin: "custom" },
          },
        ],
        manifests: [
          {
            id: "manifest-frames-1",
            kind: "sprite_processing_qc",
            path: "assets/processed/frames.manifest.json",
            schemaVersion: null,
            assetIds: ["asset-frames-1"],
            createdAt: "2026-01-02T00:00:00Z",
            futureManifestField: "keep me too",
          },
        ],
      }

      const project = mapRustProject({
        id: "proj-registry-extra",
        name: "Registry Extra Project",
        version: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        assetRegistry,
        other_top_level_field: "also keep",
        characters: [],
      })
      const serialized = serializeProjectForRust(project)

      expect(serialized.assetRegistry).toEqual(assetRegistry)
      expect(serialized.other_top_level_field).toBe("also keep")
    })

    it("should preserve unknown top-level and character fields through mapping and serialization", () => {
      const project = mapRustProject({
        id: "proj-future",
        name: "Future Project",
        version: 2,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        future_project_field: { enabled: true },
        custom_project_note: "keep this",
        characters: [
          {
            id: "char-future",
            name: "Future Hero",
            description: "original desc",
            style: {
              artStyle: "anime",
              colorPalette: ["#abcdef"],
              frameSize: { width: 80, height: 96 },
              referenceDescription: "kept style",
            },
            base_image_path: null,
            animations: [],
            tags: ["future"],
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-02T00:00:00Z",
            future_character_field: { plugin: "custom" },
          },
        ],
      })

      const serialized = serializeProjectForRust({
        ...project,
        name: "Future Project Renamed",
        characters: [
          {
            ...project.characters[0],
            description: "updated desc",
          },
        ],
      })

      expect(serialized).toEqual(expect.objectContaining({
        name: "Future Project Renamed",
        future_project_field: { enabled: true },
        custom_project_note: "keep this",
      }))
      expect(serialized.characters?.[0]).toEqual(expect.objectContaining({
        id: "char-future",
        description: "updated desc",
        future_character_field: { plugin: "custom" },
      }))
    })
  })

  describe("updateCharacterTags", () => {
    it("should replace tags on the target character", () => {
      useProjectStore.setState({
        project: {
          ...mockProject,
          characters: [
            makeCharacter({ id: "char-1", name: "Warrior", tags: ["old-tag"] }),
            makeCharacter({ id: "char-2", name: "Mage", tags: ["fire"] }),
          ],
        },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().updateCharacterTags("char-1", ["warrior", "melee"])

      const state = useProjectStore.getState()
      const updated = state.project!.characters.find((c) => c.id === "char-1")
      expect(updated!.tags).toEqual(["warrior", "melee"])

      // Other character should be unaffected
      const other = state.project!.characters.find((c) => c.id === "char-2")
      expect(other!.tags).toEqual(["fire"])
    })

    it("should set empty tags array", () => {
      useProjectStore.setState({
        project: {
          ...mockProject,
          characters: [makeCharacter({ id: "char-1", tags: ["a", "b"] })],
        },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().updateCharacterTags("char-1", [])

      const state = useProjectStore.getState()
      const updated = state.project!.characters.find((c) => c.id === "char-1")
      expect(updated!.tags).toEqual([])
    })

    it("should be a no-op when character id does not exist", () => {
      useProjectStore.setState({
        project: {
          ...mockProject,
          characters: [makeCharacter({ id: "char-1", tags: ["keep"] })],
        },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().updateCharacterTags("char-nonexistent", ["lost"])

      const state = useProjectStore.getState()
      expect(state.project!.characters[0].tags).toEqual(["keep"])
    })

    it("should be a no-op when no project is loaded", () => {
      expect(() => {
        useProjectStore.getState().updateCharacterTags("char-1", ["x"])
      }).not.toThrow()
    })
  })

  describe("removeCharacter", () => {
    it("should remove character by id", () => {
      useProjectStore.setState({
        project: {
          ...mockProject,
          characters: [
            makeCharacter({ id: "char-1" }),
            makeCharacter({ id: "char-2" }),
            makeCharacter({ id: "char-3" }),
          ],
        },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().removeCharacter("char-2")

      const state = useProjectStore.getState()
      expect(state.project!.characters).toHaveLength(2)
      expect(state.project!.characters.map((c) => c.id)).toEqual(["char-1", "char-3"])
    })
  })

  describe("updateCharacter", () => {
    it("should merge partial updates on the target character", () => {
      useProjectStore.setState({
        project: {
          ...mockProject,
          characters: [makeCharacter({ id: "char-1", name: "Warrior", description: "old desc" })],
        },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().updateCharacter("char-1", {
        name: "Knight",
        description: "updated desc",
      })

      const state = useProjectStore.getState()
      const updated = state.project!.characters[0]
      expect(updated.name).toBe("Knight")
      expect(updated.description).toBe("updated desc")
    })
  })

  describe("setActiveCharacter", () => {
    it("should set the active character id", () => {
      useProjectStore.setState({
        project: mockProject,
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().setActiveCharacter("char-1")

      expect(useProjectStore.getState().project!.activeCharacterId).toBe("char-1")
    })

    it("should clear active character id when set to null", () => {
      useProjectStore.setState({
        project: { ...mockProject, activeCharacterId: "char-1" },
        projectPath: "/tmp/test-project",
        isLoaded: true,
      })

      useProjectStore.getState().setActiveCharacter(null)

      expect(useProjectStore.getState().project!.activeCharacterId).toBeNull()
    })
  })
})
