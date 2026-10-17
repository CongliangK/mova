import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./styles/globals.css"
import App from "./App"
import { ErrorBoundary } from "./components/ui/error-boundary"
import { ToastProvider } from "./components/ui/toast"
import { initPerfDebugOverlay } from "./utils/perf-debug"
import { applyConfiguredPerformanceMode } from "./utils/performance-mode"

applyConfiguredPerformanceMode()
initPerfDebugOverlay()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)
