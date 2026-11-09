declare module '*ruleHttpServer.mjs' {
  export interface MinimalRuleIncomingRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: {
      remoteAddress?: string
    }
  }

  export interface MinimalRuleServerResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }

  export function isLoopbackSocketAddress(remoteAddress: unknown): boolean
  export function isAllowedLoopbackHost(hostHeader: unknown): boolean
  export function isAllowedLoopbackOrigin(originHeader: unknown): boolean
  export function verifyRuleLoopbackRequestSecurity(req: unknown):
    | { ok: true }
    | { ok: false; status: number; errorCode: string; message: string }

  export function createRuleApiHandler(options?: {
    configFilePath?: string
  }): (
    req: MinimalRuleIncomingRequest,
    res: MinimalRuleServerResponse,
    next?: () => void,
  ) => Promise<void>

  export function startLoopbackRuleServer(options?: {
    host?: string
    port?: number
    configFilePath?: string
  }): Promise<{
    server: unknown
    host: string
    port: number
    close: () => Promise<void>
  }>
}
