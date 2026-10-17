import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { AnimationTimeline } from "../../src/components/canvas/animation-timeline"
import { ExportWizard } from "../../src/components/export/export-wizard"
import { SettingsPage } from "../../src/pages/settings-page"
import { useAnimationStore } from "../../src/stores/animation-store"
import { useProjectStore } from "../../src/stores/project-store"
import { useSettingsStore } from "../../src/stores/settings-store"
import type { Project } from "../../src/types/project"

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue({
    outputPath: "/tmp/mova-project/output.tres",
    manifestPath: "/tmp/mova-project/output.tres.mova-export.json",
  }),
}))

type JobProgressEvent = {
  payload: {
    job_id: string
    status: string
    progress?: number
    stage?: string
    error?: string
  }
}

const eventMocks = vi.hoisted(() => ({
  handler: null as ((event: JobProgressEvent) => void) | null,
  unlisten: vi.fn(),
}))

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((_eventName: string, handler: (event: JobProgressEvent) => void) => {
    eventMocks.handler = handler
    return Promise.resolve(eventMocks.unlisten)
  }),
}))

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
}))

vi.mock("../../src/hooks/use-toast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}))

const mockProject: Project = {
  id: "project-1",
  name: "Export Project",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  activeCharacterId: "character-1",
  settings: {
    defaultFrameWidth: 64,
    defaultFrameHeight: 64,
    defaultFps: 12,
    defaultArtStyle: "pixel-art",
  },
  characters: [
    {
      id: "character-1",
      name: "Hero",
      description: "A test character",
      style: {
        artStyle: "pixel-art",
        colorPalette: ["#ffffff"],
        frameSize: { width: 64, height: 64 },
        referenceDescription: "white hero",
      },
      baseImagePath: null,
      tags: [],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      animations: [
        {
          id: "animation-1",
          name: "Idle",
          direction: "right",
          frameCount: 2,
          fps: 8,
          loop: true,
          status: "complete",
          metadata: {
            motionDescription: "idle",
            keyframeHints: [],
            generationParams: {},
          },
          frames: [
            {
              id: "frame-1",
              index: 0,
              imagePath: "/tmp/mova-project/assets/frames/idle-1.png",
              duration: null,
              description: "first",
              sourceFrameId: null,
            },
            {
              id: "frame-2",
              index: 1,
              imagePath: "/tmp/mova-project/assets/frames/idle-2.png",
              duration: null,
              description: "second",
              sourceFrameId: null,
            },
          ],
        },
      ],
    },
  ],
}

describe("ExportWizard Godot export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventMocks.handler = null
    eventMocks.unlisten.mockClear()
    useProjectStore.setState({
      project: mockProject,
      projectPath: "/tmp/mova-project",
      isLoaded: true,
    })
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
    useSettingsStore.setState({
      locale: "en-US",
      exportSettings: {
        defaultFormat: "webp",
        defaultColumns: 7,
        frameSpacing: 3,
        transparentBackground: false,
        enginePreset: "godot",
      },
    })
  })

  it("uses persisted export settings as wizard defaults", () => {
    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))

    const selects = container.querySelectorAll("select")
    const inputs = container.querySelectorAll("input")
    expect(selects[0]).toHaveValue("webp")
    expect(inputs[0]).toHaveValue(7)
    expect(inputs[1]).toHaveValue(3)
    expect(inputs[2]).toHaveValue(1)
    expect(inputs[3]).toBeChecked()
    expect(inputs[3]).toBeDisabled()
  })

  it("shows transparency settings as read-only because sprite sheets already preserve alpha", () => {
    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))

    const transparencyOption = screen.getByRole("checkbox", { name: /transparent background/i })
    expect(transparencyOption).toBeChecked()
    expect(transparencyOption).toBeDisabled()
    expect(screen.getByText(/PNG\/WebP sprite sheets always use transparent padding/)).toBeInTheDocument()
  })

  it("shows the saved export transparency setting as read-only", () => {
    render(<SettingsPage onClose={vi.fn()} />)

    fireEvent.click(screen.getByRole("button", { name: /export/i }))

    const transparencySetting = screen.getByRole("checkbox", { name: /transparent background/i })
    expect(transparencySetting).toBeChecked()
    expect(transparencySetting).toBeDisabled()
    expect(screen.getByText(/sprite sheets preserve transparency automatically/)).toBeInTheDocument()
  })

  it("sends the project path as Godot resource_dir instead of a frame width", async () => {
    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "godot" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(screen.getByPlaceholderText("/path/to/output.png"), {
      target: { value: "/tmp/mova-project/output.tres" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByLabelText("Export sprite sheet"))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("export_godot_sprite_frames", {
        req: expect.objectContaining({
          animations: [
            {
              name: "Idle",
              frame_paths: [
                "/tmp/mova-project/assets/frames/idle-1.png",
                "/tmp/mova-project/assets/frames/idle-2.png",
              ],
              speed: 8,
              loop_: true,
            },
          ],
          output_path: "/tmp/mova-project/output.tres",
          resource_dir: "/tmp/mova-project",
          manifest: expect.objectContaining({
            project: { id: "project-1", name: "Export Project" },
            animation: { id: "animation-1", name: "Idle", frameCount: 2, fps: 8 },
            export: expect.objectContaining({
              format: "godot",
              outputPath: "/tmp/mova-project/output.tres",
            }),
            sourceFrames: [
              expect.objectContaining({
                id: "frame-1",
                index: 0,
                imagePath: "/tmp/mova-project/assets/frames/idle-1.png",
              }),
              expect.objectContaining({
                id: "frame-2",
                index: 1,
                imagePath: "/tmp/mova-project/assets/frames/idle-2.png",
              }),
            ],
          }),
        }),
      })
    })
  })

  it("shows Godot progress events with the existing progress UI", async () => {
    let resolveExport: (result: { outputPath: string; manifestPath: string }) => void = () => {}
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve
        })
    )

    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "godot" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(screen.getByPlaceholderText("/path/to/output.png"), {
      target: { value: "/tmp/mova-project/output.tres" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByLabelText("Export sprite sheet"))

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith("mova:job-progress", expect.any(Function))
      expect(invoke).toHaveBeenCalledWith("export_godot_sprite_frames", expect.any(Object))
    })

    await act(async () => {
      eventMocks.handler?.({
        payload: {
          job_id: "godot-export-job",
          status: "running",
          progress: 0.5,
          stage: "Resource 1/2",
        },
      })
    })

    expect(screen.getByText("Resource 1/2")).toBeInTheDocument()
    expect(screen.getByText("50%")).toBeInTheDocument()

    await act(async () => {
      resolveExport({
        outputPath: "/tmp/mova-project/output.tres",
        manifestPath: "/tmp/mova-project/output.tres.mova-export.json",
      })
    })

    expect(await screen.findByText(/Exported to: \/tmp\/mova-project\/output\.tres/)).toBeInTheDocument()
    expect(eventMocks.unlisten).toHaveBeenCalled()
  })

  it("shows the manifest path after a sprite-sheet export and sends safe manifest payload", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      outputPath: "/tmp/mova-project/sheet.webp",
      manifestPath: "/tmp/mova-project/sheet.webp.mova-export.json",
    })

    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(screen.getByPlaceholderText("/path/to/output.png"), {
      target: { value: "/tmp/mova-project/sheet.webp" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByLabelText("Export sprite sheet"))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("export_sprite_sheet", {
        req: expect.objectContaining({
          frame_paths: [
            "/tmp/mova-project/assets/frames/idle-1.png",
            "/tmp/mova-project/assets/frames/idle-2.png",
          ],
          output_path: "/tmp/mova-project/sheet.webp",
          columns: 7,
          frame_width: 64,
          frame_height: 64,
          padding: 3,
          manifest: expect.objectContaining({
            project: { id: "project-1", name: "Export Project" },
            animation: { id: "animation-1", name: "Idle", frameCount: 2, fps: 8 },
            export: {
              format: "webp",
              outputPath: "/tmp/mova-project/sheet.webp",
              settings: {
                columns: 7,
                frameWidth: 64,
                frameHeight: 64,
                padding: 3,
                scale: 1,
                transparentBackground: true,
                alphaMode: "preserved",
              },
              dimensions: {
                frameWidth: 64,
                frameHeight: 64,
                sheetWidth: 472,
                sheetHeight: 70,
              },
            },
            sourceFrames: [
              expect.objectContaining({ id: "frame-1", sourceFrameId: null }),
              expect.objectContaining({ id: "frame-2", sourceFrameId: null }),
            ],
          }),
        }),
      })
    })

    expect(await screen.findByText(/Exported to: \/tmp\/mova-project\/sheet.webp/)).toBeInTheDocument()
    expect(screen.getByText(/Manifest: \/tmp\/mova-project\/sheet.webp\.mova-export\.json/)).toBeInTheDocument()
  })

  it("shows the manifest path after a GIF export and sends manifest payload", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      outputPath: "/tmp/mova-project/idle.gif",
      manifestPath: "/tmp/mova-project/idle.gif.mova-export.json",
    })

    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "gif" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(screen.getByPlaceholderText("/path/to/output.png"), {
      target: { value: "/tmp/mova-project/idle.gif" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByLabelText("Export sprite sheet"))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("export_gif", {
        req: expect.objectContaining({
          frame_paths: [
            "/tmp/mova-project/assets/frames/idle-1.png",
            "/tmp/mova-project/assets/frames/idle-2.png",
          ],
          output_path: "/tmp/mova-project/idle.gif",
          fps: 8,
          width: 64,
          height: 64,
          manifest: expect.objectContaining({
            project: { id: "project-1", name: "Export Project" },
            animation: { id: "animation-1", name: "Idle", frameCount: 2, fps: 8 },
            export: {
              format: "gif",
              outputPath: "/tmp/mova-project/idle.gif",
              settings: {
                fps: 8,
                width: 64,
                height: 64,
                scale: 1,
                transparentBackground: false,
                alphaMode: "flattenedToIndexedPalette",
              },
              dimensions: { width: 64, height: 64 },
            },
            sourceFrames: [
              expect.objectContaining({ id: "frame-1", imagePath: "/tmp/mova-project/assets/frames/idle-1.png" }),
              expect.objectContaining({ id: "frame-2", imagePath: "/tmp/mova-project/assets/frames/idle-2.png" }),
            ],
          }),
        }),
      })
    })

    expect(await screen.findByText(/Exported to: \/tmp\/mova-project\/idle.gif/)).toBeInTheDocument()
    expect(screen.getByText(/Manifest: \/tmp\/mova-project\/idle.gif\.mova-export\.json/)).toBeInTheDocument()
  })

  it("blocks export when selected animation has blank frame paths", async () => {
    useProjectStore.setState({
      project: {
        ...mockProject,
        characters: [
          {
            ...mockProject.characters[0],
            animations: [
              {
                ...mockProject.characters[0].animations[0],
                frameCount: 3,
                frames: [
                  mockProject.characters[0].animations[0].frames[0],
                  {
                    ...mockProject.characters[0].animations[0].frames[1],
                    imagePath: "",
                  },
                  {
                    ...mockProject.characters[0].animations[0].frames[1],
                    id: "frame-3",
                    index: 2,
                    imagePath: "   ",
                    description: "third",
                  },
                ],
              },
            ],
          },
        ],
      },
    })

    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(screen.getByPlaceholderText("/path/to/output.png"), {
      target: { value: "/tmp/mova-project/output.webp" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByLabelText("Export sprite sheet"))

    expect(
      await screen.findByText(
        "Cannot export because frames 2, 3 are blank. Fill or remove blank frames before exporting."
      )
    ).toBeInTheDocument()
    expect(invoke).not.toHaveBeenCalled()
  })

  it("exports the project-store animation after a timeline duplicate edit", async () => {
    const persistedAnimation = mockProject.characters[0].animations[0]
    useAnimationStore.setState({
      animations: [persistedAnimation],
      activeAnimationId: persistedAnimation.id,
      currentFrameIndex: 0,
    })
    render(<AnimationTimeline />)
    fireEvent.click(screen.getByLabelText("Duplicate current frame"))

    const { container } = render(<ExportWizard open={true} onClose={vi.fn()} />)

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "animation-1" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(container.querySelector("select")!, {
      target: { value: "godot" },
    })
    fireEvent.click(screen.getByText("Next"))

    fireEvent.change(screen.getByPlaceholderText("/path/to/output.png"), {
      target: { value: "/tmp/mova-project/output.tres" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Export" }))
    fireEvent.click(screen.getByLabelText("Export sprite sheet"))

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("export_godot_sprite_frames", {
        req: expect.objectContaining({
          animations: [
            {
              name: "Idle",
              frame_paths: [
                "/tmp/mova-project/assets/frames/idle-1.png",
                "/tmp/mova-project/assets/frames/idle-1.png",
                "/tmp/mova-project/assets/frames/idle-2.png",
              ],
              speed: 8,
              loop_: true,
            },
          ],
          output_path: "/tmp/mova-project/output.tres",
          resource_dir: "/tmp/mova-project",
          manifest: expect.objectContaining({
            animation: expect.objectContaining({ frameCount: 3 }),
            sourceFrames: [
              expect.objectContaining({ id: "frame-1", imagePath: "/tmp/mova-project/assets/frames/idle-1.png" }),
              expect.objectContaining({ imagePath: "/tmp/mova-project/assets/frames/idle-1.png" }),
              expect.objectContaining({ id: "frame-2", imagePath: "/tmp/mova-project/assets/frames/idle-2.png" }),
            ],
          }),
        }),
      })
    })
  })
})
