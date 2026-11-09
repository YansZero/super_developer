import { JiraSiteError } from './jiraSiteContracts'
import type { JiraSiteSnapshot } from './jiraSiteContracts'

export interface JiraSitesState {
  snapshot: JiraSiteSnapshot | null
  draft: string
  phase: 'loading' | 'ready' | 'saving' | 'uncertain' | 'error'
  error: JiraSiteError | null
  saved: boolean
}

export const initialJiraSitesState: JiraSitesState = {
  snapshot: null, draft: '', phase: 'loading', error: null, saved: false,
}

export function siteError(error: unknown): JiraSiteError {
  return error instanceof JiraSiteError ? error : new JiraSiteError('UNAVAILABLE')
}

export const jiraSiteMessages = {
  AUTH_REQUIRED: 'jira.siteError.authRequired',
  FORBIDDEN: 'jira.siteError.forbidden',
  RATE_LIMITED: 'jira.siteError.rateLimited',
  UNCONFIGURED: 'jira.siteError.unconfigured',
  UNAVAILABLE: 'jira.siteError.unavailable',
  INVALID_RESPONSE: 'jira.siteError.invalidResponse',
  OFFLINE: 'jira.siteError.offline',
  IDENTITY_CHANGED: 'jira.siteError.identityChanged',
} as const

export function deriveJiraSiteView(state: JiraSitesState, now: number) {
  const current = state.snapshot?.sites.find((site) => site.cloudId === state.snapshot?.selectedCloudId)
  const pending = state.draft !== (state.snapshot?.selectedCloudId ?? '')
  const busy = state.phase === 'loading' || state.phase === 'saving'
  const waiting = (state.error?.retryAt ?? 0) > now
  return {
    current, pending, busy, waiting,
    invalidSelection: Boolean(state.snapshot?.selectedCloudId && !current),
    canSave: state.phase === 'ready' && pending && !waiting
      && Boolean(state.snapshot?.sites.some((site) => site.cloudId === state.draft)),
    canReload: state.phase !== 'saving' && !waiting,
  }
}
