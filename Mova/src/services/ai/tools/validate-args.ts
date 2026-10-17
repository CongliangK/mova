/**
 * Type-safe argument validators for AI tool execute functions.
 *
 * Tool args arrive as `Record<string, unknown>` from the LLM.  These helpers
 * replace unsafe `as` casts with runtime checks that throw descriptive errors
 * when the LLM sends malformed arguments.
 */

export class ToolArgError extends Error {
  constructor(field: string, expected: string, actual: string) {
    super(`Invalid argument "${field}": expected ${expected}, got ${actual}`)
    this.name = "ToolArgError"
  }
}

/**
 * Validate that a value is a string. Throws if not.
 */
export function validateString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ToolArgError(field, "string", typeof value)
  }
  return value
}

/**
 * Validate that a value is a number (and not NaN). Throws if not.
 */
export function validateNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ToolArgError(field, "number", typeof value)
  }
  return value
}

/**
 * Validate that a value is a boolean. Throws if not.
 */
export function validateBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ToolArgError(field, "boolean", typeof value)
  }
  return value
}

/**
 * Validate that a value is a string array. Throws if not.
 */
export function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new ToolArgError(field, "string[]", Array.isArray(value) ? "array" : typeof value)
  }
  return value
}

/**
 * Return the value if it's a string, otherwise `undefined`.
 */
export function validateOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

/**
 * Return the value if it's a number (and not NaN), otherwise `undefined`.
 */
export function validateOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && !Number.isNaN(value) ? value : undefined
}
