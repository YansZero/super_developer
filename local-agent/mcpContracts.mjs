import { agentMessage } from './requestI18n.mjs'
import { LIBRARY_ERROR_CODES, validateLibraryItemName } from './libraryPaths.mjs'
import { hasControlCharacters, hasForbiddenObjectKeys, isPlainObject } from './providerContracts.mjs'

export const MAX_MCP_COUNT = 200
export const MAX_MCP_HTTP_BODY_BYTES = 128 * 1024
const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/
const HEADER_KEY_REGEX = /^[A-Za-z0-9-]{1,128}$/
const SECRET_PLACEHOLDER_PREFIX = '${secret:'

export const MCP_ERROR_CODES = Object.freeze({
  ...LIBRARY_ERROR_CODES,
  MCP_NOT_FOUND: 'MCP_NOT_FOUND',
  MCP_ALREADY_EXISTS: 'MCP_ALREADY_EXISTS',
  INVALID_JSON_OBJECT: 'INVALID_JSON_OBJECT',
  INVALID_TRANSPORT: 'INVALID_TRANSPORT',
  INVALID_COMMAND: 'INVALID_COMMAND',
  INVALID_ARGS: 'INVALID_ARGS',
  INVALID_URL: 'INVALID_URL',
  INVALID_ENV: 'INVALID_ENV',
  INVALID_HEADERS: 'INVALID_HEADERS',
  MAX_MCP_EXCEEDED: 'MAX_MCP_EXCEEDED',
  MISSING_SECRETS: 'MISSING_SECRETS',
})

export function maskSecretValue(rawVal) {
  if (typeof rawVal !== 'string' || !rawVal) return ''
  if (rawVal.length <= 4) return '••••'
  return `••••${rawVal.slice(-4)}`
}

export function isSecretPlaceholder(val) {
  return typeof val === 'string' && val.startsWith(SECRET_PLACEHOLDER_PREFIX) && val.endsWith('}')
}

export function makeSecretPlaceholder(serverName, scope, key) {
  return `\${secret:${serverName}.${scope}.${key}}`
}

function validateKeyValueMap(rawMap, keyRegex, errorCode, label) {
  if (rawMap === undefined || rawMap === null) {
    return { ok: true, value: {} }
  }
  if (!isPlainObject(rawMap) || hasForbiddenObjectKeys(rawMap)) {
    return { ok: false, errorCode, message: agentMessage('agent.mcp.mapMustBeObject', { label }) }
  }
  const clean = {}
  const entries = Object.entries(rawMap)
  if (entries.length > 64) {
    return { ok: false, errorCode, message: agentMessage('agent.mcp.mapLimit', { label, limit: 64 }) }
  }
  for (const [k, v] of entries) {
    const trimmedKey = k.trim()
    if (!keyRegex.test(trimmedKey)) {
      return { ok: false, errorCode, message: agentMessage('agent.mcp.mapKeyInvalid', { label, key: k }) }
    }
    if (typeof v !== 'string' || v.length > 4096 || hasControlCharacters(v)) {
      return { ok: false, errorCode, message: agentMessage('agent.mcp.mapValueInvalid', { label, key: k }) }
    }
    clean[trimmedKey] = v
  }
  return { ok: true, value: clean }
}

export function validateMcpDefinitionInput(payload, fallbackName = undefined) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: MCP_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.http.invalidJsonObject'),
    }
  }

  const rawName = payload.newName !== undefined ? payload.newName : payload.name ?? fallbackName
  const nameCheck = validateLibraryItemName(rawName)
  if (!nameCheck.ok) return nameCheck

  const transport = payload.transport === 'http' ? 'http' : payload.transport === 'stdio' ? 'stdio' : null
  if (!transport) {
    return {
      ok: false,
      errorCode: MCP_ERROR_CODES.INVALID_TRANSPORT,
      message: agentMessage('agent.mcp.transportInvalid'),
    }
  }

  const description = typeof payload.description === 'string' ? payload.description.trim().slice(0, 500) : ''

  let command = null
  let args = []
  let url = null

  if (transport === 'stdio') {
    if (typeof payload.command !== 'string' || !payload.command.trim() || payload.command.trim().length > 512 || hasControlCharacters(payload.command)) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.INVALID_COMMAND,
        message: agentMessage('agent.mcp.commandRequired'),
      }
    }
    command = payload.command.trim()

    if (payload.args !== undefined) {
      if (!Array.isArray(payload.args) || payload.args.length > 64) {
        return {
          ok: false,
          errorCode: MCP_ERROR_CODES.INVALID_ARGS,
          message: agentMessage('agent.mcp.argsMustBeArray'),
        }
      }
      for (const item of payload.args) {
        if (typeof item !== 'string' || item.length > 1024 || hasControlCharacters(item)) {
          return {
            ok: false,
            errorCode: MCP_ERROR_CODES.INVALID_ARGS,
            message: agentMessage('agent.mcp.argsItemInvalid'),
          }
        }
        args.push(item)
      }
    }
  } else {
    if (typeof payload.url !== 'string' || !payload.url.trim()) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.INVALID_URL,
        message: agentMessage('agent.mcp.urlRequired'),
      }
    }
    try {
      const parsedUrl = new URL(payload.url.trim())
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error('bad protocol')
      }
      url = parsedUrl.toString()
    } catch {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.INVALID_URL,
        message: agentMessage('agent.mcp.urlInvalid'),
      }
    }
  }

  const envCheck = validateKeyValueMap(payload.env, ENV_KEY_REGEX, MCP_ERROR_CODES.INVALID_ENV, agentMessage('agent.mcp.envLabel'))
  if (!envCheck.ok) return envCheck

  const headersCheck = validateKeyValueMap(
    payload.headers,
    HEADER_KEY_REGEX,
    MCP_ERROR_CODES.INVALID_HEADERS,
    agentMessage('agent.mcp.headersLabel'),
  )
  if (!headersCheck.ok) return headersCheck

  const secretEnvCheck = validateKeyValueMap(
    payload.secretEnv,
    ENV_KEY_REGEX,
    MCP_ERROR_CODES.INVALID_ENV,
    agentMessage('agent.mcp.secretEnvLabel'),
  )
  if (!secretEnvCheck.ok) return secretEnvCheck

  const secretHeadersCheck = validateKeyValueMap(
    payload.secretHeaders,
    HEADER_KEY_REGEX,
    MCP_ERROR_CODES.INVALID_HEADERS,
    agentMessage('agent.mcp.secretHeadersLabel'),
  )
  if (!secretHeadersCheck.ok) return secretHeadersCheck

  return {
    ok: true,
    value: {
      name: nameCheck.value,
      description,
      transport,
      command,
      args,
      url,
      env: envCheck.value,
      headers: headersCheck.value,
      secretEnv: secretEnvCheck.value,
      secretHeaders: secretHeadersCheck.value,
    },
  }
}
