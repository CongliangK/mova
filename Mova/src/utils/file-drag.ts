import type { FileNode } from "../types/file-tree"
import { logDnd } from "./dnd-debug"

export const MOVA_FILE_DRAG_TYPE = "application/x-mova-file"

export interface MovaFileDragPayload {
  path: string
  name: string
  category: string
  isDirectory: boolean
}

export function createFileDragPayload(node: FileNode): MovaFileDragPayload {
  return {
    path: node.path,
    name: node.name,
    category: node.category,
    isDirectory: node.isDirectory,
  }
}

export function readFileDragPayload(
  dataTransfer: DataTransfer,
): MovaFileDragPayload | null {
  const structured = dataTransfer.getData(MOVA_FILE_DRAG_TYPE)
  logDnd("readFileDragPayload", {
    types: Array.from(dataTransfer.types ?? []),
    hasStructured: Boolean(structured),
    textPlain: dataTransfer.getData("text/plain"),
  })
  if (structured) {
    try {
      const parsed = JSON.parse(structured) as Partial<MovaFileDragPayload>
      if (typeof parsed.path === "string" && parsed.path) {
        return {
          path: parsed.path,
          name:
            typeof parsed.name === "string"
              ? parsed.name
              : (parsed.path.split("/").pop() ?? parsed.path),
          category:
            typeof parsed.category === "string" ? parsed.category : "unknown",
          isDirectory: parsed.isDirectory === true,
        }
      }
    } catch {
      logDnd("readFileDragPayload parse failed", null)
      return null
    }
  }

  const path = dataTransfer.getData("text/plain")
  if (!path) return null
  return {
    path,
    name: path.split("/").pop() ?? path,
    category: "unknown",
    isDirectory: false,
  }
}
