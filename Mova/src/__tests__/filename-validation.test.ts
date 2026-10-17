import { describe, expect, it } from "vitest"
import { validateFileName } from "../../src/utils/filename-validation"

describe("validateFileName", () => {
  const valid = [
    "notes.txt",
    "hero.png",
    "frame.1.png",
    "with spaces.md",
    "中文文件.json",
    "a",
    "under_score.js",
    "kebab-case.glb",
  ]
  for (const name of valid) {
    it(`accepts ${JSON.stringify(name)}`, () => {
      expect(validateFileName(name)).toBeNull()
    })
  }

  const invalid: Array<[string, RegExp]> = [
    ["", /empty/i],
    ["   ", /empty/i],
    ["../outside.txt", /separator/],
    ["..\\outside.txt", /separator/],
    ["sub/dir.txt", /separator/],
    ["sub\\dir.txt", /separator/],
    [".", /directory reference/i],
    ["..", /directory reference/i],
    ["/etc/passwd", /absolute or drive/i],
    ["\\windows\\sys", /absolute or drive/i],
    ["C:\\Users\\x", /absolute or drive/i],
    ["D:/secret", /absolute or drive/i],
    ["C:evil", /absolute or drive/i],
  ]
  for (const [name, pattern] of invalid) {
    it(`rejects ${JSON.stringify(name)} with a matching message`, () => {
      const result = validateFileName(name)
      expect(result).not.toBeNull()
      expect(result as string).toMatch(pattern)
    })
  }
})
