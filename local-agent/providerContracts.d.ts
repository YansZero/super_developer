declare module 'node:fs' {
  export const constants: {
    readonly F_OK: number
    readonly R_OK: number
    readonly W_OK: number
    readonly X_OK: number
  }
  export function mkdtempSync(prefix: string): string
  export function mkdirSync(
    dirPath: string,
    options?: { recursive?: boolean; mode?: number },
  ): void
  export function writeFileSync(
    file: string | number,
    data: string,
    options?: string | { encoding?: string; mode?: number },
  ): void
  export function chmodSync(filePath: string, mode: number): void
  export function statSync(filePath: string): {
    mode: number
    isFile(): boolean
  }
  export function rmSync(
    targetPath: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void
  export function existsSync(filePath: string): boolean
  export function readFileSync(filePath: string, encoding: 'utf8'): string
  export function symlinkSync(target: string, path: string, type?: string): void
  export function lstatSync(filePath: string): {
    isSymbolicLink(): boolean
    isDirectory(): boolean
    isFile(): boolean
  }
  export function readdirSync(dirPath: string): string[]
  const fsDefault: {
    constants: typeof constants
    mkdtempSync: typeof mkdtempSync
    mkdirSync: typeof mkdirSync
    writeFileSync: typeof writeFileSync
    chmodSync: typeof chmodSync
    statSync: typeof statSync
    rmSync: typeof rmSync
    existsSync: typeof existsSync
    readFileSync: typeof readFileSync
    symlinkSync: typeof symlinkSync
    lstatSync: typeof lstatSync
    readdirSync: typeof readdirSync
  }
  export default fsDefault
}

declare module 'node:os' {
  export function tmpdir(): string
  export function homedir(): string
  const osDefault: {
    tmpdir: typeof tmpdir
    homedir: typeof homedir
  }
  export default osDefault
}

declare module 'node:path' {
  export const delimiter: string
  export function join(...paths: string[]): string
  export function dirname(p: string): string
  const pathDefault: {
    delimiter: string
    join: typeof join
    dirname: typeof dirname
  }
  export default pathDefault
}

declare module 'node:events' {
  export class EventEmitter {
    on(event: string, listener: (...args: unknown[]) => void): this
    once(event: string, listener: (...args: unknown[]) => void): this
    emit(event: string, ...args: unknown[]): boolean
  }
}

declare module 'node:http' {
  export interface IncomingMessage {
    method?: string
    url?: string
    headers: Record<string, string | string[] | undefined>
    socket?: {
      remoteAddress?: string
    }
    on(event: string, listener: (...args: unknown[]) => void): this
  }
  export interface ServerResponse {
    statusCode: number
    setHeader(name: string, value: string): void
    end(chunk?: string): void
  }
}

declare module '*providerContracts.mjs' {
  export const MAX_JSON_BODY_BYTES: number
  export const MAX_CLI_PATH_LENGTH: number
  export const MAX_PROVIDER_NAME_LENGTH: number
  export const MAX_CUSTOM_PROVIDERS: number
  export const SAFE_ERROR_CODES: Readonly<Record<string, string>>
  export function isPlainObject(value: unknown): value is Record<string, unknown>
  export function hasForbiddenObjectKeys(obj: Record<string, unknown>): boolean
  export function hasControlCharacters(text: string): boolean
  export function validateProviderIdParam(
    providerId: unknown,
  ): { ok: true; value: string } | { ok: false; errorCode: string; message: string }
  export function validateProviderName(
    rawName: unknown,
  ): { ok: true; value: string } | { ok: false; errorCode: string; message: string }
  export function validateExecutablePathSyntax(
    rawPath: unknown,
  ):
    | { ok: true; value: string; isAbsolutePath: boolean }
    | { ok: false; errorCode: string; message: string }
  export function validateProviderConfigUpdateInput(
    payload: unknown,
  ):
    | { ok: true; value: { cliPath: string; name?: string } }
    | { ok: false; errorCode: string; message: string }
  export function validateCustomProviderCreateInput(
    payload: unknown,
  ):
    | { ok: true; value: { name: string; cliCommand: string; cliPath: string } }
    | { ok: false; errorCode: string; message: string }
}
