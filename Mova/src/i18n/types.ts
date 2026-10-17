export type Locale = "zh-CN" | "en-US"

export type TranslationValue = string | TranslationTree
export interface TranslationTree {
  [key: string]: TranslationValue
}

export type TranslationParams = Record<string, string | number | boolean | null | undefined>

export interface LocaleOption {
  value: Locale
  label: string
  nativeLabel: string
}
