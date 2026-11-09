declare module '*providerAuth.mjs' {
  export interface ProbeProviderResult {
    statusKind: 'normal' | 'missing' | 'unknown'
    statusText: string
    cliStatus: string
    authStatus: string
    version: string | null
    checkedAt: string
    errorCode: string | null
    errorMessage: string | null
  }

  export function extractSafeVersionToken(stdoutText: string): string | null
  export function classifyAntigravityAuthStatus(
    execResult: { ok: boolean; errorCode: string | null; status: number | null; stdoutText: string; stderrText: string },
    options?: { env?: Record<string, string | undefined> },
  ): { authStatus: string; errorCode: string | null; errorMessage: string | null }
  export function probeProvider(
    provider: Record<string, unknown>,
    options?: { timeoutMs?: number; searchPathEnv?: string; env?: Record<string, string | undefined> },
  ): ProbeProviderResult
  export function initiateProviderLogin(
    provider: Record<string, unknown>,
    options?: {
      timeoutMs?: number
      searchPathEnv?: string
      env?: Record<string, string | undefined>
      interactiveLoginLauncher?: (params: { providerId: string; executablePath: string; args: string[] }) => { launched: boolean }
    },
  ): {
    ok: boolean
    outcome: string
    errorCode: string | null
    commandHint: string
    message: string
    probeResult?: ProbeProviderResult
  }
}
