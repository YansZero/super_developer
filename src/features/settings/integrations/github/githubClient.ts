import { localAgentFetch } from '../../../../shared/i18n/localAgentFetch'
import type {
  GitHubIntegrationSnapshot,
  GitHubPollOutcome,
  GitHubProjectRepoMapping,
  GitHubRepoMappingPayload,
} from '../../../../shared/types/domain'

export const FIXED_GITHUB_VERIFICATION_URI = 'https://github.com/login/device' as const
export const FIXED_GITHUB_OAUTH_SCOPE = 'repo' as const

export interface GitHubPollResponse {
  pollOutcome: GitHubPollOutcome
  intervalSeconds?: number
  retryAfterSeconds?: number
  github: GitHubIntegrationSnapshot
}

export interface GitHubServiceContract {
  getGitHubStatus(): Promise<GitHubIntegrationSnapshot>
  saveGitHubClientId(clientId: string): Promise<GitHubIntegrationSnapshot>
  startDeviceFlow(clientId?: string): Promise<GitHubIntegrationSnapshot>
  authorizeDeviceFlowPolling(
    sessionId: string,
  ): Promise<{
    verificationUri: 'https://github.com/login/device'
    github: GitHubIntegrationSnapshot
  }>
  pollDeviceFlow(sessionId: string): Promise<GitHubPollResponse>
  cancelDeviceFlow(sessionId?: string): Promise<GitHubIntegrationSnapshot>
  refreshPublicRepositories(): Promise<GitHubIntegrationSnapshot>
  upsertProjectRepoMapping(
    payload: GitHubRepoMappingPayload,
  ): Promise<{
    mapping: GitHubProjectRepoMapping
    github: GitHubIntegrationSnapshot
  }>
  removeProjectRepoMapping(
    projectId: string,
  ): Promise<{
    removedProjectId: string
    github: GitHubIntegrationSnapshot
  }>
  disconnectGitHub(): Promise<GitHubIntegrationSnapshot>
}

export class GitHubApiError extends Error {
  readonly errorCode: string
  readonly status: number

  constructor(message: string, errorCode = 'AGENT_REQUEST_FAILED', status = 500) {
    super(message)
    this.name = 'GitHubApiError'
    this.errorCode = errorCode
    this.status = status
  }
}

export function createInitialDisconnectedGitHubSnapshot(): GitHubIntegrationSnapshot {
  return {
    clientId: null,
    requiredScope: FIXED_GITHUB_OAUTH_SCOPE,
    verificationUri: FIXED_GITHUB_VERIFICATION_URI,
    keyringAvailable: false,
    keyringErrorCode: null,
    keyringMessage: null,
    flowState: 'disconnected',
    pendingSession: null,
    account: null,
    repositories: [],
    mappings: [],
  }
}

async function requestGitHubJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await localAgentFetch()(url, {
      ...init,
      headers: {
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new GitHubApiError(
      '無法連線至本機 GitHub OAuth 服務（127.0.0.1），請確認開發伺服器或 npm run agent 已啟動。',
      'AGENT_OFFLINE',
      0,
    )
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    throw new GitHubApiError(
      '本機 GitHub OAuth 服務未回傳有效 JSON（Local Agent 可能尚未啟動）。',
      'AGENT_OFFLINE',
      response.status,
    )
  }

  if (!response.ok || data.ok !== true) {
    const message =
      typeof data.message === 'string' && data.message.trim()
        ? data.message
        : `請求失敗（HTTP ${response.status}）`
    const errorCode =
      typeof data.errorCode === 'string' && data.errorCode.trim()
        ? data.errorCode
        : 'AGENT_REQUEST_FAILED'
    throw new GitHubApiError(message, errorCode, response.status)
  }

  return data as unknown as T
}

export function createHttpGitHubServiceClient(
  baseUrl = '/api/local-agent',
): GitHubServiceContract {
  return {
    async getGitHubStatus() {
      const res = await requestGitHubJson<{
        ok: true
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github`, { method: 'GET' })
      return res.github
    },

    async saveGitHubClientId(clientId) {
      const res = await requestGitHubJson<{
        ok: true
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/config`, {
        method: 'PUT',
        body: JSON.stringify({ clientId }),
      })
      return res.github
    },

    async startDeviceFlow(clientId) {
      const bodyPayload = clientId ? { clientId, scope: FIXED_GITHUB_OAUTH_SCOPE } : {}
      const res = await requestGitHubJson<{
        ok: true
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/device-flow/start`, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      })
      return res.github
    },

    async authorizeDeviceFlowPolling(sessionId) {
      const res = await requestGitHubJson<{
        ok: true
        verificationUri: 'https://github.com/login/device'
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/device-flow/authorize`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      })
      return {
        verificationUri: FIXED_GITHUB_VERIFICATION_URI,
        github: res.github,
      }
    },

    async pollDeviceFlow(sessionId) {
      const res = await requestGitHubJson<{
        ok: true
        pollOutcome: GitHubPollOutcome
        intervalSeconds?: number
        retryAfterSeconds?: number
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/device-flow/poll`, {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      })
      return {
        pollOutcome: res.pollOutcome,
        intervalSeconds: res.intervalSeconds,
        retryAfterSeconds: res.retryAfterSeconds,
        github: res.github,
      }
    },

    async cancelDeviceFlow(sessionId) {
      const res = await requestGitHubJson<{
        ok: true
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/device-flow/cancel`, {
        method: 'POST',
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      })
      return res.github
    },

    async refreshPublicRepositories() {
      const res = await requestGitHubJson<{
        ok: true
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/repos/refresh`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return res.github
    },

    async upsertProjectRepoMapping(payload) {
      const res = await requestGitHubJson<{
        ok: true
        mapping: GitHubProjectRepoMapping
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/mappings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return {
        mapping: res.mapping,
        github: res.github,
      }
    },

    async removeProjectRepoMapping(projectId) {
      const res = await requestGitHubJson<{
        ok: true
        removedProjectId: string
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/mappings/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      })
      return {
        removedProjectId: res.removedProjectId,
        github: res.github,
      }
    },

    async disconnectGitHub() {
      const res = await requestGitHubJson<{
        ok: true
        github: GitHubIntegrationSnapshot
      }>(`${baseUrl}/github/disconnect`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return res.github
    },
  }
}
