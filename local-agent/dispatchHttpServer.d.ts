declare module '*dispatchHttpServer.mjs' {
  export interface MinimalDispatchRequest {
    method?: string
    url?: string
    headers?: Record<string, string | string[] | undefined>
    socket?: { remoteAddress?: string }
    on?(event: 'data', listener: (chunk: Buffer | string) => void): void
    on?(event: 'end' | 'error', listener: (error?: unknown) => void): void
    resume?(): void
  }

  export interface MinimalDispatchResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }

  export interface DispatchJobSnapshot {
    id: string
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
    providerId: string
    projectId: string
    projectName: string
    startedAt: string
    updatedAt: string
    output: string
    error: string | null
    exitCode: number | null
    artifactPath: string | null
  }

  export interface DispatchApiHandlerOptions {
    backendPort?: number
    runner?: {
      start(input: Record<string, unknown>): { ok: true; job: DispatchJobSnapshot } | { ok: false; status: number; code: string; message: string }
      get(jobId: string): DispatchJobSnapshot | null
      cancel(jobId: string): DispatchJobSnapshot | null
    }
    storage?: unknown
    configFilePath?: string
    adapterOptions?: Record<string, unknown>
    timeoutMs?: number
  }

  export interface DispatchApiHandler {
    (req: MinimalDispatchRequest, res: MinimalDispatchResponse, next?: () => void): Promise<void>
    close?: () => void
  }

  export function createDispatchApiHandler(options?: DispatchApiHandlerOptions): DispatchApiHandler
}
