declare module '*githubContracts.mjs' {
  export const MAX_GITHUB_HTTP_BODY_BYTES: number
  export const MAX_GITHUB_CLIENT_ID_LENGTH: number
  export const MIN_GITHUB_CLIENT_ID_LENGTH: number
  export const GITHUB_REQUIRED_SCOPE: string
  export const GITHUB_DEVICE_VERIFICATION_URI: 'https://github.com/login/device'
  export const GITHUB_OAUTH_GRANT_TYPE: 'urn:ietf:params:oauth:grant-type:device_code'
  export const DEFAULT_DEVICE_FLOW_INTERVAL_SECONDS: number
  export const DEFAULT_DEVICE_FLOW_EXPIRES_IN_SECONDS: number
  export const SLOW_DOWN_INCREMENT_SECONDS: number
  export const MAX_PUBLIC_REPOS_COUNT: number
  export const MAX_PROJECT_MAPPINGS_COUNT: number

  export interface GitHubAllowedEndpointSpec {
    readonly key: 'deviceCode' | 'accessToken' | 'userProfile' | 'publicRepos' | 'repos'
    readonly method: 'GET' | 'POST'
    readonly url: string
    readonly host: string
    readonly pathname: string
    readonly search: string
  }

  export const GITHUB_ALLOWED_ENDPOINTS: Readonly<
    Record<'deviceCode' | 'accessToken' | 'userProfile' | 'publicRepos' | 'repos', GitHubAllowedEndpointSpec>
  >

  export const GITHUB_ERROR_CODES: Readonly<Record<string, string>>

  export interface SanitizedGitHubAccount {
    id: number
    login: string
    name: string | null
    htmlUrl: string
    avatarUrl: string | null
    publicReposCount: number
  }

  export interface SanitizedGitHubRepository {
    id: number
    name: string
    fullName: string
    htmlUrl: string
    description: string | null
    language: string | null
    defaultBranch: string
    updatedAt: string | null
    isPrivate: boolean
  }

  export function hasControlCharacters(text: string): boolean
  export function isPlainObject(value: unknown): value is Record<string, unknown>
  export function hasForbiddenObjectKeys(obj: Record<string, unknown>): boolean

  export function validateGitHubClientId(
    rawClientId: unknown,
  ):
    | { ok: true; value: string }
    | { ok: false; errorCode: string; message: string }

  export function validateGitHubScope(
    rawScope: unknown,
  ):
    | { ok: true; value: 'read:user' }
    | { ok: false; errorCode: string; message: string }

  export function validateVerificationUri(
    rawUri: unknown,
  ):
    | { ok: true; value: 'https://github.com/login/device' }
    | { ok: false; errorCode: string; message: string }

  export function validateAllowedGitHubEndpoint(
    method: unknown,
    rawUrl: unknown,
  ):
    | { ok: true; endpoint: GitHubAllowedEndpointSpec }
    | { ok: false; errorCode: string; message: string }

  export function validateGitHubConfigUpdateInput(
    payload: unknown,
  ):
    | { ok: true; value: { clientId: string } }
    | { ok: false; errorCode: string; message: string }

  export function validateGitHubDeviceFlowStartInput(
    payload: unknown,
  ):
    | { ok: true; value: { clientId?: string; scope: 'read:user' } }
    | { ok: false; errorCode: string; message: string }

  export function validateGitHubDeviceFlowSessionInput(
    payload: unknown,
  ):
    | { ok: true; value: { sessionId: string } }
    | { ok: false; errorCode: string; message: string }

  export function validateProjectIdParam(
    rawProjectId: unknown,
  ):
    | { ok: true; value: string }
    | { ok: false; errorCode: string; message: string }

  export function validateGitHubRepoMappingInput(
    payload: unknown,
  ):
    | {
        ok: true
        value: {
          projectId: string
          projectName: string
          folderDisplayName: string
          repoId: number
        }
      }
    | { ok: false; errorCode: string; message: string }

  export function sanitizePublicGitHubAccount(
    rawUser: unknown,
  ): SanitizedGitHubAccount | null

  export function sanitizePublicGitHubRepositories(
    rawRepos: unknown,
  ): SanitizedGitHubRepository[]
}
