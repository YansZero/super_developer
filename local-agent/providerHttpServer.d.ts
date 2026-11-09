declare module '*providerHttpServer.mjs' {
  export interface MinimalIncomingRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: {
      remoteAddress?: string
    }
  }

  export interface MinimalServerResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }

  export function isLoopbackSocketAddress(remoteAddress: unknown): boolean
  export function isAllowedLoopbackHost(hostHeader: unknown): boolean
  export function isAllowedLoopbackOrigin(originHeader: unknown): boolean
  export function verifyLoopbackRequestSecurity(req: unknown):
    | { ok: true }
    | { ok: false; status: number; errorCode: string; message: string }

  export function createProviderApiHandler(options?: {
    configFilePath?: string
  }): (
    req: MinimalIncomingRequest,
    res: MinimalServerResponse,
    next?: () => void,
  ) => Promise<void>
}
