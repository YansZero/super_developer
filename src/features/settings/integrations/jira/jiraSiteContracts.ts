export interface JiraSite {
  cloudId: string
  name: string
  url: string
}

export interface JiraSiteSnapshot {
  userKey: string
  sites: JiraSite[]
  selectedCloudId: string | null
}

export interface JiraSiteServiceContract {
  getSnapshot(signal?: AbortSignal): Promise<JiraSiteSnapshot>
  selectSite(cloudId: string, signal?: AbortSignal): Promise<void>
}

export type JiraSiteErrorCode =
  | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'UNCONFIGURED'
  | 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'OFFLINE' | 'IDENTITY_CHANGED'

export class JiraSiteError extends Error {
  constructor(public readonly code: JiraSiteErrorCode, public readonly retryAt = 0) {
    super(code)
    this.name = 'JiraSiteError'
  }
}
