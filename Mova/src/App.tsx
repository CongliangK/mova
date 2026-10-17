import { Suspense, lazy, useMemo, useRef, useState, useEffect } from "react"
import { useProjectStore, setProjectAutoSaveErrorHandler } from "./stores/project-store"
import { useChatStore, setChatAutoSaveErrorHandler } from "./stores/chat-store"
import { useAnimationStore } from "./stores/animation-store"
import { useSettingsStore } from "./stores/settings-store"
import { useTheme } from "./hooks/use-theme"
import { useAppZoom } from "./hooks/use-app-zoom"
import { useShortcuts } from "./hooks/use-shortcuts"
import { useToast } from "./hooks/use-toast"
import { AppLayout } from "./components/layout/app-layout"
import { Sidebar } from "./components/layout/sidebar"
import { CanvasArea } from "./components/canvas/canvas-area"
import { ChatPanel } from "./components/chat/chat-panel"
import { WelcomePage } from "./pages/welcome-page"
import {
  bootstrapBrowserDemoWorkspace,
  isBrowserDemoWorkspaceEnabled,
} from "./dev/browser-demo-workspace"

const ExportWizard = lazy(() =>
  import("./components/export/export-wizard").then((module) => ({
    default: module.ExportWizard,
  })),
)
const SettingsPage = lazy(() =>
  import("./pages/settings-page").then((module) => ({
    default: module.SettingsPage,
  })),
)

function OverlayFallback() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-overlay)]">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-4 py-3 text-sm font-semibold text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
        Loading...
      </div>
    </div>
  )
}

function App() {
  const isLoaded = useProjectStore((s) => s.isLoaded)
  const project = useProjectStore((s) => s.project)
  const projectPath = useProjectStore((s) => s.projectPath)
  const closeProject = useProjectStore((s) => s.closeProject)
  const zoomAppIn = useSettingsStore((s) => s.zoomAppIn)
  const zoomAppOut = useSettingsStore((s) => s.zoomAppOut)
  const resetAppZoom = useSettingsStore((s) => s.resetAppZoom)
  const [showSettings, setShowSettings] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const demoBootstrapAttempted = useRef(false)
  const browserDemoWorkspace = isBrowserDemoWorkspaceEnabled()
  const toast = useToast()
  useTheme()
  useAppZoom()

  useEffect(() => {
    setProjectAutoSaveErrorHandler((message) => {
      toast.showToast("error", message)
    })
    setChatAutoSaveErrorHandler((message) => {
      toast.showToast("error", message)
    })
    return () => {
      setProjectAutoSaveErrorHandler(null)
      setChatAutoSaveErrorHandler(null)
    }
  }, [toast])

  const shortcutCallbacks = useMemo(
    () => ({
      zoomIn: zoomAppIn,
      zoomOut: zoomAppOut,
      zoomReset: resetAppZoom,
    }),
    [zoomAppIn, zoomAppOut, resetAppZoom],
  )

  useShortcuts(shortcutCallbacks)

  useEffect(() => {
    if (demoBootstrapAttempted.current) return
    demoBootstrapAttempted.current = true
    bootstrapBrowserDemoWorkspace()
  }, [])

  // Load project-scoped conversations when project changes
  useEffect(() => {
    if (!projectPath) return

    const chatStore = useChatStore.getState()
    chatStore.loadProjectConversations(projectPath)
    void chatStore.loadProjectConversationsFromStorage(projectPath)
  }, [projectPath])

  useEffect(() => {
    const animationStore = useAnimationStore.getState()
    const activeCharacter = project?.characters.find((c) => c.id === project.activeCharacterId)
    const animations = activeCharacter?.animations ?? []
    const currentActiveId = animationStore.activeAnimationId
    const nextActiveId =
      currentActiveId && animations.some((animation) => animation.id === currentActiveId)
        ? currentActiveId
        : animations.at(-1)?.id ?? animations[0]?.id ?? null

    animationStore.setAnimations(animations)
    if (animationStore.activeAnimationId !== nextActiveId) {
      animationStore.setActiveAnimation(nextActiveId)
    }
  }, [project])

  // Save and clear conversations when closing project
  const handleBackToHome = () => {
    useChatStore.getState().saveCurrentConversations()
    closeProject()
  }

  if (!isLoaded) {
    return (
      <>
        <WelcomePage onSettings={() => setShowSettings(true)} />
        {showSettings && (
          <Suspense fallback={<OverlayFallback />}>
            <SettingsPage onClose={() => setShowSettings(false)} />
          </Suspense>
        )}
      </>
    )
  }

  return (
    <>
      <AppLayout
        sidebar={<Sidebar />}
        canvas={<CanvasArea />}
        chat={<ChatPanel />}
        onExport={() => {
          if (!browserDemoWorkspace) setShowExport(true)
        }}
        onOpenSettings={() => setShowSettings(true)}
        onBackToHome={handleBackToHome}
      />
      {browserDemoWorkspace && (
        <div className="pointer-events-none fixed right-4 top-4 z-40 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
          Browser demo workspace · read-only
        </div>
      )}
      {showSettings && (
        <Suspense fallback={<OverlayFallback />}>
          <SettingsPage onClose={() => setShowSettings(false)} />
        </Suspense>
      )}
      {showExport && !browserDemoWorkspace && (
        <Suspense fallback={<OverlayFallback />}>
          <ExportWizard open={showExport} onClose={() => setShowExport(false)} />
        </Suspense>
      )}
    </>
  )
}

export default App
