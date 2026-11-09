import { agentMessage } from './requestI18n.mjs'
export const MAX_JSON_BODY_BYTES = 4096
export const MAX_CLI_PATH_LENGTH = 512
export const MAX_PROVIDER_NAME_LENGTH = 64
export const MAX_CUSTOM_PROVIDERS = 20

export const SAFE_ERROR_CODES = Object.freeze({
  CLI_PATH_EMPTY: 'CLI_PATH_EMPTY',
  CLI_PATH_INVALID: 'CLI_PATH_INVALID',
  CLI_NOT_FOUND: 'CLI_NOT_FOUND',
  CLI_NOT_FILE: 'CLI_NOT_FILE',
  CLI_NOT_EXECUTABLE: 'CLI_NOT_EXECUTABLE',
  PROBE_TIMEOUT: 'PROBE_TIMEOUT',
  PROBE_NON_ZERO_EXIT: 'PROBE_NON_ZERO_EXIT',
  PROBE_UNEXPECTED_OUTPUT: 'PROBE_UNEXPECTED_OUTPUT',
  PROBE_SPAWN_ERROR: 'PROBE_SPAWN_ERROR',
  AUTH_CHECK_UNSUPPORTED: 'AUTH_CHECK_UNSUPPORTED',
  AUTH_UNAUTHENTICATED: 'AUTH_UNAUTHENTICATED',
  AUTH_CHECK_FAILED: 'AUTH_CHECK_FAILED',
  LOGIN_INTERACTIVE_REQUIRED: 'LOGIN_INTERACTIVE_REQUIRED',
  LOGIN_UNSUPPORTED_PROVIDER: 'LOGIN_UNSUPPORTED_PROVIDER',
})

export const BUILTIN_PROVIDER_DESCRIPTORS = Object.freeze([
  Object.freeze({
    id: 'antigravity',
    name: 'Antigravity (agy)',
    shortLabel: 'agy',
    cliCommand: 'agy',
    defaultCliPath: 'agy',
    isBuiltin: true,
    get authModeLabel() {
      return agentMessage('agent.provider.agyAuthModeLabel')
    },
    supportsAuthProbe: true,
    supportsLoginCommand: true,
    loginCommandHint: 'agy',
    get loginGuideText() {
      return agentMessage('agent.provider.agyLoginGuideText')
    },
  }),
  Object.freeze({
    id: 'codex',
    name: 'OpenAI Codex',
    shortLabel: 'codex',
    cliCommand: 'codex',
    defaultCliPath: 'codex',
    isBuiltin: true,
    get authModeLabel() {
      return agentMessage('agent.provider.codexAuthModeLabel')
    },
    supportsAuthProbe: true,
    supportsLoginCommand: true,
    get loginCommandHint() {
      return agentMessage('agent.provider.codexLoginCommandHint')
    },
    get loginGuideText() {
      return agentMessage('agent.provider.codexLoginGuideText')
    },
  }),
  Object.freeze({
    id: 'claude-code',
    name: 'Claude Code',
    shortLabel: 'claude',
    cliCommand: 'claude',
    defaultCliPath: 'claude',
    isBuiltin: true,
    get authModeLabel() {
      return agentMessage('agent.provider.claudeAuthModeLabel')
    },
    supportsAuthProbe: true,
    supportsLoginCommand: true,
    loginCommandHint: 'claude auth login',
    get loginGuideText() {
      return agentMessage('agent.provider.claudeLoginGuideText')
    },
  }),
])

const SHELL_METACHAR_PATTERN = /[;&|$`><(){}\\"'*?~!#\r\n]/
const BARE_COMMAND_PATTERN = /^[a-zA-Z0-9._+-]{1,64}$/
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]{1,62}$/

export function hasControlCharacters(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

export function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function hasForbiddenObjectKeys(obj) {
  const rawKeys = Object.getOwnPropertyNames(obj)
  return rawKeys.some(
    (key) => key === '__proto__' || key === 'constructor' || key === 'prototype',
  )
}

export function validateProviderIdParam(providerId) {
  if (typeof providerId !== 'string') {
    return { ok: false, errorCode: 'INVALID_PROVIDER_ID', message: agentMessage('agent.provider.providerIdMustBeString') }
  }
  const trimmed = providerId.trim()
  if (!PROVIDER_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      errorCode: 'INVALID_PROVIDER_ID',
      message: agentMessage('agent.provider.providerIdFormatInvalid'),
    }
  }
  return { ok: true, value: trimmed }
}

export function validateProviderName(rawName) {
  if (typeof rawName !== 'string') {
    return { ok: false, errorCode: 'INVALID_PROVIDER_NAME', message: agentMessage('agent.provider.providerNameMustBeString') }
  }
  const trimmed = rawName.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_PROVIDER_NAME_LENGTH) {
    return {
      ok: false,
      errorCode: 'INVALID_PROVIDER_NAME',
      message: agentMessage('agent.provider.providerNameLength', { max: MAX_PROVIDER_NAME_LENGTH }),
    }
  }
  if (hasControlCharacters(trimmed)) {
    return {
      ok: false,
      errorCode: 'INVALID_PROVIDER_NAME',
      message: agentMessage('agent.provider.providerNameControlChars'),
    }
  }
  return { ok: true, value: trimmed }
}

export function validateExecutablePathSyntax(rawPath) {
  if (typeof rawPath !== 'string') {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_PATH_INVALID,
      message: agentMessage('agent.provider.cliPathMustBeString'),
    }
  }
  const trimmed = rawPath.trim()
  if (trimmed.length === 0) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_PATH_EMPTY,
      message: agentMessage('agent.provider.cliPathEmpty'),
    }
  }
  if (trimmed.length > MAX_CLI_PATH_LENGTH) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_PATH_INVALID,
      message: agentMessage('agent.provider.cliPathLength', { max: MAX_CLI_PATH_LENGTH }),
    }
  }
  if (hasControlCharacters(trimmed) || SHELL_METACHAR_PATTERN.test(trimmed)) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_PATH_INVALID,
      message: agentMessage('agent.provider.cliPathShellChars'),
    }
  }
  if (/\s/.test(trimmed)) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_PATH_INVALID,
      message: agentMessage('agent.provider.cliPathNoArgs'),
    }
  }

  if (trimmed.startsWith('/')) {
    const segments = trimmed.split('/').filter(Boolean)
    if (segments.length === 0 || segments.some((seg) => seg === '.' || seg === '..')) {
      return {
        ok: false,
        errorCode: SAFE_ERROR_CODES.CLI_PATH_INVALID,
        message: agentMessage('agent.provider.cliPathNoRelativeSegment'),
      }
    }
    return { ok: true, value: trimmed, isAbsolutePath: true }
  }

  if (trimmed === '.' || trimmed === '..' || !BARE_COMMAND_PATTERN.test(trimmed)) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_PATH_INVALID,
      message: agentMessage('agent.provider.cliPathInvalidFormat'),
    }
  }

  return { ok: true, value: trimmed, isAbsolutePath: false }
}

export function validateProviderConfigUpdateInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: 'INVALID_JSON_OBJECT',
      message: agentMessage('agent.provider.requestBodyMustBeJsonObject'),
    }
  }

  const allowedKeys = new Set(['name', 'cliPath'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        errorCode: 'UNKNOWN_FIELD_REJECTED',
        message: agentMessage('agent.provider.disallowedField', { key }),
      }
    }
  }

  const pathValidation = validateExecutablePathSyntax(payload.cliPath)
  if (!pathValidation.ok) {
    return pathValidation
  }

  let validatedName = undefined
  if (payload.name !== undefined) {
    const nameValidation = validateProviderName(payload.name)
    if (!nameValidation.ok) {
      return nameValidation
    }
    validatedName = nameValidation.value
  }

  return {
    ok: true,
    value: {
      cliPath: pathValidation.value,
      ...(validatedName !== undefined ? { name: validatedName } : {}),
    },
  }
}

export function validateCustomProviderCreateInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: 'INVALID_JSON_OBJECT',
      message: agentMessage('agent.provider.requestBodyMustBeJsonObject'),
    }
  }

  const allowedKeys = new Set(['name', 'cliCommand', 'cliPath'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        errorCode: 'UNKNOWN_FIELD_REJECTED',
        message: agentMessage('agent.provider.disallowedField', { key }),
      }
    }
  }

  const nameValidation = validateProviderName(payload.name)
  if (!nameValidation.ok) {
    return nameValidation
  }

  const pathValidation = validateExecutablePathSyntax(payload.cliPath)
  if (!pathValidation.ok) {
    return pathValidation
  }

  const inferredCommand = pathValidation.value.split('/').filter(Boolean).pop() || 'custom-cli'
  const rawCommand =
    payload.cliCommand !== undefined && String(payload.cliCommand).trim() !== ''
      ? String(payload.cliCommand).trim()
      : inferredCommand

  if (!BARE_COMMAND_PATTERN.test(rawCommand) || rawCommand.length > 32) {
    return {
      ok: false,
      errorCode: 'INVALID_CLI_COMMAND',
      message: agentMessage('agent.provider.cliCommandInvalid'),
    }
  }

  return {
    ok: true,
    value: {
      name: nameValidation.value,
      cliCommand: rawCommand,
      cliPath: pathValidation.value,
    },
  }
}

export function createUnprobedProviderRecord(descriptor, configuredCliPath, persistedProbe) {
  const cliPath = configuredCliPath || descriptor.defaultCliPath || descriptor.cliCommand
  if (persistedProbe && isPlainObject(persistedProbe)) {
    // Normalize legacy capability snapshots without changing real auth/CLI failures.
    if (!descriptor.supportsAuthProbe && persistedProbe.cliStatus === 'available' &&
        ['manual_required', 'unknown'].includes(persistedProbe.authStatus) &&
        (!persistedProbe.errorCode || persistedProbe.errorCode === SAFE_ERROR_CODES.AUTH_CHECK_UNSUPPORTED)) {
      persistedProbe = {
        ...persistedProbe,
        statusKind: 'unknown',
        statusText: agentMessage('agent.provider.statusLoginUnconfirmed'),
        authStatus: 'unknown',
        errorCode: SAFE_ERROR_CODES.AUTH_CHECK_UNSUPPORTED,
        errorMessage: agentMessage('agent.provider.statusLoginUnconfirmedMsg'),
      }
    }
    return {
      id: descriptor.id,
      name: descriptor.name,
      shortLabel: descriptor.shortLabel,
      cliCommand: descriptor.cliCommand,
      defaultCliPath: descriptor.defaultCliPath || descriptor.cliCommand,
      cliPath,
      isBuiltin: Boolean(descriptor.isBuiltin),
      authModeLabel: descriptor.authModeLabel,
      supportsAuthProbe: Boolean(descriptor.supportsAuthProbe),
      supportsLoginCommand: Boolean(descriptor.supportsLoginCommand),
      loginCommandHint: descriptor.loginCommandHint,
      loginGuideText: descriptor.loginGuideText,
      statusKind:
        persistedProbe.statusKind === 'normal' ||
        persistedProbe.statusKind === 'missing' ||
        persistedProbe.statusKind === 'unknown'
          ? persistedProbe.statusKind
          : 'unknown',
      statusText:
        typeof persistedProbe.statusText === 'string' && persistedProbe.statusText.trim()
          ? persistedProbe.statusText
          : agentMessage('agent.provider.uninspectedProbeNeeded'),
      cliStatus:
        typeof persistedProbe.cliStatus === 'string' ? persistedProbe.cliStatus : 'unprobed',
      authStatus:
        typeof persistedProbe.authStatus === 'string' ? persistedProbe.authStatus : 'unknown',
      version: typeof persistedProbe.version === 'string' ? persistedProbe.version : null,
      checkedAt: typeof persistedProbe.checkedAt === 'string' ? persistedProbe.checkedAt : null,
      errorCode: typeof persistedProbe.errorCode === 'string' ? persistedProbe.errorCode : null,
      errorMessage:
        typeof persistedProbe.errorMessage === 'string' ? persistedProbe.errorMessage : null,
      demoNote: descriptor.loginGuideText,
      isDemo: false,
    }
  }

  return {
    id: descriptor.id,
    name: descriptor.name,
    shortLabel: descriptor.shortLabel,
    cliCommand: descriptor.cliCommand,
    defaultCliPath: descriptor.defaultCliPath || descriptor.cliCommand,
    cliPath,
    isBuiltin: Boolean(descriptor.isBuiltin),
    authModeLabel: descriptor.authModeLabel,
    supportsAuthProbe: Boolean(descriptor.supportsAuthProbe),
    supportsLoginCommand: Boolean(descriptor.supportsLoginCommand),
    loginCommandHint: descriptor.loginCommandHint,
    loginGuideText: descriptor.loginGuideText,
    statusKind: 'unknown',
    statusText: agentMessage('agent.provider.uninspectedClickToTest'),
    cliStatus: 'unprobed',
    authStatus: 'unknown',
    version: null,
    checkedAt: null,
    errorCode: null,
    errorMessage: null,
    demoNote: descriptor.loginGuideText,
    isDemo: false,
  }
}
