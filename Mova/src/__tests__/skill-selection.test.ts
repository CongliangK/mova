import { describe, it, expect, beforeEach } from "vitest"
import { skillRegistry } from "../../src/services/ai/skills/skill-registry"

describe("Skill Selection", () => {
  beforeEach(() => {
    // Reset active skill before each test
    skillRegistry.setActiveSkill(null)
  })

  describe("setActiveSkill / getActiveSkill", () => {
    it("should set sprite-generation as active skill and verify via getActiveSkill", () => {
      skillRegistry.setActiveSkill("sprite-generation")
      const activeSkill = skillRegistry.getActiveSkill()
      expect(activeSkill?.name).toBe("sprite-generation")
    })

    it("should switch to map-generation and verify the switch takes effect", () => {
      skillRegistry.setActiveSkill("sprite-generation")
      skillRegistry.setActiveSkill("map-generation")
      const activeSkill = skillRegistry.getActiveSkill()
      expect(activeSkill?.name).toBe("map-generation")
    })

    it("should return null for active skill when none is set", () => {
      skillRegistry.setActiveSkill(null)
      expect(skillRegistry.getActiveSkill()).toBeNull()
    })
  })

  describe("getSkillForIntent - sprite generation", () => {
    it('should detect "创建精灵图" intent and return sprite-generation skill', () => {
      const skill = skillRegistry.getSkillForIntent("创建精灵图")
      expect(skill?.name).toBe("sprite-generation")
    })

    it('should detect "精灵" keyword and return sprite-generation skill', () => {
      const skill = skillRegistry.getSkillForIntent("生成一个精灵")
      expect(skill?.name).toBe("sprite-generation")
    })

    it('should detect "sprite" keyword and return sprite-generation skill', () => {
      const skill = skillRegistry.getSkillForIntent("create a sprite for my game")
      expect(skill?.name).toBe("sprite-generation")
    })
  })

  describe("getSkillForIntent - map generation", () => {
    it('should detect "创建地图" intent and return map-generation skill', () => {
      const skill = skillRegistry.getSkillForIntent("创建地图")
      expect(skill?.name).toBe("map-generation")
    })

    it('should detect "map" keyword and return map-generation skill', () => {
      const skill = skillRegistry.getSkillForIntent("design a map for my level")
      expect(skill?.name).toBe("map-generation")
    })

    it('should detect "地图" Chinese keyword and return map-generation skill', () => {
      const skill = skillRegistry.getSkillForIntent("帮我画一个地图")
      expect(skill?.name).toBe("map-generation")
    })
  })

  describe("getSkillForIntent - no match", () => {
    it('should return null for "hello world" with no matching keywords', () => {
      const skill = skillRegistry.getSkillForIntent("hello world")
      expect(skill).toBeNull()
    })

    it('should return null for random text with no registered keywords', () => {
      const skill = skillRegistry.getSkillForIntent("啦啦啦这里是一些随机的文字")
      expect(skill).toBeNull()
    })
  })

  describe("skill switching workflow", () => {
    it("should allow switching from sprite to map skill", () => {
      // Set sprite as active
      skillRegistry.setActiveSkill("sprite-generation")
      expect(skillRegistry.getActiveSkill()?.name).toBe("sprite-generation")

      // Switch to map
      skillRegistry.setActiveSkill("map-generation")
      expect(skillRegistry.getActiveSkill()?.name).toBe("map-generation")
    })

    it("should auto-detect intent when no active skill is set", () => {
      skillRegistry.setActiveSkill(null)

      // Intent detection should still work
      const spriteSkill = skillRegistry.getSkillForIntent("创建精灵图")
      expect(spriteSkill?.name).toBe("sprite-generation")

      const mapSkill = skillRegistry.getSkillForIntent("创建地图")
      expect(mapSkill?.name).toBe("map-generation")
    })
  })
})