import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { formatMessage, getMessage, getStoredLocale, I18nContext, LANGUAGES, LOCALE_STORAGE_KEY, translations, useI18n } from './i18nContext'
import type { I18nContextValue, Locale } from './i18nContext'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => getStoredLocale())
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => {
      setLocale(nextLocale)
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale)
    },
    t: (key, values) => formatMessage(getMessage(translations[locale], key), values),
  }), [locale])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const currentLanguage = LANGUAGES.find((language) => language.id === locale) ?? LANGUAGES[0]
  return (
    <div className={`sd-language-switcher${isOpen ? ' is-open' : ''}`} role="group" aria-label={t('language.label')}>
      <button
        type="button"
        className="sd-language-switcher__toggle"
        aria-label={t('language.label')}
        aria-expanded={isOpen}
        aria-controls="sd-language-options"
        onClick={() => setIsOpen((value) => !value)}
        title={t(currentLanguage.nameKey)}
      >
        <span className="sd-language-switcher__chevron" aria-hidden="true">{isOpen ? '»' : '«'}</span>
        <span className="sd-language-switcher__toggle-copy">
          <span className="sd-language-switcher__label">{t('language.label')}</span>
          <span className="sd-language-switcher__separator" aria-hidden="true">│</span>
          <span className="sd-language-switcher__current">{currentLanguage.label}</span>
        </span>
      </button>
      {isOpen ? <div id="sd-language-options" className="sd-language-switcher__options">
        {LANGUAGES.map((language) => (
          <button key={language.id} type="button" className={locale === language.id ? 'is-active' : ''} onClick={() => { setLocale(language.id); setIsOpen(false) }} aria-pressed={locale === language.id} aria-label={`${t('language.switchTo')} ${t(language.nameKey)}`} title={t(language.nameKey)}>
            {language.label}
          </button>
        ))}
      </div> : null}
    </div>
  )
}

