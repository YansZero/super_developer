import { localAgentFetch } from '../../shared/i18n/localAgentFetch'
import type {
  ExternalMcpServerEntry,
  McpCheckReport,
  McpServerDocument,
  ProviderId,
  TargetDescriptor,
} from '../../shared/types/domain'
import type { DispatchJob } from '../projects/detail/dispatchClient'

export interface McpListResponse {
  ok: boolean
  libraryPath: string
  servers: McpServerDocument[]
  externalServers: ExternalMcpServerEntry[]
  targets: TargetDescriptor[]
  message?: string
}

export interface McpUpsertPayload {
  name?: string
  newName?: string
  description: string
  transport: 'stdio' | 'http'
  command?: string | null
  args?: string[]
  url?: string | null
  env?: Record<string, string>
  headers?: Record<string, string>
  secretEnv?: Record<string, string>
  secretHeaders?: Record<string, string>
}

export interface McpCheckResponse {
  ok: boolean
  report: McpCheckReport
  server: McpServerDocument
  job: DispatchJob | null
  message?: string
}

export interface McpServiceContract {
  listMcpServers(): Promise<{
    libraryPath: string
    servers: McpServerDocument[]
    externalServers: ExternalMcpServerEntry[]
    targets: TargetDescriptor[]
  }>
  getMcpServer(name: string): Promise<McpServerDocument>
  createMcpServer(payload: McpUpsertPayload): Promise<McpServerDocument>
  updateMcpServer(name: string, payload: McpUpsertPayload): Promise<McpServerDocument>
  deleteMcpServer(name: string): Promise<string>
  installToTarget(name: string, targetId: string): Promise<McpServerDocument>
  uninstallFromTarget(name: string, targetId: string): Promise<McpServerDocument>
  checkAndAutoInstall(
    name: string,
    options: { providerId?: ProviderId; modelId?: string; effort?: string; autoInstall?: boolean },
  ): Promise<McpCheckResponse>
  pollCheckJob(name: string, jobId: string): Promise<McpCheckResponse>
}

async function parseJsonOrThrow<T extends { ok?: boolean; message?: string }>(res: Response): Promise<T> {
  const data = (await res.json()) as T
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Request failed (${res.status})`)
  }
  return data
}

export function createMcpClient(fetcher: typeof fetch = fetch): McpServiceContract {
  return {
    async listMcpServers() {
      const res = await localAgentFetch(fetcher)('/api/mcp')
      const data = await parseJsonOrThrow<McpListResponse>(res)
      return {
        libraryPath: data.libraryPath,
        servers: data.servers,
        externalServers: data.externalServers,
        targets: data.targets,
      }
    },
    async getMcpServer(name: string) {
      const res = await localAgentFetch(fetcher)(`/api/mcp/${encodeURIComponent(name)}`)
      const data = await parseJsonOrThrow<{ ok: boolean; server: McpServerDocument; message?: string }>(res)
      return data.server
    },
    async createMcpServer(payload: McpUpsertPayload) {
      const res = await localAgentFetch(fetcher)('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonOrThrow<{ ok: boolean; server: McpServerDocument; message?: string }>(res)
      return data.server
    },
    async updateMcpServer(name: string, payload: McpUpsertPayload) {
      const res = await localAgentFetch(fetcher)(`/api/mcp/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonOrThrow<{ ok: boolean; server: McpServerDocument; message?: string }>(res)
      return data.server
    },
    async deleteMcpServer(name: string) {
      const res = await localAgentFetch(fetcher)(`/api/mcp/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      const data = await parseJsonOrThrow<{ ok: boolean; deletedName: string; message?: string }>(res)
      return data.deletedName
    },
    async installToTarget(name: string, targetId: string) {
      const res = await localAgentFetch(fetcher)(
        `/api/mcp/${encodeURIComponent(name)}/targets/${encodeURIComponent(targetId)}`,
        { method: 'POST' },
      )
      const data = await parseJsonOrThrow<{ ok: boolean; server: McpServerDocument; message?: string }>(res)
      return data.server
    },
    async uninstallFromTarget(name: string, targetId: string) {
      const res = await localAgentFetch(fetcher)(
        `/api/mcp/${encodeURIComponent(name)}/targets/${encodeURIComponent(targetId)}`,
        { method: 'DELETE' },
      )
      const data = await parseJsonOrThrow<{ ok: boolean; server: McpServerDocument; message?: string }>(res)
      return data.server
    },
    async checkAndAutoInstall(name, options) {
      const res = await localAgentFetch(fetcher)(`/api/mcp/${encodeURIComponent(name)}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      })
      return parseJsonOrThrow<McpCheckResponse>(res)
    },
    async pollCheckJob(name: string, jobId: string) {
      const res = await localAgentFetch(fetcher)(
        `/api/mcp/${encodeURIComponent(name)}/check/${encodeURIComponent(jobId)}`,
      )
      return parseJsonOrThrow<McpCheckResponse>(res)
    },
  }
}
