import { useEffect } from "react"
import { getAppZoomScale, useSettingsStore } from "../stores/settings-store"

export function useAppZoom() {
  const appZoomLevel = useSettingsStore((s) => s.appZoomLevel)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--mova-app-zoom", String(getAppZoomScale(appZoomLevel)))

    return () => {
      root.style.removeProperty("--mova-app-zoom")
    }
  }, [appZoomLevel])
}
