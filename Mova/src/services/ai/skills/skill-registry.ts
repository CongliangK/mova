import type { Skill } from "../../../types/ai"
import { characterCreationSkill } from "./character-creation-skill"
import { generalSkill } from "./general-skill"
import { mapGenerationSkill } from "./map-generation-skill"
import { spriteGenerationSkill } from "./sprite-generation-skill"

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map()
  private intentKeywords: Map<string, string> = new Map() // keyword → skillName
  private activeSkillName: string | null = null

  register(skill: Skill, keywords?: string[]): void {
    this.skills.set(skill.name, skill)
    if (keywords) {
      for (const keyword of keywords) {
        this.intentKeywords.set(keyword.toLowerCase(), skill.name)
      }
    }
  }

  unregister(skillName: string): void {
    this.skills.delete(skillName)
    // Remove associated keywords
    for (const [keyword, name] of this.intentKeywords.entries()) {
      if (name === skillName) {
        this.intentKeywords.delete(keyword)
      }
    }
    if (this.activeSkillName === skillName) {
      this.activeSkillName = null
    }
  }

  getAvailableSkills(): Skill[] {
    return Array.from(this.skills.values())
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  getSkillForIntent(userMessage: string): Skill | null {
    const lowerMessage = userMessage.toLowerCase()
    for (const [keyword, skillName] of this.intentKeywords.entries()) {
      if (lowerMessage.includes(keyword)) {
        const skill = this.skills.get(skillName)
        if (skill) return skill
      }
    }
    return null
  }

  setActiveSkill(name: string | null): void {
    if (name === null) {
      this.activeSkillName = null
      return
    }
    if (!this.skills.has(name)) {
      throw new Error(`Skill "${name}" is not registered`)
    }
    this.activeSkillName = name
  }

  getActiveSkill(): Skill | null {
    if (!this.activeSkillName) return null
    return this.skills.get(this.activeSkillName) ?? null
  }
}

export const skillRegistry = new SkillRegistry()

skillRegistry.register(characterCreationSkill, [
  "角色",
  "character",
  "创建角色",
  "创建人物",
  "像素角色",
])
skillRegistry.register(generalSkill, [
  "list",
  "show",
  "project info",
  "what characters",
  "help",
  "what can you do",
])
skillRegistry.register(spriteGenerationSkill, [
  "sprite",
  "精灵",
  "pixel art",
  "character sheet",
  "animation frame",
  "2d sprite",
  "精灵图",
])
skillRegistry.register(mapGenerationSkill, [
  "map",
  "地图",
  "tilemap",
  "level design",
  "scene",
  "平台",
  "side-scroll",
  "RPG map",
  "dungeon",
])
