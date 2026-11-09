import { agentMessage } from './requestI18n.mjs'
export const MAX_GITHUB_HTTP_BODY_BYTES = 4096
export const MAX_GITHUB_CLIENT_ID_LENGTH = 128
export const MIN_GITHUB_CLIENT_ID_LENGTH = 4
export const GITHUB_REQUIRED_SCOPE = 'repo'
export const GITHUB_DEVICE_VERIFICATION_URI = 'https://github.com/login/device'
export const GITHUB_OAUTH_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
export const DEFAULT_DEVICE_FLOW_INTERVAL_SECONDS = 5
export const DEFAULT_DEVICE_FLOW_EXPIRES_IN_SECONDS = 900
export const SLOW_DOWN_INCREMENT_SECONDS = 5
export const MAX_PUBLIC_REPOS_COUNT = 100
export const MAX_PROJECT_MAPPINGS_COUNT = 50

export const GITHUB_ALLOWED_ENDPOINTS = Object.freeze({
  deviceCode: Object.freeze({
    key: 'deviceCode',
    method: 'POST',
    url: 'https://github.com/login/device/code',
    host: 'github.com',
    pathname: '/login/device/code',
    search: '',
  }),
  accessToken: Object.freeze({
    key: 'accessToken',
    method: 'POST',
    url: 'https://github.com/login/oauth/access_token',
    host: 'github.com',
    pathname: '/login/oauth/access_token',
    search: '',
  }),
  userProfile: Object.freeze({
    key: 'userProfile',
    method: 'GET',
    url: 'https://api.github.com/user',
    host: 'api.github.com',
    pathname: '/user',
    search: '',
  }),
  repos: Object.freeze({
    key: 'repos',
    method: 'GET',
    url: 'https://api.github.com/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
    host: 'api.github.com',
    pathname: '/user/repos',
    search:
      '?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
  }),
  publicRepos: Object.freeze({
    key: 'publicRepos',
    method: 'GET',
    url: 'https://api.github.com/user/repos?visibility=public&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
    host: 'api.github.com',
    pathname: '/user/repos',
    search:
      '?visibility=public&affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
  }),
})

export const GITHUB_ERROR_CODES = Object.freeze({
  INVALID_JSON_OBJECT: 'INVALID_JSON_OBJECT',
  INVALID_JSON: 'INVALID_JSON',
  EMPTY_BODY: 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNKNOWN_FIELD_REJECTED: 'UNKNOWN_FIELD_REJECTED',
  INVALID_CLIENT_ID: 'INVALID_CLIENT_ID',
  CLIENT_ID_NOT_CONFIGURED: 'CLIENT_ID_NOT_CONFIGURED',
  INVALID_OAUTH_SCOPE: 'INVALID_OAUTH_SCOPE',
  DISALLOWED_GITHUB_ENDPOINT: 'DISALLOWED_GITHUB_ENDPOINT',
  INVALID_VERIFICATION_URI: 'INVALID_VERIFICATION_URI',
  REDIRECT_FORBIDDEN: 'REDIRECT_FORBIDDEN',
  KEYRING_UNAVAILABLE: 'KEYRING_UNAVAILABLE',
  KEYRING_WRITE_FAILED: 'KEYRING_WRITE_FAILED',
  KEYRING_DELETE_FAILED: 'KEYRING_DELETE_FAILED',
  KEYRING_TOKEN_MISSING: 'KEYRING_TOKEN_MISSING',
  DEVICE_FLOW_NOT_STARTED: 'DEVICE_FLOW_NOT_STARTED',
  DEVICE_FLOW_SESSION_MISMATCH: 'DEVICE_FLOW_SESSION_MISMATCH',
  DEVICE_FLOW_POLL_NOT_AUTHORIZED: 'DEVICE_FLOW_POLL_NOT_AUTHORIZED',
  DEVICE_FLOW_RATE_LIMITED: 'DEVICE_FLOW_RATE_LIMITED',
  DEVICE_FLOW_PENDING: 'DEVICE_FLOW_PENDING',
  DEVICE_FLOW_SLOW_DOWN: 'DEVICE_FLOW_SLOW_DOWN',
  DEVICE_FLOW_EXPIRED: 'DEVICE_FLOW_EXPIRED',
  DEVICE_FLOW_DENIED: 'DEVICE_FLOW_DENIED',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  GITHUB_USER_VERIFICATION_FAILED: 'GITHUB_USER_VERIFICATION_FAILED',
  GITHUB_NOT_CONNECTED: 'GITHUB_NOT_CONNECTED',
  INVALID_PROJECT_ID: 'INVALID_PROJECT_ID',
  INVALID_REPO_ID: 'INVALID_REPO_ID',
  REPO_NOT_FOUND: 'REPO_NOT_FOUND',
  PRIVATE_REPO_FORBIDDEN: 'PRIVATE_REPO_FORBIDDEN',
  MAPPING_NOT_FOUND: 'MAPPING_NOT_FOUND',
})

const CLIENT_ID_PATTERN = /^[A-Za-z0-9._-]{4,128}$/
const SESSION_ID_PATTERN = /^[a-f0-9]{32,64}$/
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,80}$/
const SAFE_GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)?\/?$/
const SAFE_AVATAR_URL_PATTERN = /^https:\/\/[a-z0-9.-]*githubusercontent\.com\/[^\s"'<>]+$/i

function fail(errorCode, message) {
  return { ok: false, errorCode, message }
}

export function hasControlCharacters(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

export function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function hasForbiddenObjectKeys(obj) {
  return Object.getOwnPropertyNames(obj).some(
    (key) => key === '__proto__' || key === 'constructor' || key === 'prototype',
  )
}

export function validateGitHubClientId(rawClientId) {
  if (typeof rawClientId !== 'string') {
    return fail(GITHUB_ERROR_CODES.INVALID_CLIENT_ID, agentMessage('agent.github.clientIdMustBeString'))
  }
  const trimmed = rawClientId.trim()
  if (trimmed.length < MIN_GITHUB_CLIENT_ID_LENGTH || trimmed.length > MAX_GITHUB_CLIENT_ID_LENGTH) {
    return fail(
      GITHUB_ERROR_CODES.INVALID_CLIENT_ID,
      agentMessage('agent.github.clientIdLength', { min: MIN_GITHUB_CLIENT_ID_LENGTH, max: MAX_GITHUB_CLIENT_ID_LENGTH }),
    )
  }
  if (hasControlCharacters(trimmed) || !CLIENT_ID_PATTERN.test(trimmed)) {
    return fail(
      GITHUB_ERROR_CODES.INVALID_CLIENT_ID,
      agentMessage('agent.github.clientIdFormat'),
    )
  }
  return { ok: true, value: trimmed }
}

export function validateGitHubScope(rawScope) {
  if (typeof rawScope !== 'string') {
    return fail(GITHUB_ERROR_CODES.INVALID_OAUTH_SCOPE, agentMessage('agent.github.scopeFormat'))
  }
  const tokens = rawScope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (tokens.length === 0) {
    return fail(GITHUB_ERROR_CODES.INVALID_OAUTH_SCOPE, agentMessage('agent.github.scopeEmpty'))
  }
  const allowed = new Set(['repo', 'read:user'])
  const hasDisallowed = tokens.some((token) => !allowed.has(token))
  if (hasDisallowed) {
    return fail(
      GITHUB_ERROR_CODES.INVALID_OAUTH_SCOPE,
      agentMessage('agent.github.scopeDisallowed'),
    )
  }
  return { ok: true, value: tokens.join(' ') }
}

export function validateVerificationUri(rawUri) {
  if (typeof rawUri !== 'string') {
    return fail(GITHUB_ERROR_CODES.INVALID_VERIFICATION_URI, agentMessage('agent.github.verificationUriInvalid'))
  }
  const trimmed = rawUri.trim().replace(/\/+$/, '')
  if (trimmed !== GITHUB_DEVICE_VERIFICATION_URI) {
    return fail(
      GITHUB_ERROR_CODES.INVALID_VERIFICATION_URI,
      agentMessage('agent.github.verificationUriDisallowed', { uri: GITHUB_DEVICE_VERIFICATION_URI }),
    )
  }
  return { ok: true, value: GITHUB_DEVICE_VERIFICATION_URI }
}

export function validateAllowedGitHubEndpoint(method, rawUrl) {
  if (typeof method !== 'string' || typeof rawUrl !== 'string') {
    return fail(GITHUB_ERROR_CODES.DISALLOWED_GITHUB_ENDPOINT, agentMessage('agent.github.endpointInvalid'))
  }
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return fail(GITHUB_ERROR_CODES.DISALLOWED_GITHUB_ENDPOINT, agentMessage('agent.github.endpointUnresolvable'))
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.hash !== ''
  ) {
    return fail(GITHUB_ERROR_CODES.DISALLOWED_GITHUB_ENDPOINT, agentMessage('agent.github.endpointHttpsOnly'))
  }
  const upperMethod = method.trim().toUpperCase()
  const matched = Object.values(GITHUB_ALLOWED_ENDPOINTS).find(
    (spec) =>
      spec.method === upperMethod &&
      spec.host === parsed.hostname &&
      spec.pathname === parsed.pathname &&
      spec.search === parsed.search,
  )
  if (!matched) {
    return fail(
      GITHUB_ERROR_CODES.DISALLOWED_GITHUB_ENDPOINT,
      agentMessage('agent.github.endpointDisallowed'),
    )
  }
  return { ok: true, endpoint: matched }
}

export function validateGitHubConfigUpdateInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return fail(GITHUB_ERROR_CODES.INVALID_JSON_OBJECT, agentMessage('agent.http.invalidJsonObject'))
  }
  const allowedKeys = new Set(['clientId'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.unknownConfigField', { key }))
    }
  }
  const clientCheck = validateGitHubClientId(payload.clientId)
  if (!clientCheck.ok) return clientCheck
  return { ok: true, value: { clientId: clientCheck.value } }
}

export function validateGitHubDeviceFlowStartInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return fail(GITHUB_ERROR_CODES.INVALID_JSON_OBJECT, agentMessage('agent.http.invalidJsonObject'))
  }
  const allowedKeys = new Set(['clientId', 'scope'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.unknownField', { key }))
    }
  }
  if (payload.scope !== undefined) {
    const scopeCheck = validateGitHubScope(payload.scope)
    if (!scopeCheck.ok) return scopeCheck
  }
  let validatedClientId = undefined
  if (payload.clientId !== undefined) {
    const clientCheck = validateGitHubClientId(payload.clientId)
    if (!clientCheck.ok) return clientCheck
    validatedClientId = clientCheck.value
  }
  return {
    ok: true,
    value: {
      ...(validatedClientId !== undefined ? { clientId: validatedClientId } : {}),
      scope: GITHUB_REQUIRED_SCOPE,
    },
  }
}

export function validateGitHubDeviceFlowSessionInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return fail(GITHUB_ERROR_CODES.INVALID_JSON_OBJECT, agentMessage('agent.http.invalidJsonObject'))
  }
  const allowedKeys = new Set(['sessionId'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.unknownField', { key }))
    }
  }
  if (typeof payload.sessionId !== 'string' || !SESSION_ID_PATTERN.test(payload.sessionId.trim())) {
    return fail(
      GITHUB_ERROR_CODES.DEVICE_FLOW_SESSION_MISMATCH,
      agentMessage('agent.github.sessionIdMismatch'),
    )
  }
  return { ok: true, value: { sessionId: payload.sessionId.trim() } }
}

export function validateProjectIdParam(rawProjectId) {
  if (typeof rawProjectId !== 'string') {
    return fail(GITHUB_ERROR_CODES.INVALID_PROJECT_ID, agentMessage('agent.github.projectIdMustBeString'))
  }
  const trimmed = rawProjectId.trim()
  if (!PROJECT_ID_PATTERN.test(trimmed)) {
    return fail(GITHUB_ERROR_CODES.INVALID_PROJECT_ID, agentMessage('agent.github.projectIdInvalid'))
  }
  return { ok: true, value: trimmed }
}

export function validateGitHubRepoMappingInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return fail(GITHUB_ERROR_CODES.INVALID_JSON_OBJECT, agentMessage('agent.http.invalidJsonObject'))
  }
  const allowedKeys = new Set(['projectId', 'projectName', 'folderDisplayName', 'repoId'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.unknownField', { key }))
    }
  }
  const projectIdCheck = validateProjectIdParam(payload.projectId)
  if (!projectIdCheck.ok) return projectIdCheck

  if (
    typeof payload.projectName !== 'string' ||
    payload.projectName.trim().length === 0 ||
    payload.projectName.trim().length > 120 ||
    hasControlCharacters(payload.projectName)
  ) {
    return fail(GITHUB_ERROR_CODES.INVALID_PROJECT_ID, agentMessage('agent.github.projectNameInvalid'))
  }
  if (
    typeof payload.folderDisplayName !== 'string' ||
    payload.folderDisplayName.trim().length === 0 ||
    payload.folderDisplayName.trim().length > 240 ||
    hasControlCharacters(payload.folderDisplayName)
  ) {
    return fail(GITHUB_ERROR_CODES.INVALID_PROJECT_ID, agentMessage('agent.github.projectFolderInvalid'))
  }
  if (typeof payload.repoId !== 'number' || !Number.isInteger(payload.repoId) || payload.repoId <= 0) {
    return fail(GITHUB_ERROR_CODES.INVALID_REPO_ID, agentMessage('agent.github.repoIdInvalid'))
  }
  return {
    ok: true,
    value: {
      projectId: projectIdCheck.value,
      projectName: payload.projectName.trim(),
      folderDisplayName: payload.folderDisplayName.trim(),
      repoId: payload.repoId,
    },
  }
}

export function sanitizePublicGitHubAccount(rawUser) {
  if (!isPlainObject(rawUser)) return null
  const id =
    typeof rawUser.id === 'number' && Number.isInteger(rawUser.id) && rawUser.id > 0
      ? rawUser.id
      : null
  const login =
    typeof rawUser.login === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(rawUser.login.trim())
      ? rawUser.login.trim()
      : null
  if (!id || !login) return null

  const name =
    typeof rawUser.name === 'string' && !hasControlCharacters(rawUser.name)
      ? rawUser.name.trim().slice(0, 80) || null
      : null
  const htmlUrlCandidate =
    typeof rawUser.html_url === 'string'
      ? rawUser.html_url.trim()
      : typeof rawUser.htmlUrl === 'string'
        ? rawUser.htmlUrl.trim()
        : `https://github.com/${login}`
  const htmlUrl = SAFE_GITHUB_URL_PATTERN.test(htmlUrlCandidate)
    ? htmlUrlCandidate
    : `https://github.com/${login}`
  const avatarCandidate =
    typeof rawUser.avatar_url === 'string'
      ? rawUser.avatar_url.trim()
      : typeof rawUser.avatarUrl === 'string'
        ? rawUser.avatarUrl.trim()
        : null
  const avatarUrl =
    avatarCandidate && SAFE_AVATAR_URL_PATTERN.test(avatarCandidate) ? avatarCandidate : null
  const rawCount = rawUser.public_repos ?? rawUser.publicReposCount
  const publicReposCount =
    typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : 0

  return { id, login, name, htmlUrl, avatarUrl, publicReposCount }
}

export function sanitizePublicGitHubRepositories(rawRepos) {
  if (!Array.isArray(rawRepos)) return []
  const sanitized = []
  for (const item of rawRepos) {
    if (!isPlainObject(item)) continue
    const isPrivate = Boolean(
      item.private === true ||
        item.isPrivate === true ||
        (typeof item.visibility === 'string' && item.visibility.toLowerCase() === 'private'),
    )
    const id =
      typeof item.id === 'number' && Number.isInteger(item.id) && item.id > 0 ? item.id : null
    const name =
      typeof item.name === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(item.name.trim())
        ? item.name.trim()
        : null
    const rawFullName =
      typeof item.full_name === 'string'
        ? item.full_name.trim()
        : typeof item.fullName === 'string'
          ? item.fullName.trim()
          : null
    const fullName =
      rawFullName && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(rawFullName) ? rawFullName : null
    if (!id || !name || !fullName) continue

    const htmlUrlCandidate =
      typeof item.html_url === 'string'
        ? item.html_url.trim()
        : typeof item.htmlUrl === 'string'
          ? item.htmlUrl.trim()
          : `https://github.com/${fullName}`
    const htmlUrl = SAFE_GITHUB_URL_PATTERN.test(htmlUrlCandidate)
      ? htmlUrlCandidate
      : `https://github.com/${fullName}`
    const description =
      typeof item.description === 'string' && !hasControlCharacters(item.description)
        ? item.description.trim().slice(0, 200) || null
        : null
    const language =
      typeof item.language === 'string' && !hasControlCharacters(item.language)
        ? item.language.trim().slice(0, 48) || null
        : null
    const rawDefaultBranch =
      typeof item.default_branch === 'string'
        ? item.default_branch.trim()
        : typeof item.defaultBranch === 'string'
          ? item.defaultBranch.trim()
          : 'main'
    const defaultBranch =
      !hasControlCharacters(rawDefaultBranch) && rawDefaultBranch.length > 0
        ? rawDefaultBranch.slice(0, 64)
        : 'main'
    const rawUpdatedAt =
      typeof item.updated_at === 'string'
        ? item.updated_at.trim()
        : typeof item.updatedAt === 'string'
          ? item.updatedAt.trim()
          : null
    const updatedAt =
      rawUpdatedAt && !hasControlCharacters(rawUpdatedAt) ? rawUpdatedAt.slice(0, 40) : null

    sanitized.push({
      id,
      name,
      fullName,
      htmlUrl,
      description,
      language,
      defaultBranch,
      updatedAt,
      isPrivate,
    })
    if (sanitized.length >= MAX_PUBLIC_REPOS_COUNT) break
  }
  return sanitized
}

export const sanitizeGitHubRepositories = sanitizePublicGitHubRepositories

