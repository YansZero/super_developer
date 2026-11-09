import type { Locale } from '../../../shared/i18n'

export function defaultJiraPromptTemplate(locale: Locale) {
  return `dispathTask_${locale === 'zh-TW' ? 'zhTW' : locale}.md`
}

export function fillJiraPromptTemplate(template: string, ticketContent: string) {
  return ticketContent ? template.replaceAll('[%ticket content%]', () => ticketContent) : template
}
