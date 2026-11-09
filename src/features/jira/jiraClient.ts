import { JiraError } from './jiraContracts'
import type { JiraAttachment, JiraOAuthClient, JiraService, JiraTicket } from './jiraContracts'
const invalid = (): never => { throw new JiraError('INVALID_RESPONSE') }
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid()
const text = (value: unknown): string => typeof value === 'string' ? value : invalid()
const nonempty = (value: unknown): string => text(value).trim() ? text(value) : invalid()
const nullableText = (value: unknown): string | null => value == null ? null : nonempty(value)
function errorCode(value: unknown): 'UNCONFIGURED' | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const error = (value as Record<string, unknown>).error
  if (error === null || typeof error !== 'object' || Array.isArray(error)) return null
  return (error as Record<string, unknown>).code === 'UNCONFIGURED' ? 'UNCONFIGURED' : null
}
function ticket(value: unknown): JiraTicket {
  const row = object(value), status = object(row.status)
  const assignee = row.assignee == null ? null : object(row.assignee)
  let url: URL
  try { url = new URL(nonempty(row.url)) } catch { return invalid() }
  if (url.protocol !== 'https:' || url.username || url.password) return invalid()
  const comments = row.comments === undefined ? undefined : Array.isArray(row.comments) ? row.comments.slice(0, 3).map((value) => {
    const comment = object(value)
    return { id: nonempty(comment.id), author: nonempty(comment.author), created: nonempty(comment.created), body: text(comment.body) }
  }) : invalid()
  const person = (value: unknown): JiraTicket['reporter'] => {
    if (value === undefined) return undefined
    if (value === null) return null
    const personRow = object(value)
    return { accountId: text(personRow.accountId), displayName: text(personRow.displayName) }
  }
  const attachments: JiraAttachment[] | undefined = row.attachments === undefined ? undefined : Array.isArray(row.attachments) ? row.attachments.slice(0, 30).map((value) => {
    const attachment = object(value)
    if (typeof attachment.size !== 'number' || !Number.isFinite(attachment.size) || attachment.size < 0) return invalid()
    return { id: nonempty(attachment.id), filename: nonempty(attachment.filename), mimeType: text(attachment.mimeType), size: attachment.size }
  }) : invalid()
  return { id: nonempty(row.id), key: nonempty(row.key), summary: text(row.summary),
    status: { name: nonempty(status.name), category: nonempty(status.category) }, priority: text(row.priority), issueType: text(row.issueType),
    assignee: assignee ? { accountId: nonempty(assignee.accountId), displayName: text(assignee.displayName) } : null,
    reporter: person(row.reporter), created: row.created === undefined ? undefined : text(row.created),
    updated: text(row.updated), url: url.href, description: row.description == null ? null : text(row.description), ...(comments ? { comments } : {}), ...(attachments ? { attachments } : {}) }
}
export function createJiraClient(fetcher: typeof fetch = (...args) => fetch(...args)): JiraService {
  let retryAt = 0
  async function request(path: string, signal?: AbortSignal, post = false): Promise<unknown> {
    if (retryAt > Date.now()) throw new JiraError('RATE_LIMITED', retryAt)
    let response: Response
    try { response = await fetcher(path, { method: post ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' }, signal }) }
    catch (error) { if (signal?.aborted) throw error; throw new JiraError('OFFLINE') }
    if (response.status === 429) {
      const raw = response.headers.get('Retry-After') ?? ''
      retryAt = /^\d+$/.test(raw) ? Date.now() + Number(raw) * 1000 : Math.max(Date.now() + 1000, Date.parse(raw) || 0)
      throw new JiraError('RATE_LIMITED', retryAt)
    }
    const codes = { 400: 'INVALID_REQUEST', 401: 'AUTH_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 503: 'UNAVAILABLE' } as const
    if (!response.ok) {
      if (response.status === 503) {
        try {
          if (errorCode(await response.clone().json()) === 'UNCONFIGURED') throw new JiraError('UNCONFIGURED')
        } catch (error) {
          if (error instanceof JiraError) throw error
        }
      }
      throw new JiraError(codes[response.status as keyof typeof codes] ?? 'UNAVAILABLE')
    }
    if (!/^application\/([\w.-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) return invalid()
    try { return await response.json() as unknown } catch { return invalid() }
  }
  return {
    async status(signal) {
      const row = object(await request('/api/jira/status', signal))
      if (typeof row.configured !== 'boolean' || typeof row.authenticated !== 'boolean') return invalid()
      const missingSettings = row.missingSettings === undefined ? undefined :
        Array.isArray(row.missingSettings) && row.missingSettings.every((value) => typeof value === 'string')
          ? row.missingSettings as string[] : invalid()
      const clients = row.clients === undefined ? undefined : Array.isArray(row.clients) ? row.clients.map((item) => {
        const client = object(item)
        const clientId = client.clientId === undefined ? undefined : nonempty(client.clientId)
        return { key: nonempty(client.key), label: nonempty(client.label), ...(clientId ? { clientId } : {}) } satisfies JiraOAuthClient
      }) : invalid()
      return { configured: row.configured, authenticated: row.authenticated, ...(missingSettings ? { missingSettings } : {}), ...(clients ? { clients } : {}) }
    },
    async profile(signal) {
      const row = object(await request('/auth/me', signal)); if (row.authenticated !== true) throw new JiraError('AUTH_REQUIRED')
      const user = object(row.user)
      return { id: nonempty(user.id), name: nonempty(user.name), selectedCloudId: nullableText(user.selectedCloudId) }
    },
    async logout(signal) { const row = object(await request('/auth/logout', signal, true)); if (row.success !== true) return invalid() },
    async tickets(cloudId, filter, token, signal) {
      const query = new URLSearchParams({ cloudId, filter, limit: '20' }); if (token) query.set('nextPageToken', token)
      const row = object(await request(`/api/jira/tickets?${query}`, signal)), pagination = object(row.pagination)
      if (!Array.isArray(row.tickets) || typeof pagination.isLast !== 'boolean') return invalid()
      return { tickets: row.tickets.map(ticket), pagination: { isLast: pagination.isLast, nextPageToken: nullableText(pagination.nextPageToken) } }
    },
    async projectTickets(cloudId, projectKey, signal) {
      const query = new URLSearchParams({ cloudId, limit: '100' })
      const row = object(await request(`/api/jira/projects/${encodeURIComponent(projectKey)}/tickets?${query}`, signal))
      if (!Array.isArray(row.tickets)) return invalid()
      return row.tickets.map(ticket)
    },
    async detail(cloudId, key, signal) { return ticket(await request(`/api/jira/tickets/${encodeURIComponent(key)}?${new URLSearchParams({ cloudId })}`, signal)) },
  }
}
