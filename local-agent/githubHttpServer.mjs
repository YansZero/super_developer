import { agentMessage } from './requestI18n.mjs'
import crypto from 'node:crypto'
import {
  readBoundedGitHubJsonBody,
  sendJson,
  verifyGitHubLoopbackRequestSecurity,
} from './githubHttpSecurity.mjs'
export { isAllowedLoopbackHost, isAllowedLoopbackOrigin, isLoopbackSocketAddress, verifyGitHubLoopbackRequestSecurity } from './githubHttpSecurity.mjs'
export { startLoopbackGitHubServer } from './githubLoopbackServer.mjs'
import {
  GITHUB_DEVICE_VERIFICATION_URI,
  GITHUB_ERROR_CODES,
  GITHUB_REQUIRED_SCOPE,
  SLOW_DOWN_INCREMENT_SECONDS,
  validateGitHubDeviceFlowSessionInput,
  validateGitHubDeviceFlowStartInput,
  validateProjectIdParam,
} from './githubContracts.mjs'
import { createOsKeyringAdapter } from './githubKeyring.mjs'
import { createGitHubStorage } from './githubStorage.mjs'
import { createHttpsGitHubTransport } from './githubTransport.mjs'
import { createGitHubSnapshotBuilder } from './githubSnapshot.mjs'

export function createGitHubApiHandler(options = {}) {
  const storage =
    options.storage || createGitHubStorage({ configFilePath: options.configFilePath })
  const keyring = options.keyring || createOsKeyringAdapter(options.keyringOptions)
  const transport = options.transport || createHttpsGitHubTransport(options.transportOptions)
  const nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now()

  let activeDeviceFlow = null
  let lastTerminalStatus = 'disconnected'

  function expireActiveFlowIfNeeded() {
    if (!activeDeviceFlow) return
    if (nowFn() >= activeDeviceFlow.expiresAtMs) {
      activeDeviceFlow = null
      lastTerminalStatus = 'expired'
      keyring.deleteDeviceCode()
    }
  }

  const buildGitHubSnapshot = createGitHubSnapshotBuilder({
    keyring, storage, nowFn, expireActiveFlowIfNeeded,
    getActiveDeviceFlow: () => activeDeviceFlow,
    getLastTerminalStatus: () => lastTerminalStatus,
  })

  return async function handleGitHubApiRequest(req, res, next) {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    if (pathname !== '/api/local-agent/github' && !pathname.startsWith('/api/local-agent/github/')) {
      if (typeof next === 'function') {
        next()
        return
      }
      sendJson(res, 404, { ok: false, errorCode: 'NOT_FOUND', message: agentMessage('agent.http.notFound') })
      return
    }

    const security = verifyGitHubLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, {
        ok: false,
        errorCode: security.errorCode,
        message: security.message,
      })
      return
    }

    const method = (req.method || 'GET').toUpperCase()

    if (method === 'GET' && pathname === '/api/local-agent/github') {
      sendJson(res, 200, { ok: true, github: buildGitHubSnapshot() })
      return
    }

    if (method === 'PUT' && pathname === '/api/local-agent/github/config') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, false)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      const saved = storage.saveClientId(bodyCheck.value)
      if (!saved.ok) {
        sendJson(res, 400, saved)
        return
      }
      sendJson(res, 200, { ok: true, github: buildGitHubSnapshot() })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/device-flow/start') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, true)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      const startCheck = validateGitHubDeviceFlowStartInput(bodyCheck.value)
      if (!startCheck.ok) {
        sendJson(res, 400, startCheck)
        return
      }
      const keyringCheck = keyring.isAvailable()
      if (!keyringCheck.ok) {
        sendJson(res, 400, {
          ok: false,
          errorCode: keyringCheck.errorCode,
          message: keyringCheck.message,
        })
        return
      }
      const persisted = storage.getPersistedState()
      const effectiveClientId = startCheck.value.clientId || persisted.clientId
      if (!effectiveClientId) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.CLIENT_ID_NOT_CONFIGURED,
          message: agentMessage('agent.github.saveClientIdFirst'),
        })
        return
      }
      if (startCheck.value.clientId) {
        const saveRes = storage.saveClientId({ clientId: startCheck.value.clientId })
        if (!saveRes.ok) {
          sendJson(res, 400, saveRes)
          return
        }
      }
      const deviceRes = await transport.requestDeviceCode({
        clientId: effectiveClientId,
        scope: GITHUB_REQUIRED_SCOPE,
      })
      if (!deviceRes.ok) {
        sendJson(res, 400, {
          ok: false,
          errorCode: deviceRes.errorCode,
          message: deviceRes.message,
        })
        return
      }
      const storeDeviceCode = keyring.setDeviceCode(deviceRes.deviceCode)
      if (!storeDeviceCode.ok) {
        sendJson(res, 400, {
          ok: false,
          errorCode: storeDeviceCode.errorCode,
          message: storeDeviceCode.message,
        })
        return
      }
      const nowMs = nowFn()
      activeDeviceFlow = {
        sessionId: crypto.randomBytes(24).toString('hex'),
        clientId: effectiveClientId,
        userCode: deviceRes.userCode,
        verificationUri: GITHUB_DEVICE_VERIFICATION_URI,
        intervalSeconds: deviceRes.intervalSeconds,
        startedAtMs: nowMs,
        expiresAtMs: nowMs + deviceRes.expiresInSeconds * 1000,
        lastPollAtMs: null,
        pollingAuthorized: false,
      }
      lastTerminalStatus = 'disconnected'
      sendJson(res, 200, { ok: true, github: buildGitHubSnapshot() })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/device-flow/authorize') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, false)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      const sessionCheck = validateGitHubDeviceFlowSessionInput(bodyCheck.value)
      if (!sessionCheck.ok) {
        sendJson(res, 400, sessionCheck)
        return
      }
      expireActiveFlowIfNeeded()
      if (!activeDeviceFlow) {
        sendJson(res, 400, {
          ok: false,
          errorCode:
            lastTerminalStatus === 'expired'
              ? GITHUB_ERROR_CODES.DEVICE_FLOW_EXPIRED
              : GITHUB_ERROR_CODES.DEVICE_FLOW_NOT_STARTED,
          message:
            lastTerminalStatus === 'expired'
              ? agentMessage('agent.github.deviceFlowExpired')
              : agentMessage('agent.github.deviceFlowNotRunning'),
        })
        return
      }
      if (activeDeviceFlow.sessionId !== sessionCheck.value.sessionId) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.DEVICE_FLOW_SESSION_MISMATCH,
          message: agentMessage('agent.github.sessionIdMismatchRetry'),
        })
        return
      }
      activeDeviceFlow.pollingAuthorized = true
      sendJson(res, 200, {
        ok: true,
        verificationUri: GITHUB_DEVICE_VERIFICATION_URI,
        github: buildGitHubSnapshot(),
      })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/device-flow/poll') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, false)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      const sessionCheck = validateGitHubDeviceFlowSessionInput(bodyCheck.value)
      if (!sessionCheck.ok) {
        sendJson(res, 400, sessionCheck)
        return
      }
      expireActiveFlowIfNeeded()
      if (!activeDeviceFlow) {
        if (lastTerminalStatus === 'expired') {
          sendJson(res, 200, {
            ok: true,
            pollOutcome: 'expired',
            github: buildGitHubSnapshot(),
          })
          return
        }
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.DEVICE_FLOW_NOT_STARTED,
          message: agentMessage('agent.github.deviceFlowNotRunning'),
        })
        return
      }
      if (activeDeviceFlow.sessionId !== sessionCheck.value.sessionId) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.DEVICE_FLOW_SESSION_MISMATCH,
          message: agentMessage('agent.github.sessionIdMismatch'),
        })
        return
      }
      if (!activeDeviceFlow.pollingAuthorized) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.DEVICE_FLOW_POLL_NOT_AUTHORIZED,
          message: agentMessage('agent.github.clickAuthFirst'),
        })
        return
      }
      const nowMs = nowFn()
      if (
        activeDeviceFlow.lastPollAtMs !== null &&
        nowMs - activeDeviceFlow.lastPollAtMs < activeDeviceFlow.intervalSeconds * 1000
      ) {
        const waitMs =
          activeDeviceFlow.intervalSeconds * 1000 - (nowMs - activeDeviceFlow.lastPollAtMs)
        sendJson(res, 200, {
          ok: true,
          pollOutcome: 'rate_limited',
          retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
          github: buildGitHubSnapshot(),
        })
        return
      }

      const deviceCodeRes = keyring.getDeviceCode()
      if (!deviceCodeRes.ok) {
        sendJson(res, 400, {
          ok: false,
          errorCode: deviceCodeRes.errorCode,
          message: deviceCodeRes.message,
        })
        return
      }
      if (!deviceCodeRes.value) {
        activeDeviceFlow = null
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.DEVICE_FLOW_NOT_STARTED,
          message: agentMessage('agent.github.keyringSessionNotFound'),
        })
        return
      }

      activeDeviceFlow.lastPollAtMs = nowMs
      const pollRes = await transport.pollDeviceAccessToken({
        clientId: activeDeviceFlow.clientId,
        deviceCode: deviceCodeRes.value,
      })

      if (!pollRes.ok) {
        if (pollRes.errorCode === GITHUB_ERROR_CODES.INVALID_OAUTH_SCOPE) {
          keyring.deleteDeviceCode()
          keyring.deleteAccessToken()
          activeDeviceFlow = null
          lastTerminalStatus = 'denied'
        }
        sendJson(res, 400, {
          ok: false,
          errorCode: pollRes.errorCode,
          message: pollRes.message,
        })
        return
      }
      if (pollRes.outcome === 'pending') {
        sendJson(res, 200, { ok: true, pollOutcome: 'pending', github: buildGitHubSnapshot() })
        return
      }
      if (pollRes.outcome === 'slow_down') {
        const nextInterval = pollRes.intervalSeconds
          ? Math.max(
              activeDeviceFlow.intervalSeconds + SLOW_DOWN_INCREMENT_SECONDS,
              pollRes.intervalSeconds,
            )
          : activeDeviceFlow.intervalSeconds + SLOW_DOWN_INCREMENT_SECONDS
        activeDeviceFlow.intervalSeconds = Math.min(nextInterval, 120)
        sendJson(res, 200, {
          ok: true,
          pollOutcome: 'slow_down',
          intervalSeconds: activeDeviceFlow.intervalSeconds,
          github: buildGitHubSnapshot(),
        })
        return
      }
      if (pollRes.outcome === 'expired') {
        keyring.deleteDeviceCode()
        activeDeviceFlow = null
        lastTerminalStatus = 'expired'
        sendJson(res, 200, { ok: true, pollOutcome: 'expired', github: buildGitHubSnapshot() })
        return
      }
      if (pollRes.outcome === 'denied') {
        keyring.deleteDeviceCode()
        activeDeviceFlow = null
        lastTerminalStatus = 'denied'
        sendJson(res, 200, { ok: true, pollOutcome: 'denied', github: buildGitHubSnapshot() })
        return
      }

      const saveTokenRes = keyring.setAccessToken(pollRes.accessToken)
      keyring.deleteDeviceCode()
      if (!saveTokenRes.ok) {
        activeDeviceFlow = null
        sendJson(res, 400, {
          ok: false,
          errorCode: saveTokenRes.errorCode,
          message: saveTokenRes.message,
        })
        return
      }

      const userVerify = await transport.fetchAuthenticatedUser({
        accessToken: pollRes.accessToken,
      })
      if (!userVerify.ok) {
        keyring.deleteAccessToken()
        activeDeviceFlow = null
        sendJson(res, 400, {
          ok: false,
          errorCode: userVerify.errorCode,
          message: userVerify.message,
        })
        return
      }

      const reposFetch = await transport.fetchPublicRepositories({
        accessToken: pollRes.accessToken,
      })
      if (!reposFetch.ok) {
        keyring.deleteAccessToken()
        activeDeviceFlow = null
        sendJson(res, 400, {
          ok: false,
          errorCode: reposFetch.errorCode,
          message: reposFetch.message,
        })
        return
      }

      const currentClientId = activeDeviceFlow.clientId
      activeDeviceFlow = null
      lastTerminalStatus = 'disconnected'

      const persistedRes = storage.saveConnectedAccountAndRepos({
        clientId: currentClientId,
        account: userVerify.account,
        repositories: reposFetch.repositories,
      })
      if (!persistedRes.ok) {
        keyring.deleteAccessToken()
        sendJson(res, 400, persistedRes)
        return
      }
      sendJson(res, 200, { ok: true, pollOutcome: 'connected', github: buildGitHubSnapshot() })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/device-flow/cancel') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, true)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      if (Object.keys(bodyCheck.value).length > 0) {
        const sessionCheck = validateGitHubDeviceFlowSessionInput(bodyCheck.value)
        if (!sessionCheck.ok) {
          sendJson(res, 400, sessionCheck)
          return
        }
      }
      keyring.deleteDeviceCode()
      activeDeviceFlow = null
      lastTerminalStatus = 'disconnected'
      sendJson(res, 200, { ok: true, github: buildGitHubSnapshot() })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/repos/refresh') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, true)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      if (Object.keys(bodyCheck.value).length > 0) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
          message: agentMessage('agent.github.refreshNoExtraFields'),
        })
        return
      }
      const tokenRes = keyring.getAccessToken()
      if (!tokenRes.ok) {
        sendJson(res, 400, { ok: false, errorCode: tokenRes.errorCode, message: tokenRes.message })
        return
      }
      if (!tokenRes.value) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.GITHUB_NOT_CONNECTED,
          message: agentMessage('agent.github.notConnectedOrNoToken'),
        })
        return
      }
      const userVerify = await transport.fetchAuthenticatedUser({ accessToken: tokenRes.value })
      if (!userVerify.ok) {
        sendJson(res, 400, { ok: false, errorCode: userVerify.errorCode, message: userVerify.message })
        return
      }
      const reposFetch = await transport.fetchPublicRepositories({ accessToken: tokenRes.value })
      if (!reposFetch.ok) {
        sendJson(res, 400, { ok: false, errorCode: reposFetch.errorCode, message: reposFetch.message })
        return
      }
      storage.saveConnectedAccountAndRepos({
        account: userVerify.account,
        repositories: reposFetch.repositories,
      })
      sendJson(res, 200, { ok: true, github: buildGitHubSnapshot() })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/mappings') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, false)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      const tokenRes = keyring.getAccessToken()
      if (!tokenRes.ok) {
        sendJson(res, 400, { ok: false, errorCode: tokenRes.errorCode, message: tokenRes.message })
        return
      }
      if (!tokenRes.value) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.GITHUB_NOT_CONNECTED,
          message: agentMessage('agent.github.connectFirst'),
        })
        return
      }
      const mapped = storage.upsertProjectMapping(bodyCheck.value)
      if (!mapped.ok) {
        const status = mapped.errorCode === GITHUB_ERROR_CODES.REPO_NOT_FOUND ? 404 : 400
        sendJson(res, status, mapped)
        return
      }
      sendJson(res, 200, { ok: true, mapping: mapped.mapping, github: buildGitHubSnapshot() })
      return
    }

    const mappingItemMatch = /^\/api\/local-agent\/github\/mappings\/([^/]+?)$/.exec(pathname)
    if (mappingItemMatch && method === 'DELETE') {
      let decodedProjectId
      try {
        decodedProjectId = decodeURIComponent(mappingItemMatch[1] || '')
      } catch {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.INVALID_PROJECT_ID,
          message: agentMessage('agent.github.projectIdEncodingInvalid'),
        })
        return
      }
      const projCheck = validateProjectIdParam(decodedProjectId)
      if (!projCheck.ok) {
        sendJson(res, 400, projCheck)
        return
      }
      const removed = storage.removeProjectMapping(projCheck.value)
      if (!removed.ok) {
        const status = removed.errorCode === GITHUB_ERROR_CODES.MAPPING_NOT_FOUND ? 404 : 400
        sendJson(res, status, removed)
        return
      }
      sendJson(res, 200, {
        ok: true,
        removedProjectId: removed.removedProjectId,
        github: buildGitHubSnapshot(),
      })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/github/disconnect') {
      const bodyCheck = await readBoundedGitHubJsonBody(req, true)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      if (Object.keys(bodyCheck.value).length > 0) {
        sendJson(res, 400, {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
          message: agentMessage('agent.github.disconnectNoExtraFields'),
        })
        return
      }
      const delAccess = keyring.deleteAccessToken()
      keyring.deleteDeviceCode()
      if (!delAccess.ok) {
        sendJson(res, 400, { ok: false, errorCode: delAccess.errorCode, message: delAccess.message })
        return
      }
      activeDeviceFlow = null
      lastTerminalStatus = 'disconnected'
      storage.clearConnectionState()
      sendJson(res, 200, { ok: true, github: buildGitHubSnapshot() })
      return
    }

    sendJson(res, 404, {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: agentMessage('agent.github.endpointNotFound'),
    })
  }
}
