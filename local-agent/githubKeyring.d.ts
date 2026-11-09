declare module '*githubKeyring.mjs' {
  export const KEYRING_SERVICE_NAME: string
  export const KEYRING_ACCOUNT_ACCESS_TOKEN: string
  export const KEYRING_ACCOUNT_DEVICE_CODE: string

  export type KeyringStatusResult =
    | { ok: true; errorCode: null; message: null }
    | { ok: false; errorCode: string; message: string }

  export type KeyringGetResult =
    | { ok: true; value: string | null }
    | { ok: false; errorCode: string; message: string }

  export type KeyringMutateResult =
    | { ok: true }
    | { ok: false; errorCode: string; message: string }

  export interface GitHubKeyringAdapter {
    isAvailable(): KeyringStatusResult
    getSecret(accountKey: string): KeyringGetResult
    setSecret(accountKey: string, secretValue: string): KeyringMutateResult
    deleteSecret(accountKey: string): KeyringMutateResult
    getAccessToken(): KeyringGetResult
    setAccessToken(token: string): KeyringMutateResult
    deleteAccessToken(): KeyringMutateResult
    getDeviceCode(): KeyringGetResult
    setDeviceCode(code: string): KeyringMutateResult
    deleteDeviceCode(): KeyringMutateResult
  }

  export function createOsKeyringAdapter(options?: {
    platform?: string
    env?: Record<string, string | undefined>
    binaryPath?: string
    spawnSyncFn?: unknown
  }): GitHubKeyringAdapter
}
