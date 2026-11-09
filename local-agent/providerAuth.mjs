import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SAFE_ERROR_CODES, isPlainObject } from './providerContracts.mjs'
import {
  getAllowlistSpecForProvider,
  hasDisallowedBinaryControlChars,
  resolveExecutableFile,
  runAllowlistedSubprocess,
} from './providerAdapter.mjs'

const VERSION_TOKEN_REGEX = /\bv?(\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z._-]+)?)\b/

export function extractSafeVersionToken(stdoutText) {
  if (typeof stdoutText !== 'string') {
    return null
  }
  const trimmed = stdoutText.trim()
  if (!trimmed || hasDisallowedBinaryControlChars(trimmed)) {
    return null
  }
  const firstLine = trimmed.split(/\r?\n/)[0] || ''
  if (firstLine.length > 160) {
    return null
  }
  const match = VERSION_TOKEN_REGEX.exec(firstLine)
  if (!match || !match[1]) {
    return null
  }
  return match[1].slice(0, 48)
}

function classifyCodexAuthStatus(execResult) {
  if (!execResult.ok) {
    if (execResult.errorCode === SAFE_ERROR_CODES.PROBE_TIMEOUT) {
      return {
        authStatus: 'error',
        errorCode: SAFE_ERROR_CODES.PROBE_TIMEOUT,
        errorMessage: agentMessage('agent.provider.codexTimeout'),
      }
    }
    return {
      authStatus: 'error',
      errorCode: SAFE_ERROR_CODES.PROBE_SPAWN_ERROR,
      errorMessage: agentMessage('agent.provider.codexFailed'),
    }
  }

  const combined = `${execResult.stdoutText}\n${execResult.stderrText}`.trim()
  if (!combined || hasDisallowedBinaryControlChars(combined)) {
    return {
      authStatus: 'unknown',
      errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
      errorMessage: agentMessage('agent.provider.codexEmptyOutput'),
    }
  }

  const hasNotLoggedIn = /\bnot logged in\b/i.test(combined)
  const hasLoggedIn = /\blogged in\b/i.test(combined) && !hasNotLoggedIn

  if (execResult.status === 0 && hasLoggedIn) {
    return {
      authStatus: 'authenticated',
      errorCode: null,
      errorMessage: null,
    }
  }

  if (hasNotLoggedIn) {
    return {
      authStatus: 'unauthenticated',
      errorCode: SAFE_ERROR_CODES.AUTH_UNAUTHENTICATED,
      errorMessage: agentMessage('agent.provider.codexNotLoggedIn'),
    }
  }

  if (execResult.status !== 0) {
    return {
      authStatus: 'error',
      errorCode: SAFE_ERROR_CODES.AUTH_CHECK_FAILED,
      errorMessage: agentMessage('agent.provider.codexNonZero'),
    }
  }

  return {
    authStatus: 'unknown',
    errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
    errorMessage: agentMessage('agent.provider.codexUnexpectedOutput'),
  }
}

function classifyClaudeAuthStatus(execResult) {
  if (!execResult.ok) {
    if (execResult.errorCode === SAFE_ERROR_CODES.PROBE_TIMEOUT) {
      return {
        authStatus: 'error',
        errorCode: SAFE_ERROR_CODES.PROBE_TIMEOUT,
        errorMessage: agentMessage('agent.provider.claudeTimeout'),
      }
    }
    return {
      authStatus: 'error',
      errorCode: SAFE_ERROR_CODES.PROBE_SPAWN_ERROR,
      errorMessage: agentMessage('agent.provider.claudeFailed'),
    }
  }

  const rawOut = execResult.stdoutText.trim()
  if (!rawOut || hasDisallowedBinaryControlChars(rawOut)) {
    if (execResult.status !== 0) {
      return {
        authStatus: 'error',
        errorCode: SAFE_ERROR_CODES.AUTH_CHECK_FAILED,
        errorMessage: agentMessage('agent.provider.claudeNonZero'),
      }
    }
    return {
      authStatus: 'unknown',
      errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
      errorMessage: agentMessage('agent.provider.claudeEmptyOutput'),
    }
  }

  try {
    const parsed = JSON.parse(rawOut)
    if (!isPlainObject(parsed)) {
      return {
        authStatus: 'unknown',
        errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
        errorMessage: agentMessage('agent.provider.claudeInvalidJson'),
      }
    }

    const loggedInFlag = parsed.loggedIn
    const authMethod =
      typeof parsed.authMethod === 'string' ? parsed.authMethod.trim().toLowerCase() : null

    if (
      execResult.status === 0 &&
      (loggedInFlag === true ||
        (authMethod !== null &&
          authMethod !== '' &&
          authMethod !== 'none' &&
          loggedInFlag !== false))
    ) {
      return {
        authStatus: 'authenticated',
        errorCode: null,
        errorMessage: null,
      }
    }

    if (loggedInFlag === false || authMethod === 'none') {
      return {
        authStatus: 'unauthenticated',
        errorCode: SAFE_ERROR_CODES.AUTH_UNAUTHENTICATED,
        errorMessage: agentMessage('agent.provider.claudeNotLoggedIn'),
      }
    }

    if (execResult.status !== 0) {
      return {
        authStatus: 'error',
        errorCode: SAFE_ERROR_CODES.AUTH_CHECK_FAILED,
        errorMessage: agentMessage('agent.provider.claudeNonZero'),
      }
    }

    return {
      authStatus: 'unknown',
      errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
      errorMessage: agentMessage('agent.provider.claudeMissingFields'),
    }
  } catch {
    if (execResult.status !== 0) {
      return {
        authStatus: 'error',
        errorCode: SAFE_ERROR_CODES.AUTH_CHECK_FAILED,
        errorMessage: agentMessage('agent.provider.claudeNonZeroRaw'),
      }
    }
    return {
      authStatus: 'unknown',
      errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
      errorMessage: agentMessage('agent.provider.claudeInvalidRawJson'),
    }
  }
}

export function classifyAntigravityAuthStatus(execResult, options = {}) {
  // 1. 如果 CLI 執行回傳逾時
  if (execResult && execResult.errorCode === SAFE_ERROR_CODES.PROBE_TIMEOUT) {
    return {
      authStatus: 'error',
      errorCode: SAFE_ERROR_CODES.PROBE_TIMEOUT,
      errorMessage: agentMessage('agent.provider.agyTimeout'),
    }
  }

  // 2. 優先查驗 CLI 子程序執行結果 (agy models)
  if (execResult) {
    if (execResult.ok && execResult.status === 0) {
      const text = (execResult.stdoutText || '') + (execResult.stderrText || '')
      if (
        text.includes('gemini') ||
        text.includes('claude') ||
        text.includes('gpt-') ||
        text.includes('models') ||
        text.includes('argon') ||
        text.includes('flash')
      ) {
        return {
          authStatus: 'authenticated',
          errorCode: null,
          errorMessage: null,
        }
      }
    } else if (execResult.status !== 0 && execResult.status !== null) {
      return {
        authStatus: 'unauthenticated',
        errorCode: SAFE_ERROR_CODES.AUTH_UNAUTHENTICATED,
        errorMessage: agentMessage('agent.provider.agyNotLoggedInTerminal'),
      }
    }
  }

  // 3. 備援查驗：若未執行子程序或 CLI 執行環境具備 HOME 時查驗憑證檔
  const homeDir = (options.env && options.env.HOME) || (execResult ? null : os.homedir())
  if (homeDir) {
    const googleAccountsPath = path.join(homeDir, '.gemini', 'google_accounts.json')
    const oauthCredsPath = path.join(homeDir, '.gemini', 'oauth_creds.json')

    try {
      if (fs.existsSync(googleAccountsPath)) {
        const raw = fs.readFileSync(googleAccountsPath, 'utf8')
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.active === 'string' && parsed.active.includes('@')) {
          return {
            authStatus: 'authenticated',
            errorCode: null,
            errorMessage: null,
          }
        }
      }
    } catch {
      // 略過讀檔失敗
    }

    try {
      if (fs.existsSync(oauthCredsPath)) {
        const creds = JSON.parse(fs.readFileSync(oauthCredsPath, 'utf8'))
        if (creds && (creds.access_token || creds.refresh_token)) {
          return {
            authStatus: 'authenticated',
            errorCode: null,
            errorMessage: null,
          }
        }
      }
    } catch {
      // 略過讀檔失敗
    }
  }

  return {
    authStatus: 'unauthenticated',
    errorCode: SAFE_ERROR_CODES.AUTH_UNAUTHENTICATED,
    errorMessage: agentMessage('agent.provider.agyNotLoggedIn'),
  }
}

export function probeProvider(provider, options = {}) {
  const checkedAt = new Date().toISOString()
  const resolution = resolveExecutableFile(provider.cliPath, options)
  if (!resolution.ok) {
    const statusText =
      resolution.errorCode === SAFE_ERROR_CODES.CLI_NOT_FOUND ||
      resolution.errorCode === SAFE_ERROR_CODES.CLI_NOT_FILE
        ? agentMessage('agent.provider.statusCliMissing')
        : resolution.errorCode === SAFE_ERROR_CODES.CLI_NOT_EXECUTABLE
          ? agentMessage('agent.provider.statusCliNotExecutable')
          : agentMessage('agent.provider.statusCliPathInvalid')

    return {
      statusKind: resolution.statusKind,
      statusText,
      cliStatus: resolution.cliStatus,
      authStatus: 'unknown',
      version: null,
      checkedAt,
      errorCode: resolution.errorCode,
      errorMessage: resolution.errorMessage,
    }
  }

  const spec = getAllowlistSpecForProvider(provider.id)
  const versionRun = runAllowlistedSubprocess(
    provider.id,
    'version',
    resolution.resolvedPath,
    spec.versionArgs,
    options,
  )

  if (!versionRun.ok) {
    if (versionRun.errorCode === SAFE_ERROR_CODES.PROBE_TIMEOUT) {
      return {
        statusKind: 'unknown',
        statusText: agentMessage('agent.provider.statusVersionTimeout'),
        cliStatus: 'timeout',
        authStatus: 'unknown',
        version: null,
        checkedAt,
        errorCode: SAFE_ERROR_CODES.PROBE_TIMEOUT,
        errorMessage: agentMessage('agent.provider.statusVersionTimeoutMsg'),
      }
    }
    return {
      statusKind: 'unknown',
      statusText: agentMessage('agent.provider.statusStartFailed'),
      cliStatus: 'error',
      authStatus: 'unknown',
      version: null,
      checkedAt,
      errorCode: SAFE_ERROR_CODES.PROBE_SPAWN_ERROR,
      errorMessage: agentMessage('agent.provider.statusStartFailedMsg'),
    }
  }

  if (versionRun.status !== 0) {
    return {
      statusKind: 'unknown',
      statusText: agentMessage('agent.provider.statusNonZeroExit'),
      cliStatus: 'error',
      authStatus: 'unknown',
      version: null,
      checkedAt,
      errorCode: SAFE_ERROR_CODES.PROBE_NON_ZERO_EXIT,
      errorMessage: agentMessage('agent.provider.statusNonZeroExitMsg'),
    }
  }

  const version = extractSafeVersionToken(versionRun.stdoutText)
  if (!version) {
    return {
      statusKind: 'unknown',
      statusText: agentMessage('agent.provider.statusVersionUnexpected'),
      cliStatus: 'unexpected_output',
      authStatus: 'unknown',
      version: null,
      checkedAt,
      errorCode: SAFE_ERROR_CODES.PROBE_UNEXPECTED_OUTPUT,
      errorMessage: agentMessage('agent.provider.statusVersionUnexpectedMsg'),
    }
  }

  if (!spec.authStatusArgs) {
    return {
      statusKind: 'unknown',
      statusText: agentMessage('agent.provider.statusLoginUnconfirmed'),
      cliStatus: 'available',
      authStatus: 'unknown',
      version,
      checkedAt,
      errorCode: SAFE_ERROR_CODES.AUTH_CHECK_UNSUPPORTED,
      errorMessage: agentMessage('agent.provider.statusLoginUnconfirmedMsg'),
    }
  }

  const authRun = runAllowlistedSubprocess(
    provider.id,
    'authStatus',
    resolution.resolvedPath,
    spec.authStatusArgs,
    options,
  )

  const authOutcome =
    provider.id === 'antigravity'
      ? classifyAntigravityAuthStatus(authRun, options)
      : provider.id === 'codex'
        ? classifyCodexAuthStatus(authRun)
        : classifyClaudeAuthStatus(authRun)

  if (authOutcome.authStatus === 'authenticated') {
    return {
      statusKind: 'normal',
      statusText: agentMessage('agent.provider.statusLoggedIn', { version }),
      cliStatus: 'available',
      authStatus: 'authenticated',
      version,
      checkedAt,
      errorCode: null,
      errorMessage: null,
    }
  }

  if (authOutcome.authStatus === 'unauthenticated') {
    return {
      statusKind: 'unknown',
      statusText: agentMessage('agent.provider.statusAvailableNotLoggedIn', { version }),
      cliStatus: 'available',
      authStatus: 'unauthenticated',
      version,
      checkedAt,
      errorCode: authOutcome.errorCode,
      errorMessage: authOutcome.errorMessage,
    }
  }

  if (authOutcome.errorCode === SAFE_ERROR_CODES.PROBE_TIMEOUT) {
    return {
      statusKind: 'unknown',
      statusText: agentMessage('agent.provider.statusLoginTimeout', { version }),
      cliStatus: 'available',
      authStatus: 'error',
      version,
      checkedAt,
      errorCode: authOutcome.errorCode,
      errorMessage: authOutcome.errorMessage,
    }
  }

  return {
    statusKind: 'unknown',
    statusText: agentMessage('agent.provider.statusLoginUnknown', { version }),
    cliStatus: 'available',
    authStatus: authOutcome.authStatus,
    version,
    checkedAt,
    errorCode: authOutcome.errorCode,
    errorMessage: authOutcome.errorMessage,
  }
}

export function initiateProviderLogin(provider, options = {}) {
  const spec = getAllowlistSpecForProvider(provider.id)
  if (!spec.loginArgs) {
    return {
      ok: true,
      outcome: 'manual_cli_login_required',
      errorCode: SAFE_ERROR_CODES.LOGIN_UNSUPPORTED_PROVIDER,
      commandHint: provider.loginCommandHint || provider.cliCommand,
      message:
        agentMessage('agent.provider.loginManualRequired'),
    }
  }

  const resolution = resolveExecutableFile(provider.cliPath, options)
  if (!resolution.ok) {
    return {
      ok: false,
      outcome: 'cli_unavailable',
      errorCode: resolution.errorCode,
      commandHint: `${provider.cliCommand} ${spec.loginArgs.join(' ')}`,
      message: resolution.errorMessage,
    }
  }

  if (provider.id === 'antigravity') {
    return {
      ok: true,
      outcome: 'interactive_terminal_required',
      errorCode: SAFE_ERROR_CODES.LOGIN_INTERACTIVE_REQUIRED,
      commandHint: 'agy',
      message:
        agentMessage('agent.provider.agyLoginNotice'),
    }
  }

  if (typeof options.interactiveLoginLauncher === 'function') {
    const launchResult = options.interactiveLoginLauncher({
      providerId: provider.id,
      executablePath: resolution.resolvedPath,
      args: [...spec.loginArgs],
    })
    if (launchResult && launchResult.launched) {
      const updatedProbe = probeProvider(provider, options)
      return {
        ok: true,
        outcome:
          updatedProbe.authStatus === 'authenticated'
            ? 'authenticated_after_login'
            : 'launched_pending_verification',
        errorCode: updatedProbe.errorCode,
        commandHint: `${provider.cliCommand} ${spec.loginArgs.join(' ')}`,
        message:
          updatedProbe.authStatus === 'authenticated'
            ? agentMessage('agent.provider.loginVerified')
            : agentMessage('agent.provider.loginStartedNotConfirmed'),
        probeResult: updatedProbe,
      }
    }
  }

  return {
    ok: true,
    outcome: 'interactive_terminal_required',
    errorCode: SAFE_ERROR_CODES.LOGIN_INTERACTIVE_REQUIRED,
    commandHint: provider.loginCommandHint || `${provider.cliCommand} ${spec.loginArgs.join(' ')}`,
    message:
      agentMessage('agent.provider.interactiveTtyRequired'),
  }
}
