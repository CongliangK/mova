import type { ToolResult } from "../../../types/ai"

function normalizeForComparison(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/g, "")
}

function containsParentReference(path: string): boolean {
  return normalizeForComparison(path).split("/").includes("..")
}

export function validateProjectAssetPath(
  path: string,
  projectPath: string,
  label: string,
): ToolResult | null {
  if (!path.trim()) {
    return { success: false, error: `${label} cannot be empty.` }
  }
  if (path.includes("\0")) {
    return { success: false, error: `${label} cannot contain null bytes.` }
  }
  if (containsParentReference(path)) {
    return { success: false, error: `${label} must stay inside the current project.` }
  }

  const normalizedPath = normalizeForComparison(path)
  const normalizedProjectPath = normalizeForComparison(projectPath)
  const isInsideProject =
    normalizedPath === normalizedProjectPath || normalizedPath.startsWith(`${normalizedProjectPath}/`)

  if (!isInsideProject) {
    return { success: false, error: `${label} must be inside the current project.` }
  }

  return null
}
