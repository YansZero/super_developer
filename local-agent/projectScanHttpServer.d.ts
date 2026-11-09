declare module '*projectScanHttpServer.mjs' {
  export function createProjectScanApiHandler(options?: unknown): (
    req: unknown,
    res: { statusCode: number; setHeader(name: string, value: string): void; end(chunk?: string): void },
    next?: () => void,
  ) => Promise<void>
}
