import en from '../src/shared/i18n/locales/en.json' with { type: 'json' }
import es from '../src/shared/i18n/locales/es.json' with { type: 'json' }
import zhTW from '../src/shared/i18n/locales/zh-TW.json' with { type: 'json' }

const messages = { en, es, 'zh-TW': zhTW }

export function createNodeI18n(language, fallback = 'en') {
  const code = typeof language === 'string' ? language.trim().split(/[-_.@,;\s]/, 1)[0].toLowerCase() : ''
  const locale = code === 'zh' ? 'zh-TW' : code === 'es' || code === 'en' ? code : fallback
  return {
    locale,
    t(key, values = {}) {
      return (messages[locale][key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (match, name) =>
        Object.hasOwn(values, name) ? String(values[name]) : match)
    },
  }
}
