declare module '*githubTransport.mjs' {
  export interface SanitizedTransportAccount {
    id: number
    login: string
    name: string | null
    htmlUrl: string
    avatarUrl: string | null
    publicReposCount: number
  }

  export interface SanitizedTransportRepository {
    id: number
    name: string
    fullName: string
    htmlUrl: string
    description: string | null
    language: string | null
    defaultBranch: string
    updatedAt: string | null
    isPrivate: false
  }

  export interface GitHubTransportJsonResult {
    ok: boolean
    status: number
    data?: unknown
    errorCode?: string
    message?: string
  }

  export type GitHubDeviceCodeResult =
    | {
        ok: true
        deviceCode: string
        userCode: string
        verificationUri: 'https://github.com/login/device'
        intervalSeconds: number
        expiresInSeconds: number
      }
    | {
        ok: false
        status?: number
        errorCode: string
        message: string
      }

  export type GitHubPollTokenResult =
    | { ok: true; outcome: 'pending' }
    | { ok: true; outcome: 'slow_down'; intervalSeconds: number | null }
    | { ok: true; outcome: 'expired' }
    | { ok: true; outcome: 'denied' }
    | { ok: true; outcome: 'authorized'; accessToken: string; scope: string }
    | { ok: false; status?: number; errorCode: string; message: string }

  export type GitHubFetchUserResult =
    | { ok: true; account: SanitizedTransportAccount }
    | { ok: false; errorCode: string; message: string }

  export type GitHubFetchReposResult =
    | { ok: true; repositories: SanitizedTransportRepository[] }
    | { ok: false; errorCode: string; message: string }

  export interface GitHubTransportAdapter {
    requestJson(args: {
      method: string
      url: string
      headers?: Record<string, string>
      body?: unknown
    }): Promise<GitHubTransportJsonResult>
    requestDeviceCode(args: {
      clientId: string
      scope?: string
    }): Promise<GitHubDeviceCodeResult>
    pollDeviceAccessToken(args: {
      clientId: string
      deviceCode: string
    }): Promise<GitHubPollTokenResult>
    fetchAuthenticatedUser(args: {
      accessToken: string
    }): Promise<GitHubFetchUserResult>
    fetchPublicRepositories(args: {
      accessToken: string
    }): Promise<GitHubFetchReposResult>
  }

  export function createHttpsGitHubTransport(options?: {
    timeoutMs?: number
  }): GitHubTransportAdapter
}
