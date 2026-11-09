declare module '*libraryHttpServer.mjs' {
  export interface MinimalLibraryIncomingRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: {
      remoteAddress?: string
    }
    on?(event: string, listener: (...args: unknown[]) => void): void
  }

  export interface MinimalLibraryServerResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }

  export function createLibraryApiHandler(options?: Record<string, unknown>): {
    (
      req: MinimalLibraryIncomingRequest,
      res: MinimalLibraryServerResponse,
      next?: () => void,
    ): Promise<void>
    close?: () => void
  }
}

declare module '*libraryPaths.mjs' {
  export function validateLibraryItemName(rawName: unknown): {
    ok: boolean
    value?: string
    errorCode?: string
    message?: string
  }
  export function validateSkillRelativeFilePath(rawRelPath: unknown): {
    ok: boolean
    value?: string
    errorCode?: string
    message?: string
  }
  export function resolveInsideLibrary(
    options: Record<string, unknown>,
    ...segments: string[]
  ): {
    ok: boolean
    path?: string
    root?: string
    errorCode?: string
    message?: string
  }
}

declare module '*libraryAssist.mjs' {
  export function parseSkillAssistDraft(
    rawOutput: string,
    fallbackName?: string,
  ):
    | {
        ok: true
        draft: {
          name: string
          description: string
          body: string
          content: string
          files: Array<{ path: string; content: string }>
        }
      }
    | { ok: false; errorCode: string; message: string }

  export function parseMcpAssistDraft(
    rawOutput: string,
    fallbackName?: string,
  ):
    | {
        ok: true
        draft: {
          name: string
          description: string
          transport: 'stdio' | 'http'
          command: string | null
          args: string[]
          url: string | null
          env: Record<string, string>
          headers: Record<string, string>
          secretEnv: Record<string, string>
          secretHeaders: Record<string, string>
          warnings: string[]
        }
      }
    | { ok: false; errorCode: string; message: string }
}

declare module '*mcpHealthCheck.mjs' {
  export function parseMcpAiCheckOutput(
    rawOutput: string,
    expectedServerName: string,
  ): {
    ok: boolean
    server?: string
    loaded: boolean
    status: string
    tools: string[]
    detail: string
    suggestion: string
  }
}
