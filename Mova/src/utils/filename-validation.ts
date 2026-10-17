/**
 * Validate a user-supplied file name before joining it onto a project path.
 * Returns a human-readable error, or null for a safe single path component.
 */
export function validateFileBasename(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) {
    return "File name cannot be empty"
  }
  if ([...trimmed].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0
    return codePoint < 0x20 || codePoint === 0x7f
  })) {
    return "File name cannot contain control characters"
  }
  if (trimmed === "." || trimmed === "..") {
    return "File name cannot be a directory reference"
  }
  if (/^[\\/]/.test(trimmed) || /^[a-zA-Z]:/.test(trimmed)) {
    return "File name cannot be an absolute or drive path"
  }
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return "File name cannot contain path separators"
  }
  return null
}

export const validateFileName = validateFileBasename
