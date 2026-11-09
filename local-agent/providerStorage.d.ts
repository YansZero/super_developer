declare module '*providerStorage.mjs' {
  export function resolveDefaultProviderConfigPath(
    env?: Record<string, string | undefined>,
  ): string
  export function writeFileAtomicallyRestricted(
    filePath: string,
    contentString: string,
  ): void

  export interface ProviderStorageInstance {
    readonly configFilePath: string
    listProviders(): Array<Record<string, unknown>>
    getProviderById(providerId: string): Record<string, unknown> | null
    updateProviderConfig(
      providerId: string,
      rawInput: unknown,
    ):
      | { ok: true; provider: Record<string, unknown> }
      | { ok: false; errorCode: string; message: string }
    addCustomProvider(
      rawInput: unknown,
    ):
      | { ok: true; provider: Record<string, unknown> }
      | { ok: false; errorCode: string; message: string }
    removeCustomProvider(
      providerId: string,
    ):
      | { ok: true; removedId: string; providers: Array<Record<string, unknown>> }
      | { ok: false; errorCode: string; message: string }
    saveProbeResult(
      providerId: string,
      probeResult: Record<string, unknown>,
    ): Record<string, unknown> | null
  }

  export function createProviderStorage(options?: {
    configFilePath?: string
  }): ProviderStorageInstance
}
