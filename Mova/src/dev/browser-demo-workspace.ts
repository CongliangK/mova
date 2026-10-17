import { useAnimationStore } from "../stores/animation-store"
import { useFileTreeStore } from "../stores/file-tree-store"
import { useGitStore } from "../stores/git-store"
import { useProjectStore } from "../stores/project-store"
import type { Animation } from "../types/animation"
import type { FileNode } from "../types/file-tree"
import type { Project } from "../types/project"

const DEMO_WORKSPACE_QUERY_KEY = "demoWorkspace"
const DEMO_WORKSPACE_STORAGE_KEY = "mova:browserDemoWorkspace"

export const BROWSER_DEMO_PROJECT_ID = "browser-demo-workspace"
export const BROWSER_DEMO_PROJECT_PATH = "/demo-workspace"

const DEMO_FRAME_1 =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
      <rect width="320" height="240" rx="24" fill="#101827"/>
      <circle cx="160" cy="104" r="42" fill="#ffbd2e"/>
      <rect x="118" y="146" width="84" height="54" rx="18" fill="#ff3830"/>
      <rect x="96" y="200" width="128" height="10" rx="5" fill="#28c840"/>
    </svg>`,
  )

const DEMO_FRAME_2 =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
      <rect width="320" height="240" rx="24" fill="#101827"/>
      <circle cx="172" cy="98" r="42" fill="#ffbd2e"/>
      <rect x="130" y="140" width="84" height="60" rx="18" fill="#ff3830"/>
      <rect x="104" y="202" width="136" height="10" rx="5" fill="#28c840"/>
    </svg>`,
  )

type DemoEnv = Pick<ImportMetaEnv, "DEV">

function getDemoFlagFromLocation(location: Location | URL) {
  const params = new URLSearchParams(location.search)
  return params.get(DEMO_WORKSPACE_QUERY_KEY) === "1"
}

function getDemoFlagFromStorage(storage: Storage | undefined) {
  try {
    return storage?.getItem(DEMO_WORKSPACE_STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

export function isBrowserDemoWorkspaceEnabled({
  env = import.meta.env,
  location = window.location,
  storage = window.localStorage,
}: {
  env?: DemoEnv
  location?: Location | URL
  storage?: Storage
} = {}) {
  if (!env.DEV) return false
  return getDemoFlagFromLocation(location) || getDemoFlagFromStorage(storage)
}

function createDemoAnimation(): Animation {
  return {
    id: "demo-idle-animation",
    name: "Idle panel-resize demo",
    fps: 6,
    loop: true,
    frames: [
      {
        id: "demo-idle-frame-1",
        index: 0,
        imagePath: DEMO_FRAME_1,
        duration: 166,
        description: "Synthetic browser demo frame 1",
        sourceFrameId: null,
      },
      {
        id: "demo-idle-frame-2",
        index: 1,
        imagePath: DEMO_FRAME_2,
        duration: 166,
        description: "Synthetic browser demo frame 2",
        sourceFrameId: null,
      },
    ],
    direction: "right",
    frameCount: 2,
    status: "complete",
    metadata: {
      motionDescription: "Small idle shift for panel-resize performance testing.",
      keyframeHints: ["idle", "browser-demo"],
      generationParams: { synthetic: true },
    },
  }
}

function createDemoProject(): Project {
  const now = "2026-01-01T00:00:00.000Z"
  const animation = createDemoAnimation()
  return {
    id: BROWSER_DEMO_PROJECT_ID,
    name: "Browser Demo Workspace",
    version: 1,
    characters: [
      {
        id: "demo-hero-character",
        name: "Demo Hero",
        description: "Synthetic in-memory character for Chrome panel performance testing.",
        style: {
          artStyle: "pixel-art",
          colorPalette: ["#ff3830", "#ffbd2e", "#28c840", "#101827"],
          frameSize: { width: 320, height: 240 },
          referenceDescription: "Simple generated SVG placeholders; no filesystem access.",
        },
        baseImagePath: DEMO_FRAME_1,
        animations: [animation],
        tags: ["demo", "browser", "performance"],
        createdAt: now,
        updatedAt: now,
      },
    ],
    activeCharacterId: "demo-hero-character",
    settings: {
      defaultFrameWidth: 320,
      defaultFrameHeight: 240,
      defaultFps: 6,
      defaultArtStyle: "pixel-art",
    },
    createdAt: now,
    updatedAt: now,
  }
}

function createDemoFileTree(): FileNode[] {
  return [
    {
      name: "demo-workspace",
      path: BROWSER_DEMO_PROJECT_PATH,
      isDirectory: true,
      category: "folder",
      gitStatus: "modified",
      children: [
        {
          name: "assets",
          path: `${BROWSER_DEMO_PROJECT_PATH}/assets`,
          isDirectory: true,
          category: "folder",
          children: [
            {
              name: "characters",
              path: `${BROWSER_DEMO_PROJECT_PATH}/assets/characters`,
              isDirectory: true,
              category: "folder",
              children: [
                {
                  name: "hero-idle-01.png",
                  path: `${BROWSER_DEMO_PROJECT_PATH}/assets/characters/hero-idle-01.png`,
                  isDirectory: false,
                  category: "image",
                  size: 4096,
                  modifiedAt: "2026-01-01T00:00:00.000Z",
                  gitStatus: "modified",
                },
                {
                  name: "hero-idle-02.png",
                  path: `${BROWSER_DEMO_PROJECT_PATH}/assets/characters/hero-idle-02.png`,
                  isDirectory: false,
                  category: "image",
                  size: 4096,
                  modifiedAt: "2026-01-01T00:00:00.000Z",
                  gitStatus: "untracked",
                },
              ],
            },
          ],
        },
        {
          name: "project.json",
          path: `${BROWSER_DEMO_PROJECT_PATH}/project.json`,
          isDirectory: false,
          category: "config",
          size: 2048,
          modifiedAt: "2026-01-01T00:00:00.000Z",
          gitStatus: "modified",
        },
        {
          name: "notes.md",
          path: `${BROWSER_DEMO_PROJECT_PATH}/notes.md`,
          isDirectory: false,
          category: "document",
          size: 1024,
          modifiedAt: "2026-01-01T00:00:00.000Z",
          gitStatus: "unmodified",
        },
        {
          name: "exports",
          path: `${BROWSER_DEMO_PROJECT_PATH}/exports`,
          isDirectory: true,
          category: "folder",
          children: [],
        },
      ],
    },
  ]
}

export function seedBrowserDemoWorkspace() {
  const project = createDemoProject()
  const animation = project.characters[0]?.animations[0]

  useProjectStore.setState({
    project,
    // Keep projectPath null on purpose: demo mode is in-memory/read-only and
    // must not trigger project auto-save or filesystem-backed drag/drop writes.
    projectPath: null,
    isLoaded: true,
  })

  useAnimationStore.setState({
    animations: animation ? [animation] : [],
    activeAnimationId: animation?.id ?? null,
    currentFrameIndex: 0,
    isPlaying: false,
  })

  useFileTreeStore.setState({
    tree: createDemoFileTree(),
    currentPath: BROWSER_DEMO_PROJECT_PATH,
    expandedPaths: new Set([
      BROWSER_DEMO_PROJECT_PATH,
      `${BROWSER_DEMO_PROJECT_PATH}/assets`,
      `${BROWSER_DEMO_PROJECT_PATH}/assets/characters`,
    ]),
    selectedPath: null,
    searchQuery: "",
    isLoading: false,
    error: null,
  })

  useGitStore.setState({
    isRepo: true,
    branch: "demo/browser-workspace",
    files: [
      { path: "project.json", status: "modified" },
      { path: "assets/characters/hero-idle-01.png", status: "modified" },
      { path: "assets/characters/hero-idle-02.png", status: "untracked" },
    ],
    log: [
      {
        hash: "demo0001",
        message: "Seed browser demo workspace",
        author: "Mova Demo",
        date: "2026-01-01T00:00:00.000Z",
      },
    ],
    isLoading: false,
    error: null,
  })
}

export function bootstrapBrowserDemoWorkspace() {
  if (!isBrowserDemoWorkspaceEnabled()) return false

  const currentProject = useProjectStore.getState().project
  if (currentProject && currentProject.id !== BROWSER_DEMO_PROJECT_ID) {
    return false
  }

  seedBrowserDemoWorkspace()
  console.info("Browser demo workspace enabled")
  return true
}
