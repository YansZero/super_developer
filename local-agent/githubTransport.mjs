import { agentMessage } from './requestI18n.mjs'
import https from 'node:https'
import {
  DEFAULT_DEVICE_FLOW_EXPIRES_IN_SECONDS,
  DEFAULT_DEVICE_FLOW_INTERVAL_SECONDS,
  GITHUB_ALLOWED_ENDPOINTS,
  GITHUB_DEVICE_VERIFICATION_URI,
  GITHUB_ERROR_CODES,
  GITHUB_OAUTH_GRANT_TYPE,
  GITHUB_REQUIRED_SCOPE,
  isPlainObject,
  sanitizePublicGitHubAccount,
  sanitizePublicGitHubRepositories,
  validateAllowedGitHubEndpoint,
  validateGitHubClientId,
  validateGitHubScope,
  validateVerificationUri,
} from './githubContracts.mjs'

const MAX_UPSTREAM_RESPONSE_BYTES = 512 * 1024
const DEFAULT_HTTPS_TIMEOUT_MS = 8000

function fail(errorCode, message, status = 400) {
  return { ok: false, status, errorCode, message }
}

function validateOutboundPayloadForEndpoint(endpointKey, bodyObj) {
  if (endpointKey === 'deviceCode') {
    if (!isPlainObject(bodyObj)) {
      return fail(GITHUB_ERROR_CODES.INVALID_JSON_OBJECT, agentMessage('agent.github.deviceCodeRequestInvalid'))
    }
    const keys = Object.keys(bodyObj)
    if (keys.length !== 2 || !keys.includes('client_id') || !keys.includes('scope')) {
      return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.deviceCodeFieldsOnly'))
    }
    const clientCheck = validateGitHubClientId(bodyObj.client_id)
    if (!clientCheck.ok) return clientCheck
    const scopeCheck = validateGitHubScope(bodyObj.scope)
    if (!scopeCheck.ok) return scopeCheck
    return { ok: true }
  }

  if (endpointKey === 'accessToken') {
    if (!isPlainObject(bodyObj)) {
      return fail(GITHUB_ERROR_CODES.INVALID_JSON_OBJECT, agentMessage('agent.github.accessTokenRequestInvalid'))
    }
    const keys = Object.keys(bodyObj)
    if (
      keys.length !== 3 ||
      !keys.includes('client_id') ||
      !keys.includes('device_code') ||
      !keys.includes('grant_type')
    ) {
      return fail(
        GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
        agentMessage('agent.github.accessTokenFieldsOnly'),
      )
    }
    const clientCheck = validateGitHubClientId(bodyObj.client_id)
    if (!clientCheck.ok) return clientCheck
    if (
      typeof bodyObj.device_code !== 'string' ||
      bodyObj.device_code.trim().length < 4 ||
      bodyObj.device_code.trim().length > 256
    ) {
      return fail(GITHUB_ERROR_CODES.DEVICE_FLOW_NOT_STARTED, agentMessage('agent.github.deviceCodeMissing'))
    }
    if (bodyObj.grant_type !== GITHUB_OAUTH_GRANT_TYPE) {
      return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.grantTypeDisallowed'))
    }
    return { ok: true }
  }

  if (bodyObj !== undefined && bodyObj !== null) {
    return fail(GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED, agentMessage('agent.github.noBodyForGet'))
  }
  return { ok: true }
}

function lowLevelHttpsJsonRequest({ endpoint, headers, body, timeoutMs = DEFAULT_HTTPS_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const serializedBody = body !== undefined && body !== null ? JSON.stringify(body) : null
    const requestHeaders = {
      Accept: 'application/json',
      'User-Agent': 'Super-Developer-Local-Agent/0.1',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(headers || {}),
      ...(serializedBody !== null
        ? {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(serializedBody, 'utf8')),
          }
        : {}),
    }

    const req = https.request(
      {
        protocol: 'https:',
        hostname: endpoint.host,
        port: 443,
        method: endpoint.method,
        path: `${endpoint.pathname}${endpoint.search}`,
        headers: requestHeaders,
        rejectUnauthorized: true,
        agent: false,
        timeout: timeoutMs,
      },
      (res) => {
        const statusCode = res.statusCode || 0
        if (statusCode >= 300 && statusCode < 400) {
          res.resume()
          resolve(
            fail(
              GITHUB_ERROR_CODES.REDIRECT_FORBIDDEN,
              agentMessage('agent.github.redirectDisallowed'),
              statusCode,
            ),
          )
          return
        }

        const chunks = []
        let totalBytes = 0
        let aborted = false

        res.on('data', (chunk) => {
          if (aborted) return
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
          totalBytes += buf.byteLength
          if (totalBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
            aborted = true
            req.destroy()
            resolve(
              fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.responseTooLarge'), 502),
            )
          } else {
            chunks.push(buf)
          }
        })

        res.on('end', () => {
          if (aborted) return
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            resolve({ ok: true, status: statusCode, data: parsed })
          } catch {
            resolve(
              fail(
                GITHUB_ERROR_CODES.GITHUB_API_ERROR,
                agentMessage('agent.github.unexpectedJson'),
                statusCode || 502,
              ),
            )
          }
        })
      },
    )

    req.on('timeout', () => {
      req.destroy()
      resolve(fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.timeout'), 504))
    })
    req.on('error', () => {
      resolve(
        fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.httpsFailed'), 502),
      )
    })

    if (serializedBody !== null) req.write(serializedBody)
    req.end()
  })
}

export function createGitHubTransportWithCaller(callerFn) {
  async function requestJson({ method, url, headers, body }) {
    const endpointCheck = validateAllowedGitHubEndpoint(method, url)
    if (!endpointCheck.ok) {
      return fail(endpointCheck.errorCode, endpointCheck.message, 400)
    }
    const payloadCheck = validateOutboundPayloadForEndpoint(endpointCheck.endpoint.key, body)
    if (!payloadCheck.ok) {
      return fail(payloadCheck.errorCode, payloadCheck.message, 400)
    }

    const rawResponse = await callerFn({
      endpoint: endpointCheck.endpoint,
      method: endpointCheck.endpoint.method,
      url: endpointCheck.endpoint.url,
      headers: headers || {},
      body,
    })

    if (!rawResponse || typeof rawResponse !== 'object') {
      return fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.noResult'), 502)
    }
    if (typeof rawResponse.status === 'number' && rawResponse.status >= 300 && rawResponse.status < 400) {
      return fail(
        GITHUB_ERROR_CODES.REDIRECT_FORBIDDEN,
        agentMessage('agent.github.redirectDisallowed'),
        rawResponse.status,
      )
    }
    if (!rawResponse.ok) {
      return fail(
        rawResponse.errorCode || GITHUB_ERROR_CODES.GITHUB_API_ERROR,
        rawResponse.message || agentMessage('agent.github.officialCallFailed'),
        typeof rawResponse.status === 'number' ? rawResponse.status : 502,
      )
    }
    return {
      ok: true,
      status: typeof rawResponse.status === 'number' ? rawResponse.status : 200,
      data: rawResponse.data,
    }
  }

  async function requestDeviceCode({ clientId, scope = GITHUB_REQUIRED_SCOPE }) {
    const scopeCheck = validateGitHubScope(scope)
    if (!scopeCheck.ok) return scopeCheck

    const res = await requestJson({
      method: 'POST',
      url: GITHUB_ALLOWED_ENDPOINTS.deviceCode.url,
      body: { client_id: clientId, scope: scopeCheck.value },
    })
    if (!res.ok) return res

    const data = res.data
    if (!isPlainObject(data) || typeof data.error === 'string') {
      return fail(
        GITHUB_ERROR_CODES.GITHUB_API_ERROR,
        agentMessage('agent.github.initFailed'),
      )
    }
    const deviceCode =
      typeof data.device_code === 'string' && data.device_code.trim().length >= 4
        ? data.device_code.trim()
        : null
    const userCode =
      typeof data.user_code === 'string' && /^[A-Za-z0-9-]{4,32}$/.test(data.user_code.trim())
        ? data.user_code.trim()
        : null
    const uriCheck = validateVerificationUri(
      data.verification_uri ?? GITHUB_DEVICE_VERIFICATION_URI,
    )
    if (!deviceCode || !userCode) {
      return fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.deviceFlowMissingCode'))
    }
    if (!uriCheck.ok) return uriCheck

    const intervalSeconds =
      typeof data.interval === 'number' && Number.isFinite(data.interval) && data.interval >= 1
        ? Math.min(Math.floor(data.interval), 120)
        : DEFAULT_DEVICE_FLOW_INTERVAL_SECONDS
    const expiresInSeconds =
      typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) && data.expires_in >= 30
        ? Math.min(Math.floor(data.expires_in), 3600)
        : DEFAULT_DEVICE_FLOW_EXPIRES_IN_SECONDS

    return {
      ok: true,
      deviceCode,
      userCode,
      verificationUri: uriCheck.value,
      intervalSeconds,
      expiresInSeconds,
    }
  }

  async function pollDeviceAccessToken({ clientId, deviceCode }) {
    const res = await requestJson({
      method: 'POST',
      url: GITHUB_ALLOWED_ENDPOINTS.accessToken.url,
      body: {
        client_id: clientId,
        device_code: deviceCode,
        grant_type: GITHUB_OAUTH_GRANT_TYPE,
      },
    })
    if (!res.ok) return res

    const data = res.data
    if (!isPlainObject(data)) {
      return fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.pollResponseInvalid'))
    }
    if (typeof data.error === 'string') {
      const errCode = data.error.trim()
      if (errCode === 'authorization_pending') return { ok: true, outcome: 'pending' }
      if (errCode === 'slow_down') {
        const nextInterval =
          typeof data.interval === 'number' && Number.isFinite(data.interval) && data.interval >= 1
            ? Math.min(Math.floor(data.interval), 120)
            : null
        return { ok: true, outcome: 'slow_down', intervalSeconds: nextInterval }
      }
      if (errCode === 'expired_token') return { ok: true, outcome: 'expired' }
      if (errCode === 'access_denied') return { ok: true, outcome: 'denied' }
      return fail(
        GITHUB_ERROR_CODES.GITHUB_API_ERROR,
        agentMessage('agent.github.pollError'),
      )
    }

    const accessToken =
      typeof data.access_token === 'string' && data.access_token.trim().length >= 8
        ? data.access_token.trim()
        : null
    if (!accessToken) {
      return fail(GITHUB_ERROR_CODES.GITHUB_API_ERROR, agentMessage('agent.github.tokenMissingInResponse'))
    }

    const grantedScope =
      typeof data.scope === 'string' && data.scope.trim() !== ''
        ? data.scope.trim()
        : GITHUB_REQUIRED_SCOPE
    const scopeCheck = validateGitHubScope(grantedScope)
    if (!scopeCheck.ok) return scopeCheck

    return { ok: true, outcome: 'authorized', accessToken, scope: scopeCheck.value }
  }

  async function fetchAuthenticatedUser({ accessToken }) {
    if (typeof accessToken !== 'string' || accessToken.trim().length < 4) {
      return fail(GITHUB_ERROR_CODES.KEYRING_TOKEN_MISSING, agentMessage('agent.github.tokenMissing'))
    }
    const res = await requestJson({
      method: 'GET',
      url: GITHUB_ALLOWED_ENDPOINTS.userProfile.url,
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
    })
    if (!res.ok) {
      return fail(
        res.errorCode === GITHUB_ERROR_CODES.REDIRECT_FORBIDDEN
          ? GITHUB_ERROR_CODES.REDIRECT_FORBIDDEN
          : GITHUB_ERROR_CODES.GITHUB_USER_VERIFICATION_FAILED,
        agentMessage('agent.github.verifyUserFailed'),
      )
    }
    if (res.status !== 200) {
      return fail(
        GITHUB_ERROR_CODES.GITHUB_USER_VERIFICATION_FAILED,
        agentMessage('agent.github.verifyUserHttp', { status: res.status }),
      )
    }
    const account = sanitizePublicGitHubAccount(res.data)
    if (!account) {
      return fail(
        GITHUB_ERROR_CODES.GITHUB_USER_VERIFICATION_FAILED,
        agentMessage('agent.github.missingUserFields'),
      )
    }
    return { ok: true, account }
  }

  async function fetchPublicRepositories({ accessToken }) {
    if (typeof accessToken !== 'string' || accessToken.trim().length < 4) {
      return fail(GITHUB_ERROR_CODES.KEYRING_TOKEN_MISSING, agentMessage('agent.github.tokenMissing'))
    }
    const endpointUrl = GITHUB_ALLOWED_ENDPOINTS.repos?.url || GITHUB_ALLOWED_ENDPOINTS.publicRepos.url
    const res = await requestJson({
      method: 'GET',
      url: endpointUrl,
      headers: { Authorization: `Bearer ${accessToken.trim()}` },
    })
    if (!res.ok) {
      return fail(
        res.errorCode || GITHUB_ERROR_CODES.GITHUB_API_ERROR,
        res.message || agentMessage('agent.github.readReposFailed'),
      )
    }
    if (res.status !== 200 || !Array.isArray(res.data)) {
      return fail(
        GITHUB_ERROR_CODES.GITHUB_API_ERROR,
        agentMessage('agent.github.reposHttp', { status: res.status }),
      )
    }
    return { ok: true, repositories: sanitizePublicGitHubRepositories(res.data) }
  }

  return {
    requestJson,
    requestDeviceCode,
    pollDeviceAccessToken,
    fetchAuthenticatedUser,
    fetchPublicRepositories,
    fetchRepositories: fetchPublicRepositories,
  }
}

export function createHttpsGitHubTransport(options = {}) {
  return createGitHubTransportWithCaller((callSpec) =>
    lowLevelHttpsJsonRequest({ ...callSpec, timeoutMs: options.timeoutMs }),
  )
}

