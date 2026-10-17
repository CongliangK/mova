import { useMemo } from "react"
import { useSettingsStore } from "../stores/settings-store"
import { enUS } from "./dictionaries/en-US"
import { zhCN } from "./dictionaries/zh-CN"
import type { Locale, LocaleOption, TranslationParams, TranslationTree, TranslationValue } from "./types"

export type { Locale, TranslationParams } from "./types"

export const DEFAULT_LOCALE: Locale = "zh-CN"
export const FALLBACK_LOCALE: Locale = "en-US"

export const localeOptions: LocaleOption[] = [
  { value: "zh-CN", label: "简体中文", nativeLabel: "简体中文" },
  { value: "en-US", label: "English", nativeLabel: "English" },
]

const dictionaries: Record<Locale, TranslationTree> = {
  "zh-CN": zhCN,
  "en-US": enUS,
}

function getPathValue(tree: TranslationTree, key: string): TranslationValue | undefined {
  return key.split(".").reduce<TranslationValue | undefined>((current, part) => {
    if (!current || typeof current === "string") return undefined
    return current[part]
  }, tree)
}

function interpolate(template: string, params?: TranslationParams) {
  if (!params) return template
  return template.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => {
    const value = params[name]
    return value === null || value === undefined ? "" : String(value)
  })
}

export function translate(locale: Locale, key: string, params?: TranslationParams): string {
  const value = getPathValue(dictionaries[locale], key) ?? getPathValue(dictionaries[FALLBACK_LOCALE], key)
  if (typeof value !== "string") return key
  return interpolate(value, params)
}

export function useI18n() {
  const locale = useSettingsStore((s) => s.locale)
  const setLocale = useSettingsStore((s) => s.setLocale)

  return useMemo(
    () => ({
      locale,
      setLocale,
      t: (key: string, params?: TranslationParams) => translate(locale, key, params),
    }),
    [locale, setLocale],
  )
}
