import { createContext, useContext } from 'react'
import zhTW from './locales/zh-TW.json'
import en from './locales/en.json'
import es from './locales/es.json'

export const LOCALE_STORAGE_KEY = 'super-developer.locale'
export type Locale = 'zh-TW' | 'en' | 'es'
export type TranslationKey = string

export const translations: Record<Locale, Record<string, string>> = { 'zh-TW': zhTW, en, es }

export function getMessage(messages: Record<string, string>, key: string) {
  return messages[key] ?? key
}

export const LANGUAGES = [
  { id: 'zh-TW', label: '中', nameKey: 'language.zh' },
  { id: 'en', label: 'EN', nameKey: 'language.en' },
  { id: 'es', label: 'ES', nameKey: 'language.es' },
] as const satisfies ReadonlyArray<{ id: Locale; label: string; nameKey: TranslationKey }>

export interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string, values?: Record<string, string | number>) => string
}

export function formatMessage(message: string, values?: Record<string, string | number>) {
  if (!values) return message
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), message)
}

const fallbackContext: I18nContextValue = {
  locale: 'zh-TW',
  setLocale: () => undefined,
  t: (key, values) => formatMessage(getMessage(zhTW, key), values),
}

export const I18nContext = createContext<I18nContextValue>(fallbackContext)

function isLocale(value: string | null): value is Locale {
  return value === 'zh-TW' || value === 'en' || value === 'es'
}

export function getStoredLocale(): Locale {
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
  return isLocale(stored) ? stored : 'zh-TW'
}

export function useI18n() {
  return useContext(I18nContext)
}
