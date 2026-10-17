import { describe, it, expect, beforeEach } from "vitest"
import { SkillRegistry } from "../../src/services/ai/skills/skill-registry"
import { spriteGenerationSkill } from "../../src/services/ai/skills/sprite-generation-skill"
import type { Skill } from "../../src/types/ai"

const mockSkill: Skill = {
  name: "test-skill",
  description: "A test skill",
  systemPrompt: "You are a test assistant.",
  tools: [],
  buildContext: () => "test context",
}

const characterSkill: Skill = {
  name: "character-creation",
  description: "Character creation skill",
  systemPrompt: "You create characters.",
  tools: [],
  buildContext: () => "character context",
}

const generalSkill: Skill = {
  name: "general",
  description: "General skill",
  systemPrompt: "You are general.",
  tools: [],
  buildContext: () => "general context",
}

describe("SkillRegistry", () => {
  let registry: SkillRegistry

  beforeEach(() => {
    registry = new SkillRegistry()
  })

  describe("register", () => {
    it("should register a skill without keywords", () => {
      registry.register(mockSkill)
      expect(registry.getSkill("test-skill")).toBe(mockSkill)
    })

    it("should register a skill with keywords", () => {
      registry.register(characterSkill, ["角色", "character", "sprite"])
      expect(registry.getSkill("character-creation")).toBe(characterSkill)
    })
  })

  describe("unregister", () => {
    it("should remove a skill and its keywords", () => {
      registry.register(characterSkill, ["角色", "character"])
      registry.unregister("character-creation")
      expect(registry.getSkill("character-creation")).toBeUndefined()
      expect(registry.getSkillForIntent("创建一个角色")).toBeNull()
    })

    it("should clear active skill if unregistered", () => {
      registry.register(mockSkill)
      registry.setActiveSkill("test-skill")
      registry.unregister("test-skill")
      expect(registry.getActiveSkill()).toBeNull()
    })
  })

  describe("getAvailableSkills", () => {
    it("should return all registered skills", () => {
      registry.register(mockSkill)
      registry.register(generalSkill)
      const skills = registry.getAvailableSkills()
      expect(skills).toHaveLength(2)
      expect(skills.map((s: Skill) => s.name)).toContain("test-skill")
      expect(skills.map((s: Skill) => s.name)).toContain("general")
    })

    it("should return empty array when no skills registered", () => {
      expect(registry.getAvailableSkills()).toEqual([])
    })
  })

  describe("getSkill", () => {
    it("should return skill by name", () => {
      registry.register(mockSkill)
      expect(registry.getSkill("test-skill")).toBe(mockSkill)
    })

    it("should return undefined for unregistered skill", () => {
      expect(registry.getSkill("nonexistent")).toBeUndefined()
    })
  })

  describe("getSkillForIntent", () => {
    beforeEach(() => {
      registry.register(characterSkill, [
        "角色",
        "character",
        "创建角色",
        "创建人物",
        "像素角色",
        "sprite",
        "精灵",
      ])
      registry.register(generalSkill)
    })

    it("should match Chinese keyword '角色'", () => {
      const skill = registry.getSkillForIntent("帮我创建一个角色")
      expect(skill).toBe(characterSkill)
    })

    it("should match English keyword 'character'", () => {
      const skill = registry.getSkillForIntent("create a character")
      expect(skill).toBe(characterSkill)
    })

    it("should match keyword 'sprite'", () => {
      const skill = registry.getSkillForIntent("make a sprite for my game")
      expect(skill).toBe(characterSkill)
    })

    it("should match keyword '精灵'", () => {
      const skill = registry.getSkillForIntent("生成一个精灵")
      expect(skill).toBe(characterSkill)
    })

    it("should return null when no keywords match", () => {
      const skill = registry.getSkillForIntent("hello world")
      expect(skill).toBeNull()
    })

    it("should be case-insensitive", () => {
      const skill = registry.getSkillForIntent("Create a CHARACTER")
      expect(skill).toBe(characterSkill)
    })
  })

  describe("setActiveSkill / getActiveSkill", () => {
    it("should set and get active skill", () => {
      registry.register(mockSkill)
      registry.setActiveSkill("test-skill")
      expect(registry.getActiveSkill()).toBe(mockSkill)
    })

    it("should return null when no active skill", () => {
      expect(registry.getActiveSkill()).toBeNull()
    })

    it("should clear active skill when set to null", () => {
      registry.register(mockSkill)
      registry.setActiveSkill("test-skill")
      registry.setActiveSkill(null)
      expect(registry.getActiveSkill()).toBeNull()
    })

    it("should throw when setting unregistered skill", () => {
      expect(() => registry.setActiveSkill("nonexistent")).toThrow(
        'Skill "nonexistent" is not registered'
      )
    })
  })

  describe("integration", () => {
    it("should support full workflow: register → select → activate", () => {
      registry.register(characterSkill, ["角色", "character"])
      registry.register(generalSkill)
      registry.setActiveSkill("general")

      const intentSkill = registry.getSkillForIntent("创建一个角色")
      expect(intentSkill).toBe(characterSkill)

      expect(registry.getActiveSkill()).toBe(generalSkill)
      expect(registry.getAvailableSkills()).toHaveLength(2)
    })
  })

  describe("sprite-generation prompt contract", () => {
    it("requires process_sprite QC review before finalizing sprite assets", () => {
      const prompt = spriteGenerationSkill.systemPrompt

      expect(prompt).toContain("After every generate_sprite_sheet call, run process_sprite")
      expect(prompt).toContain("Inspect the returned qc object")
      expect(prompt).toContain("Blocking QC warnings for body assets: missing frames, any edge-touch frames, or inconsistent frame sizing where dimensions differ by more than ~15%")
      expect(prompt).toContain("retry/regenerate")
      expect(prompt).toContain("Avoid mixed-action raw atlases for controllable character/body assets")
      expect(prompt).toContain("60–70% of each cell, centered")
      expect(prompt).toContain("Never use single-row strips")
      expect(prompt).toContain("positional drift")
    })
  })
})
