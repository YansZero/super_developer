declare module '*githubHttpServer.mjs' {
  export interface MinimalGitHubIncomingRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: {
      remoteAddress?: string
    }
  }

  export interface MinimalGitHubServerResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }

  export interface GitHubApiHandlerOptions {
    configFilePath?: string
    storage?: unknown
    keyring?: unknown
    keyringOptions?: Record<string, unknown>
    transport?: unknown
    transportOptions?: Record<string, unknown>
    nowFn?: () => number
  }

  export function isLoopbackSocketAddress(remoteAddress: unknown): boolean
  export function isAllowedLoopbackHost(hostHeader: unknown): boolean
  export function isAllowedLoopbackOrigin(originHeader: unknown): boolean
  export function verifyGitHubLoopbackRequestSecurity(
    req: unknown,
  ):
    | { ok: true }
    | { ok: false; status: number; errorCode: string; message: string }

  export function createGitHubApiHandler(
    options?: GitHubApiHandlerOptions,
  ): (
    req: MinimalGitHubIncomingRequest,
    res: MinimalGitHubServerResponse,
    next?: () => void,
  ) => Promise<void>

  export function startLoopbackGitHubServer(
    options?: GitHubApiHandlerOptions & { host?: string; port?: number },
  ): Promise<{
    server: unknown
    host: string
    port: number
    close: () => Promise<void>
  }>
}
