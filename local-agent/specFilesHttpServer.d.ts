declare module '*specFilesHttpServer.mjs' {
  export interface MinimalSpecFilesRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: { remoteAddress?: string }
    on?(event: 'data', listener: (chunk: Buffer | string) => void): void
    on?(event: 'end' | 'error', listener: (error?: unknown) => void): void
    resume?(): void
  }

  export interface MinimalSpecFilesResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }

  export interface SpecFilesApiHandler {
    (req: MinimalSpecFilesRequest, res: MinimalSpecFilesResponse, next?: () => void): Promise<void>
  }

  export function createSpecFilesApiHandler(options?: { store?: unknown }): SpecFilesApiHandler
}
