export interface JiraClientConfigSummary { key: string; label: string; clientId: string }
export interface JiraClientConfigInput { label: string; clientId: string; clientSecret: string }
export class JiraClientConfigError extends Error {
  constructor(public readonly status: number, message = 'Jira Client 設定失敗') { super(message); this.name = 'JiraClientConfigError' }
}
function jsonObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new JiraClientConfigError(500)
  return value as Record<string, unknown>
}
function summaries(value: unknown): JiraClientConfigSummary[] {
  const row = jsonObject(value)
  if (!Array.isArray(row.clients)) throw new JiraClientConfigError(500)
  return row.clients.map((item) => {
    const client = jsonObject(item)
    if (typeof client.key !== 'string' || typeof client.label !== 'string' || typeof client.clientId !== 'string' || !client.key || !client.label || !client.clientId) throw new JiraClientConfigError(500)
    return { key: client.key, label: client.label, clientId: client.clientId }
  })
}
function summary(value: unknown): JiraClientConfigSummary {
  const row = jsonObject(value)
  const client = jsonObject(row.client)
  if (typeof client.key !== 'string' || typeof client.label !== 'string' || typeof client.clientId !== 'string' || !client.key || !client.label || !client.clientId) throw new JiraClientConfigError(500)
  return { key: client.key, label: client.label, clientId: client.clientId }
}
export function createJiraClientConfigClient(fetcher: typeof fetch = (...args) => fetch(...args)) {
  async function request(path: string, init?: RequestInit) {
    let response: Response
    try { response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { Accept: 'application/json', ...(init?.headers ?? {}) } }) }
    catch { throw new JiraClientConfigError(0, '無法連線至 Jira 設定服務') }
    if (!response.ok) throw new JiraClientConfigError(response.status)
    try { return await response.json() as unknown } catch { throw new JiraClientConfigError(500) }
  }
  return {
    async list() { return summaries(await request('/auth/jira/clients')) },
    async create(input: JiraClientConfigInput) { return summary(await request('/api/jira/client-configs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) },
    async update(key: string, input: JiraClientConfigInput) { return summary(await request(`/api/jira/client-configs/${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })) },
    async remove(key: string) { await request(`/api/jira/client-configs/${encodeURIComponent(key)}`, { method: 'DELETE' }) },
  }
}
export type JiraClientConfigClient = ReturnType<typeof createJiraClientConfigClient>
