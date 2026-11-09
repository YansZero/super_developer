import { JiraSiteError } from './jiraSiteContracts'
import type { JiraSite, JiraSiteServiceContract } from './jiraSiteContracts'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const invalid = (): never => { throw new JiraSiteError('INVALID_RESPONSE') }
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : invalid()
const text = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : invalid()
const cloudId = (value: unknown): string => {
  const id = text(value)
  return uuid.test(id) ? id.toLowerCase() : invalid()
}
function isUnconfigured(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const error = (value as Record<string, unknown>).error
  return error !== null && typeof error === 'object' && !Array.isArray(error)
    && (error as Record<string, unknown>).code === 'UNCONFIGURED'
}

function site(value: unknown): JiraSite {
  const data = record(value)
  const rawUrl = text(data.url)
  let url: URL
  try { url = new URL(rawUrl) } catch { return invalid() }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password
    || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return invalid()
  return { cloudId: cloudId(data.cloudId), name: text(data.name), url: url.href }
}

export function createJiraSiteClient(fetcher: typeof fetch = (...args) => fetch(...args)): JiraSiteServiceContract {
  let observedUser: string | null = null
  let retryAt = 0

  async function request(path: string, signal?: AbortSignal, body?: { cloudId: string }): Promise<unknown> {
    if (Date.now() < retryAt) throw new JiraSiteError('RATE_LIMITED', retryAt)
    let response: Response
    try {
      response = await fetcher(path, {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
        redirect: 'error', signal,
        headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new JiraSiteError('OFFLINE')
    }
    if (response.status === 401) { observedUser = null; throw new JiraSiteError('AUTH_REQUIRED') }
    if (response.status === 403) throw new JiraSiteError('FORBIDDEN')
    if (response.status === 429) {
      const value = response.headers.get('Retry-After')
      const seconds = value !== null && /^\d+$/.test(value.trim()) ? Number(value) : NaN
      const parsed = value ? Date.parse(value) : NaN
      retryAt = Number.isFinite(seconds) ? Date.now() + seconds * 1000
        : Number.isFinite(parsed) ? Math.max(Date.now(), parsed) : Date.now() + 1000
      throw new JiraSiteError('RATE_LIMITED', retryAt)
    }
    if (response.status === 404 || response.status === 501) throw new JiraSiteError('UNCONFIGURED')
    if (!response.ok) {
      if (response.status === 503) {
        try { if (isUnconfigured(await response.clone().json())) throw new JiraSiteError('UNCONFIGURED') }
        catch (error) { if (error instanceof JiraSiteError) throw error }
      }
      throw new JiraSiteError('UNAVAILABLE')
    }
    if (!/^application\/([\w.-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) return invalid()
    try { return await response.json() as unknown } catch { return invalid() }
  }

  async function profile(signal?: AbortSignal) {
    const data = record(await request('/auth/me', signal))
    if (data.authenticated === false) { observedUser = null; throw new JiraSiteError('AUTH_REQUIRED') }
    if (data.authenticated !== true) return invalid()
    const user = record(data.user)
    return { userKey: text(user.id), selectedCloudId: user.selectedCloudId == null ? null : cloudId(user.selectedCloudId) }
  }

  return {
    async getSnapshot(signal) {
      const before = await profile(signal)
      const data = record(await request('/api/jira/sites', signal))
      if (!Array.isArray(data.sites)) return invalid()
      const sites = data.sites.map(site)
      if (new Set(sites.map((entry) => entry.cloudId)).size !== sites.length) return invalid()
      const after = await profile(signal)
      observedUser = after.userKey
      if (before.userKey !== after.userKey) throw new JiraSiteError('IDENTITY_CHANGED')
      return { ...after, sites }
    },
    async selectSite(value, signal) {
      const id = cloudId(value)
      const current = await profile(signal)
      if (observedUser === null || observedUser !== current.userKey) {
        observedUser = current.userKey
        throw new JiraSiteError('IDENTITY_CHANGED')
      }
      const data = record(await request('/api/jira/sites/select', signal, { cloudId: id }))
      if (data.success !== true || cloudId(data.selectedCloudId) !== id) return invalid()
    },
  }
}
