import { createContext } from "react"

export type ToastType = "success" | "error" | "warning"

export interface Toast {
  id: string
  type: ToastType
  message: string
}

export interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
