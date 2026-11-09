import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
import type {
  CustomProviderCreatePayload,
  ProviderAuthStatus,
  ProviderCliStatus,
  ProviderConfigUpdatePayload,
  ProviderLoginOutcome,
  ProviderSummary,
} from '../../../shared/types/domain'

export interface ProviderServiceContract {
  listProviders(): Promise<ProviderSummary[]>
  updateProviderConfig(
    providerId: string,
    payload: ProviderConfigUpdatePayload,
  ): Promise<{ provider: ProviderSummary; providers: ProviderSummary[] }>
  addCustomProvider(
    payload: CustomProviderCreatePayload,
  ): Promise<{ provider: ProviderSummary; providers: ProviderSummary[] }>
  removeCustomProvider(
    providerId: string,
  ): Promise<{ removedId: string; providers: ProviderSummary[] }>
  probeProvider(
    providerId: string,
  ): Promise<{ provider: ProviderSummary; providers: ProviderSummary[] }>
  probeAllProviders(): Promise<{ providers: ProviderSummary[] }>
  initiateProviderLogin(
    providerId: string,
  ): Promise<{
    login: ProviderLoginOutcome
    provider: ProviderSummary
    providers: ProviderSummary[]
  }>
}

export class ProviderApiError extends Error {
  readonly errorCode: string
  readonly status: number

  constructor(message: string, errorCode = 'AGENT_REQUEST_FAILED', status = 500) {
    super(message)
    this.name = 'ProviderApiError'
    this.errorCode = errorCode
    this.status = status
  }
}

export function markProvidersAgentOffline(providers: ProviderSummary[]): ProviderSummary[] {
  return providers.map((item) => ({
    ...item,
    statusKind: 'unknown',
    statusText: 'provider.status.localAgentOfflineUnknown',
    cliStatus: 'unprobed',
    authStatus: 'unknown',
    isDemo: false,
  }))
}

export function formatCliStatusLabel(cliStatus: ProviderCliStatus): string {
  switch (cliStatus) {
    case 'available':
      return 'common.fileExistsAndIsExecutable'
    case 'missing':
      return 'common.executableNotFound'
    case 'not_executable':
      return 'common.noExecutePermissionXOk'
    case 'invalid_path':
      return 'common.invalidPathSyntax'
    case 'timeout':
      return 'common.probeTimedOutTimeout'
    case 'unexpected_output':
      return 'common.unexpectedOutputFormat'
    case 'error':
      return 'common.nonZeroExitOrExecutionError'
    case 'unprobed':
    default:
      return 'common.notCheckedYet'
  }
}

export function formatAuthStatusLabel(
  authStatus: ProviderAuthStatus,
  supportsAuthProbe: boolean,
): string {
  if ((!supportsAuthProbe || authStatus === 'manual_required') &&
      authStatus !== 'unauthenticated' && authStatus !== 'error' && authStatus !== 'authenticated') {
    return 'common.signInStatusCouldNotBeConfirmedAutomaticallyTheDashboardHasNoQueryAdapter'
  }
  switch (authStatus) {
    case 'authenticated':
      return 'common.signedInVerifiedByTheOfficialCli'
    case 'unauthenticated':
      return 'common.notSignedInRunTheCliSignInFlow'
    case 'error':
      return 'common.signInStatusCheckFailedOrTimedOut'
    case 'unknown':
    default:
      return 'common.unknownNotChecked'
  }
}

export function formatErrorCodeLabel(errorCode: string | null): string | null {
  if (!errorCode) return null
  switch (errorCode) {
    case 'CLI_PATH_EMPTY':
      return 'provider.error.cliPathEmpty'
    case 'CLI_PATH_INVALID':
      return 'provider.error.cliPathInvalid'
    case 'CLI_NOT_FOUND':
      return 'provider.error.cliNotFound'
    case 'CLI_NOT_FILE':
      return 'provider.error.cliNotFile'
    case 'CLI_NOT_EXECUTABLE':
      return 'provider.error.cliNotExecutable'
    case 'PROBE_TIMEOUT':
      return 'provider.error.probeTimeout'
    case 'PROBE_NON_ZERO_EXIT':
      return 'provider.error.probeNonZeroExit'
    case 'PROBE_UNEXPECTED_OUTPUT':
      return 'provider.error.probeUnexpectedOutput'
    case 'PROBE_SPAWN_ERROR':
      return 'provider.error.probeSpawnError'
    case 'AUTH_CHECK_UNSUPPORTED':
      return 'provider.error.authCheckUnsupported'
    case 'AUTH_UNAUTHENTICATED':
      return 'provider.error.authUnauthenticated'
    case 'AUTH_CHECK_FAILED':
      return 'provider.error.authCheckFailed'
    case 'LOGIN_INTERACTIVE_REQUIRED':
      return 'provider.error.loginInteractiveRequired'
    case 'LOGIN_UNSUPPORTED_PROVIDER':
      return 'provider.error.loginUnsupportedProvider'
    default:
      return errorCode
  }
}

export function formatCheckedAtLabel(checkedAt: string | null): string {
  if (!checkedAt) {
    return 'common.notCheckedYet'
  }
  const date = new Date(checkedAt)
  if (Number.isNaN(date.getTime())) {
    return checkedAt
  }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`
}

export function validateClientProviderInput(name: string, cliPath: string): string | null {
  const trimmedName = name.trim()
  const trimmedPath = cliPath.trim()
  if (!trimmedName) {
    return 'provider.validation.nameRequired'
  }
  if (trimmedName.length > 64) {
    return 'provider.validation.nameTooLong'
  }
  if (!trimmedPath) {
    return 'provider.validation.cliPathRequired'
  }
  if (trimmedPath.length > 512) {
    return 'provider.validation.cliPathTooLong'
  }
  if (/[;&|$`><(){}\\"'*?~!#\r\n\0\s]/.test(trimmedPath)) {
    return 'provider.validation.cliPathInvalidCharacters'
  }
  if (!trimmedPath.startsWith('/') && !/^[a-zA-Z0-9._+-]{1,64}$/.test(trimmedPath)) {
    return 'provider.validation.cliPathFormat'
  }
  return null
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await localAgentFetch()(url, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new ProviderApiError(
      '無法連線至本機 Provider 服務（127.0.0.1），請確認開發伺服器或 npm run agent 已啟動。',
      'AGENT_OFFLINE',
      0,
    )
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    throw new ProviderApiError(
      '本機 Provider 服務未回傳有效 JSON（Local Agent 可能尚未啟動）。',
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
    throw new ProviderApiError(message, errorCode, response.status)
  }

  return data as unknown as T
}

export function createHttpProviderServiceClient(
  baseUrl = '/api/local-agent',
): ProviderServiceContract {
  return {
    async listProviders() {
      const res = await requestJson<{ ok: true; providers: ProviderSummary[] }>(
        `${baseUrl}/providers`,
        { method: 'GET' },
      )
      return res.providers
    },

    async updateProviderConfig(providerId, payload) {
      const res = await requestJson<{
        ok: true
        provider: ProviderSummary
        providers: ProviderSummary[]
      }>(`${baseUrl}/providers/${encodeURIComponent(providerId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      return { provider: res.provider, providers: res.providers }
    },

    async addCustomProvider(payload) {
      const res = await requestJson<{
        ok: true
        provider: ProviderSummary
        providers: ProviderSummary[]
      }>(`${baseUrl}/providers`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return { provider: res.provider, providers: res.providers }
    },

    async removeCustomProvider(providerId) {
      const res = await requestJson<{
        ok: true
        removedId: string
        providers: ProviderSummary[]
      }>(`${baseUrl}/providers/${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
      })
      return { removedId: res.removedId, providers: res.providers }
    },

    async probeProvider(providerId) {
      const res = await requestJson<{
        ok: true
        provider: ProviderSummary
        providers: ProviderSummary[]
      }>(`${baseUrl}/providers/${encodeURIComponent(providerId)}/probe`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return { provider: res.provider, providers: res.providers }
    },

    async probeAllProviders() {
      const res = await requestJson<{
        ok: true
        providers: ProviderSummary[]
      }>(`${baseUrl}/providers/probe-all`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return { providers: res.providers }
    },

    async initiateProviderLogin(providerId) {
      const res = await requestJson<{
        ok: true
        login: ProviderLoginOutcome
        provider: ProviderSummary
        providers: ProviderSummary[]
      }>(`${baseUrl}/providers/${encodeURIComponent(providerId)}/login`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      return {
        login: res.login,
        provider: res.provider,
        providers: res.providers,
      }
    },
  }
}
