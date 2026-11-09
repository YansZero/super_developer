export function formatJiraDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value || '—'
    : new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
