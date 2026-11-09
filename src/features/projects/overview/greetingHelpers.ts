export type GreetingPeriod = 'morning' | 'noon' | 'afternoon' | 'evening'

export interface GreetingConfig {
  period: GreetingPeriod
  icon: string
  titleKey: string
  messageKey: string
}

export function getGreetingPeriod(hour: number): GreetingPeriod {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 14) return 'noon'
  if (hour >= 14 && hour < 19) return 'afternoon'
  return 'evening'
}

export function getGreetingConfig(period: GreetingPeriod): GreetingConfig {
  switch (period) {
    case 'morning':
      return {
        period: 'morning',
        icon: '☀️',
        titleKey: 'overview.greeting.morningTitle',
        messageKey: 'overview.greeting.morningMessage',
      }
    case 'noon':
      return {
        period: 'noon',
        icon: '🌤️',
        titleKey: 'overview.greeting.noonTitle',
        messageKey: 'overview.greeting.noonMessage',
      }
    case 'afternoon':
      return {
        period: 'afternoon',
        icon: '☕',
        titleKey: 'overview.greeting.afternoonTitle',
        messageKey: 'overview.greeting.afternoonMessage',
      }
    case 'evening':
    default:
      return {
        period: 'evening',
        icon: '🌙',
        titleKey: 'overview.greeting.eveningTitle',
        messageKey: 'overview.greeting.eveningMessage',
      }
  }
}

export function formatSystemTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`
}
