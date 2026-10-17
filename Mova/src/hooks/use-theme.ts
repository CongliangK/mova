import { useEffect } from "react"
import { useSettingsStore } from "../stores/settings-store"

export function useTheme() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark")
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
  }, [theme])

  return { theme, setTheme, toggle: () => setTheme(theme === "light" ? "dark" : "light") }
}
