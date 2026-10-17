import {
  useState,
  useCallback,
  useRef,
} from "react"
import type { ReactNode } from "react"
import { ToastContext } from "./toast-context"
import type { ToastType, Toast } from "./toast-context"

const TOAST_DURATION = 3000

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback(
    (type: ToastType, message: string, duration = TOAST_DURATION) => {
      const id = `${Date.now()}-${Math.random()}`
      setToasts((prev) => [...prev, { id, type, message }])
      const timer = window.setTimeout(() => {
        removeToast(id)
      }, duration)
      timersRef.current.set(id, timer)
    },
    [removeToast]
  )

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    top: "var(--space-lg)",
    right: "var(--space-lg)",
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-sm)",
    zIndex: 9999,
    pointerEvents: "none",
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={containerStyle}>
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

interface ToastItemProps {
  toast: Toast
  onDismiss: () => void
}

const typeStyles: Record<ToastType, React.CSSProperties> = {
  success: {
    backgroundColor: "var(--color-success)",
    color: "#ffffff",
  },
  error: {
    backgroundColor: "var(--color-danger)",
    color: "#ffffff",
  },
  warning: {
    backgroundColor: "var(--color-warning)",
    color: "#ffffff",
  },
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const toastStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-sm)",
    padding: "var(--space-sm) var(--space-md)",
    borderRadius: "var(--radius-md)",
    fontFamily: "var(--font-sans)",
    fontSize: "var(--text-sm)",
    fontWeight: 500,
    boxShadow: "var(--shadow-md)",
    pointerEvents: "auto",
    minWidth: "200px",
    maxWidth: "400px",
    animation: "toastSlideIn var(--duration-normal) var(--ease-default)",
    ...typeStyles[toast.type],
  }

  const closeStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "inherit",
    cursor: "pointer",
    fontSize: "16px",
    lineHeight: 1,
    padding: "var(--space-xs)",
    marginLeft: "auto",
    opacity: 0.8,
    transition: `opacity var(--duration-fast) var(--ease-default)`,
  }

  return (
    <div style={toastStyle}>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={closeStyle}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
        aria-label="Dismiss"
      >
        ×
      </button>
      <style>{`
        @keyframes toastSlideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}


