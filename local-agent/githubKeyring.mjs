import { agentMessage } from './requestI18n.mjs'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { GITHUB_ERROR_CODES, hasControlCharacters } from './githubContracts.mjs'

export const KEYRING_SERVICE_NAME = 'super-developer-github'
export const KEYRING_ACCOUNT_ACCESS_TOKEN = 'oauth_access_token'
export const KEYRING_ACCOUNT_DEVICE_CODE = 'oauth_device_code'

const ALLOWED_KEYRING_ACCOUNTS = new Set([
  KEYRING_ACCOUNT_ACCESS_TOKEN,
  KEYRING_ACCOUNT_DEVICE_CODE,
])

function buildKeyringEnv(baseEnv = process.env) {
  const safeKeys = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'LANG',
    'LC_ALL',
    'DBUS_SESSION_BUS_ADDRESS',
    'XDG_RUNTIME_DIR',
  ]
  const env = {
    NO_COLOR: '1',
    CI: '1',
  }
  for (const key of safeKeys) {
    if (typeof baseEnv[key] === 'string' && baseEnv[key].trim() !== '') {
      env[key] = baseEnv[key]
    }
  }
  return env
}

function resolveLinuxSecretToolPath(customPath) {
  const candidates =
    typeof customPath === 'string' && customPath.trim().startsWith('/')
      ? [customPath.trim()]
      : ['/usr/bin/secret-tool', '/usr/local/bin/secret-tool', '/bin/secret-tool']

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate)
      if (stat.isFile() && (stat.mode & 0o111) !== 0) {
        return candidate
      }
    } catch {
      continue
    }
  }
  return null
}

function resolveDarwinSecurityPath(customPath) {
  const candidates =
    typeof customPath === 'string' && customPath.trim().startsWith('/')
      ? [customPath.trim()]
      : ['/usr/bin/security']

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate)
      if (stat.isFile() && (stat.mode & 0o111) !== 0) {
        return candidate
      }
    } catch {
      continue
    }
  }
  return null
}

function validateKeyringAccount(accountKey) {
  if (typeof accountKey !== 'string' || !ALLOWED_KEYRING_ACCOUNTS.has(accountKey)) {
    return false
  }
  return true
}

function validateSecretString(secretValue) {
  if (typeof secretValue !== 'string') {
    return false
  }
  const trimmed = secretValue.trim()
  if (trimmed.length < 4 || trimmed.length > 512 || hasControlCharacters(trimmed)) {
    return false
  }
  return true
}

export function createOsKeyringAdapter(options = {}) {
  const platform = options.platform || process.platform
  const env = options.env || process.env
  const spawnFn = options.spawnSyncFn || spawnSync

  function checkBackendAvailability() {
    if (platform === 'linux') {
      const binPath = resolveLinuxSecretToolPath(options.binaryPath)
      if (!binPath) {
        return {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
          message:
            agentMessage('agent.github.keyringSecretToolMissing'),
        }
      }
      if (
        typeof env.DBUS_SESSION_BUS_ADDRESS !== 'string' ||
        env.DBUS_SESSION_BUS_ADDRESS.trim() === ''
      ) {
        return {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
          message:
            agentMessage('agent.github.keyringDbusMissing'),
        }
      }
      return { ok: true, platform: 'linux', binPath }
    }

    if (platform === 'darwin') {
      const binPath = resolveDarwinSecurityPath(options.binaryPath)
      if (!binPath) {
        return {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
          message:
            agentMessage('agent.github.keyringSecurityMissing'),
        }
      }
      return { ok: true, platform: 'darwin', binPath }
    }

    return {
      ok: false,
      errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
      message: agentMessage('agent.github.keyringPlatformUnsupported', { platform: String(platform) }),
    }
  }

  function isAvailable() {
    const check = checkBackendAvailability()
    if (!check.ok) {
      return {
        ok: false,
        errorCode: check.errorCode,
        message: check.message,
      }
    }
    return {
      ok: true,
      errorCode: null,
      message: null,
    }
  }

  function getSecret(accountKey) {
    if (!validateKeyringAccount(accountKey)) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
        message: agentMessage('agent.github.keyringAccountKeyInvalid'),
      }
    }

    const backend = checkBackendAvailability()
    if (!backend.ok) {
      return backend
    }

    const args =
      backend.platform === 'linux'
        ? ['lookup', 'service', KEYRING_SERVICE_NAME, 'account', accountKey]
        : ['find-generic-password', '-s', KEYRING_SERVICE_NAME, '-a', accountKey, '-w']

    const result = spawnFn(backend.binPath, args, {
      shell: false,
      windowsHide: true,
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildKeyringEnv(env),
    })

    if (result.error) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
        message:
          agentMessage('agent.github.keyringCallFailed'),
      }
    }

    if (result.status !== 0) {
      const stderrText = typeof result.stderr === 'string' ? result.stderr.trim() : ''
      if (
        /dbus|daemon|cannot autolaunch|not provided by any \.service|locked|unavailable/i.test(
          stderrText,
        )
      ) {
        return {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
          message:
            agentMessage('agent.github.keyringLocked'),
        }
      }
      return { ok: true, value: null }
    }

    const val = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    return { ok: true, value: val ? val : null }
  }

  function setSecret(accountKey, secretValue) {
    if (!validateKeyringAccount(accountKey) || !validateSecretString(secretValue)) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.KEYRING_WRITE_FAILED,
        message: agentMessage('agent.github.keyringFormatInvalid'),
      }
    }

    const backend = checkBackendAvailability()
    if (!backend.ok) {
      return backend
    }

    const trimmedSecret = secretValue.trim()
    const result =
      backend.platform === 'linux'
        ? spawnFn(
            backend.binPath,
            [
              'store',
              '--label=Super Developer GitHub OAuth',
              'service',
              KEYRING_SERVICE_NAME,
              'account',
              accountKey,
            ],
            {
              shell: false,
              windowsHide: true,
              timeout: 3000,
              input: trimmedSecret,
              encoding: 'utf8',
              stdio: ['pipe', 'pipe', 'pipe'],
              env: buildKeyringEnv(env),
            },
          )
        : spawnFn(
            backend.binPath,
            [
              'add-generic-password',
              '-U',
              '-s',
              KEYRING_SERVICE_NAME,
              '-a',
              accountKey,
              '-w',
              trimmedSecret,
            ],
            {
              shell: false,
              windowsHide: true,
              timeout: 3000,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'pipe'],
              env: buildKeyringEnv(env),
            },
          )

    if (result.error || result.status !== 0) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
        message:
          agentMessage('agent.github.keyringWriteFailedAbort'),
      }
    }

    return { ok: true }
  }

  function deleteSecret(accountKey) {
    if (!validateKeyringAccount(accountKey)) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.KEYRING_DELETE_FAILED,
        message: agentMessage('agent.github.keyringAccountKeyInvalid'),
      }
    }

    const backend = checkBackendAvailability()
    if (!backend.ok) {
      return backend
    }

    const args =
      backend.platform === 'linux'
        ? ['clear', 'service', KEYRING_SERVICE_NAME, 'account', accountKey]
        : ['delete-generic-password', '-s', KEYRING_SERVICE_NAME, '-a', accountKey]

    const result = spawnFn(backend.binPath, args, {
      shell: false,
      windowsHide: true,
      timeout: 3000,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildKeyringEnv(env),
    })

    if (result.error) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
        message: agentMessage('agent.github.keyringDeleteFailed'),
      }
    }

    // clear/delete 若原本無該鍵（macOS exit 44 / Linux exit 0 或非 dbus 錯誤）視為已清除
    if (result.status !== 0 && backend.platform === 'linux') {
      const stderrText = typeof result.stderr === 'string' ? result.stderr.trim() : ''
      if (/dbus|daemon|cannot autolaunch|locked|unavailable/i.test(stderrText)) {
        return {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.KEYRING_UNAVAILABLE,
          message: agentMessage('agent.github.keyringNotStarted'),
        }
      }
    }

    return { ok: true }
  }

  return {
    isAvailable,
    getSecret,
    setSecret,
    deleteSecret,
    getAccessToken: () => getSecret(KEYRING_ACCOUNT_ACCESS_TOKEN),
    setAccessToken: (token) => setSecret(KEYRING_ACCOUNT_ACCESS_TOKEN, token),
    deleteAccessToken: () => deleteSecret(KEYRING_ACCOUNT_ACCESS_TOKEN),
    getDeviceCode: () => getSecret(KEYRING_ACCOUNT_DEVICE_CODE),
    setDeviceCode: (code) => setSecret(KEYRING_ACCOUNT_DEVICE_CODE, code),
    deleteDeviceCode: () => deleteSecret(KEYRING_ACCOUNT_DEVICE_CODE),
  }
}

