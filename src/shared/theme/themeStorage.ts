import type { ThemeId } from '../types/domain'

export const THEME_STORAGE_KEY = 'super_developer.theme'

const VALID_THEMES: readonly ThemeId[] = ['modern', 'esports', '8bit', 'retro']

export function isValidThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && VALID_THEMES.includes(value as ThemeId)
}

export function loadStoredTheme(fallback: ThemeId = 'modern'): ThemeId {
  if (typeof window === 'undefined') {
    return fallback
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isValidThemeId(raw) ? raw : fallback
  } catch {
    return fallback
  }
}

export function applyAndStoreTheme(theme: ThemeId): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Ignore storage quota / private mode errors
    }
  }
}
