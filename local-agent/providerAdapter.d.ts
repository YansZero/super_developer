declare module '*providerAdapter.mjs' {
  export function isAllowlistedCommandArgs(
    providerId: string,
    operation: 'version' | 'authStatus' | 'login' | 'models',
    args: ReadonlyArray<string>,
  ): boolean

  export function buildSafeSubprocessEnv(
    baseEnv?: Record<string, string | undefined>,
  ): Record<string, string>

  export function hasDisallowedBinaryControlChars(text: string): boolean

  export function resolveExecutableFile(
    rawCliPath: string,
    options?: { searchPathEnv?: string; env?: Record<string, string | undefined> },
  ): { ok: boolean; errorCode?: string; executablePath?: string }

  export function runAllowlistedSubprocess(
    providerId: string,
    operation: 'version' | 'authStatus' | 'login',
    executablePath: string,
    args: ReadonlyArray<string>,
    options?: { timeoutMs?: number; env?: Record<string, string | undefined> },
  ): {
    ok: boolean
    errorCode: string | null
    timedOut: boolean
    status: number | null
    stdoutText: string
    stderrText: string
  }
}
