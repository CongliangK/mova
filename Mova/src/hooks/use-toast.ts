import { useContext } from "react"
import { ToastContext } from "../components/ui/toast-context"
import type { ToastContextValue } from "../components/ui/toast-context"

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return context
}
