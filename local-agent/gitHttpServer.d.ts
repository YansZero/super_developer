declare module '*gitHttpServer.mjs' {
  export interface MinimalGitIncomingRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: {
      remoteAddress?: string
    }
  }

  export interface MinimalGitServerResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string | Buffer): void
  }

  export function isLoopbackSocketAddress(remoteAddress: unknown): boolean
  export function isAllowedLoopbackHost(hostHeader: unknown): boolean
  export function isAllowedLoopbackOrigin(originHeader: unknown): boolean
  export function verifyGitLoopbackRequestSecurity(req: unknown): {
    ok: boolean
    status?: number
    errorCode?: string
    message?: string
  }

  export function createGitApiHandler(options?: unknown): (
    req: MinimalGitIncomingRequest,
    res: MinimalGitServerResponse,
    next?: () => void,
  ) => Promise<void>
}
