import { localAgentFetch } from '../../shared/i18n/localAgentFetch'
export interface DispatchNotificationSettings {
  inApp: boolean
  desktop: boolean
}

export async function readDispatchNotificationSettings(signal: AbortSignal): Promise<DispatchNotificationSettings | null> {
  const response = await localAgentFetch()('/api/local-agent/notification-settings', { signal })
  if (!response.ok) throw new Error('Unable to read notification settings')
  const { settings } = await response.json()
  if (settings === null) return null
  if (typeof settings?.inApp !== 'boolean' || typeof settings?.desktop !== 'boolean') throw new Error('Invalid notification settings')
  return settings
}

export async function saveDispatchNotificationSettings(settings: DispatchNotificationSettings): Promise<void> {
  const response = await localAgentFetch()('/api/local-agent/notification-settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!response.ok || (await response.json()).ok !== true) throw new Error('Unable to save notification settings')
}
