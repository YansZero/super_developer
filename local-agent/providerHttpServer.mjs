import { agentMessage } from './requestI18n.mjs'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import {
  MAX_JSON_BODY_BYTES,
  hasForbiddenObjectKeys,
  isPlainObject,
  validateProviderIdParam,
} from './providerContracts.mjs'
import { initiateProviderLogin, probeProvider } from './providerAuth.mjs'
import { getProviderModelCatalog } from './providerModelCatalog.mjs'
import { createProviderStorage, resolveDefaultProviderConfigPath, writeFileAtomicallyRestricted } from './providerStorage.mjs'

const LOOPBACK_HOST_REGEX = /^(127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i
const LOOPBACK_ORIGIN_REGEX = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i

export function isLoopbackSocketAddress(remoteAddress) {
  if (typeof remoteAddress !== 'string') {
    return false
  }
  const normalized = remoteAddress.trim().toLowerCase()
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  )
}

export function isAllowedLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader.trim()) {
    return false
  }
  return LOOPBACK_HOST_REGEX.test(hostHeader.trim())
}

export function isAllowedLoopbackOrigin(originHeader) {
  if (originHeader === undefined || originHeader === null || originHeader === '') {
    return true
  }
  if (typeof originHeader !== 'string') {
    return false
  }
  return LOOPBACK_ORIGIN_REGEX.test(originHeader.trim())
}

export function verifyLoopbackRequestSecurity(req) {
  const remoteAddress = req.socket?.remoteAddress
  if (!isLoopbackSocketAddress(remoteAddress)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'NON_LOOPBACK_SOCKET',
      message: agentMessage('agent.http.provider.loopback'),
    }
  }

  const hostHeader = req.headers?.host
  if (!isAllowedLoopbackHost(hostHeader)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'FORBIDDEN_HOST',
      message: agentMessage('agent.http.hostDenied'),
    }
  }

  const originHeader = req.headers?.origin
  if (!isAllowedLoopbackOrigin(originHeader)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'FORBIDDEN_ORIGIN',
      message: agentMessage('agent.http.provider.origin'),
    }
  }

  const secFetchSite = req.headers?.['sec-fetch-site']
  if (typeof secFetchSite === 'string' && secFetchSite.toLowerCase() === 'cross-site') {
    return {
      ok: false,
      status: 403,
      errorCode: 'CROSS_SITE_FORBIDDEN',
      message: agentMessage('agent.http.crossSiteDenied'),
    }
  }

  return { ok: true }
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(body)
}

function hasJsonContentType(contentTypeHeader) {
  if (typeof contentTypeHeader !== 'string') {
    return false
  }
  const mediaType = contentTypeHeader.split(';')[0]?.trim().toLowerCase() ?? ''
  return mediaType === 'application/json'
}

function readBoundedJsonBody(req, allowEmpty = false) {
  return new Promise((resolve) => {
    const contentType = req.headers?.['content-type']
    const chunks = []
    let totalBytes = 0
    let aborted = false

    req.on('data', (chunk) => {
      if (aborted) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buf.byteLength
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        aborted = true
        resolve({
          ok: false,
          status: 413,
          errorCode: 'PAYLOAD_TOO_LARGE',
          message: agentMessage('agent.http.bodyLimit', { max: MAX_JSON_BODY_BYTES }),
        })
      } else {
        chunks.push(buf)
      }
    })

    req.on('end', () => {
      if (aborted) return
      if (!hasJsonContentType(contentType)) {
        resolve({
          ok: false,
          status: 415,
          errorCode: 'UNSUPPORTED_MEDIA_TYPE',
          message: agentMessage('agent.http.contentType'),
        })
        return
      }

      if (totalBytes === 0) {
        if (allowEmpty) {
          resolve({ ok: true, value: {} })
          return
        }
        resolve({
          ok: false,
          status: 400,
          errorCode: 'EMPTY_BODY',
          message: agentMessage('agent.http.emptyBody'),
        })
        return
      }

      const rawText = Buffer.concat(chunks).toString('utf8')
      if (rawText.trim() === '') {
        if (allowEmpty) {
          resolve({ ok: true, value: {} })
          return
        }
        resolve({
          ok: false,
          status: 400,
          errorCode: 'EMPTY_BODY',
          message: agentMessage('agent.http.emptyBody'),
        })
        return
      }

      try {
        const parsed = JSON.parse(rawText)
        if (!isPlainObject(parsed) || hasForbiddenObjectKeys(parsed)) {
          resolve({
            ok: false,
            status: 400,
            errorCode: 'INVALID_JSON_OBJECT',
            message: agentMessage('agent.http.unsafeJsonObject'),
          })
          return
        }
        resolve({ ok: true, value: parsed })
      } catch {
        resolve({
          ok: false,
          status: 400,
          errorCode: 'INVALID_JSON',
          message: agentMessage('agent.http.invalidJson'),
        })
      }
    })

    req.on('error', () => {
      if (aborted) return
      resolve({
        ok: false,
        status: 400,
        errorCode: 'REQUEST_STREAM_ERROR',
        message: agentMessage('agent.http.readFailed'),
      })
    })
  })
}

export function createProviderApiHandler(options = {}) {
  const storage = options.storage || createProviderStorage({ configFilePath: options.configFilePath })
  const adapterOptions = options.adapterOptions || {}

  return async function handleProviderApiRequest(req, res, next) {
    const rawUrl = req.url || '/'
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1')
    const pathname = parsedUrl.pathname

    if (!pathname.startsWith('/api/local-agent')) {
      if (typeof next === 'function') {
        next()
        return
      }
      sendJson(res, 404, {
        ok: false,
        errorCode: 'NOT_FOUND',
        message: agentMessage('agent.http.notFound'),
      })
      return
    }

    const security = verifyLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, {
        ok: false,
        errorCode: security.errorCode,
        message: security.message,
      })
      return
    }

    const method = (req.method || 'GET').toUpperCase()

    if (pathname === '/api/local-agent/notification-settings' && (method === 'GET' || method === 'PUT')) {
      const settingsPath = path.join(path.dirname(storage.configFilePath || resolveDefaultProviderConfigPath()), 'notifications.config.json')
      try {
        if (method === 'GET') {
          let settings = null
          try {
            const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
            if (typeof saved?.inApp !== 'boolean' || typeof saved?.desktop !== 'boolean') {
              return sendJson(res, 500, { ok: false, errorCode: 'INVALID_NOTIFICATION_SETTINGS' })
            }
            settings = { inApp: saved.inApp, desktop: saved.desktop }
          }
          catch (error) { if (error.code !== 'ENOENT') throw error }
          sendJson(res, 200, { ok: true, settings })
          return
        }
        const body = await readBoundedJsonBody(req)
        if (!body.ok) return sendJson(res, body.status, body)
        const { inApp, desktop } = body.value
        if (typeof inApp !== 'boolean' || typeof desktop !== 'boolean') {
          return sendJson(res, 400, { ok: false, errorCode: 'INVALID_NOTIFICATION_SETTINGS' })
        }
        const settings = { inApp, desktop }
        writeFileAtomicallyRestricted(settingsPath, JSON.stringify(settings, null, 2) + '\n')
        sendJson(res, 200, { ok: true, settings })
      } catch {
        sendJson(res, 500, { ok: false, errorCode: 'NOTIFICATION_SETTINGS_UNAVAILABLE' })
      }
      return
    }

    if (method === 'GET' && pathname === '/api/local-agent/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'super-developer-local-agent',
        module: 'providers',
        timestamp: new Date().toISOString(),
      })
      return
    }

    if (method === 'GET' && pathname === '/api/local-agent/providers') {
      sendJson(res, 200, {
        ok: true,
        providers: storage.listProviders(),
      })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/providers/probe-all') {
      const bodyCheck = await readBoundedJsonBody(req, true)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }
      if (Object.keys(bodyCheck.value).length > 0) {
        sendJson(res, 400, {
          ok: false,
          errorCode: 'UNKNOWN_FIELD_REJECTED',
          message: agentMessage('agent.provider.probeAllNoExtraFields'),
        })
        return
      }

      const currentProviders = storage.listProviders()
      for (const provider of currentProviders) {
        const probeResult = probeProvider(provider, adapterOptions)
        storage.saveProbeResult(provider.id, probeResult)
      }
      sendJson(res, 200, {
        ok: true,
        providers: storage.listProviders(),
      })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/providers') {
      const bodyCheck = await readBoundedJsonBody(req, false)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }

      const created = storage.addCustomProvider(bodyCheck.value)
      if (!created.ok) {
        sendJson(res, 400, created)
        return
      }
      sendJson(res, 201, {
        ok: true,
        provider: created.provider,
        providers: storage.listProviders(),
      })
      return
    }

    const itemMatch = /^\/api\/local-agent\/providers\/([^/]+?)(?:\/(probe|login|models))?$/.exec(
      pathname,
    )
    if (itemMatch) {
      let decodedId
      try {
        decodedId = decodeURIComponent(itemMatch[1] || '')
      } catch {
        sendJson(res, 400, {
          ok: false,
          errorCode: 'INVALID_PROVIDER_ID',
          message: agentMessage('agent.provider.providerIdEncodingInvalid'),
        })
        return
      }

      const idCheck = validateProviderIdParam(decodedId)
      if (!idCheck.ok) {
        sendJson(res, 400, idCheck)
        return
      }
      const providerId = idCheck.value
      const subAction = itemMatch[2] || null

      if (subAction === 'models' && method === 'GET') {
        const targetProvider = storage.getProviderById(providerId)
        if (!targetProvider) {
          sendJson(res, 404, {
            ok: false,
            errorCode: 'PROVIDER_NOT_FOUND',
            message: agentMessage('agent.provider.providerNotFound'),
          })
          return
        }

        sendJson(res, 200, {
          ok: true,
          catalog: getProviderModelCatalog(targetProvider, adapterOptions),
        })
        return
      }

      if (!subAction && method === 'PUT') {
        const bodyCheck = await readBoundedJsonBody(req, false)
        if (!bodyCheck.ok) {
          sendJson(res, bodyCheck.status, bodyCheck)
          return
        }
        const updateResult = storage.updateProviderConfig(providerId, bodyCheck.value)
        if (!updateResult.ok) {
          const status = updateResult.errorCode === 'PROVIDER_NOT_FOUND' ? 404 : 400
          sendJson(res, status, updateResult)
          return
        }
        sendJson(res, 200, {
          ok: true,
          provider: updateResult.provider,
          providers: storage.listProviders(),
        })
        return
      }

      if (!subAction && method === 'DELETE') {
        const removeResult = storage.removeCustomProvider(providerId)
        if (!removeResult.ok) {
          const status = removeResult.errorCode === 'PROVIDER_NOT_FOUND' ? 404 : 400
          sendJson(res, status, removeResult)
          return
        }
        sendJson(res, 200, {
          ok: true,
          removedId: removeResult.removedId,
          providers: removeResult.providers,
        })
        return
      }

      if (subAction === 'probe' && method === 'POST') {
        const bodyCheck = await readBoundedJsonBody(req, true)
        if (!bodyCheck.ok) {
          sendJson(res, bodyCheck.status, bodyCheck)
          return
        }
        if (Object.keys(bodyCheck.value).length > 0) {
          sendJson(res, 400, {
            ok: false,
            errorCode: 'UNKNOWN_FIELD_REJECTED',
            message: agentMessage('agent.provider.probeNoExtraArgs'),
          })
          return
        }

        const targetProvider = storage.getProviderById(providerId)
        if (!targetProvider) {
          sendJson(res, 404, {
            ok: false,
            errorCode: 'PROVIDER_NOT_FOUND',
            message: agentMessage('agent.provider.providerNotFound'),
          })
          return
        }

        const probeResult = probeProvider(targetProvider, adapterOptions)
        const updatedProvider = storage.saveProbeResult(providerId, probeResult)
        sendJson(res, 200, {
          ok: true,
          provider: updatedProvider,
          providers: storage.listProviders(),
        })
        return
      }

      if (subAction === 'login' && method === 'POST') {
        const bodyCheck = await readBoundedJsonBody(req, true)
        if (!bodyCheck.ok) {
          sendJson(res, bodyCheck.status, bodyCheck)
          return
        }
        if (Object.keys(bodyCheck.value).length > 0) {
          sendJson(res, 400, {
            ok: false,
            errorCode: 'UNKNOWN_FIELD_REJECTED',
            message: agentMessage('agent.provider.loginNoExtraFields'),
          })
          return
        }

        const targetProvider = storage.getProviderById(providerId)
        if (!targetProvider) {
          sendJson(res, 404, {
            ok: false,
            errorCode: 'PROVIDER_NOT_FOUND',
            message: agentMessage('agent.provider.providerNotFound'),
          })
          return
        }

        const loginResult = initiateProviderLogin(targetProvider, adapterOptions)
        if (loginResult.probeResult) {
          storage.saveProbeResult(providerId, loginResult.probeResult)
        }

        const status = loginResult.ok ? 200 : 400
        sendJson(res, status, {
          ok: loginResult.ok,
          login: {
            outcome: loginResult.outcome,
            errorCode: loginResult.errorCode,
            commandHint: loginResult.commandHint,
            message: loginResult.message,
          },
          provider: storage.getProviderById(providerId),
          providers: storage.listProviders(),
        })
        return
      }
    }

    sendJson(res, 404, {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: agentMessage('agent.provider.apiEndpointNotFound'),
    })
  }
}

export function startLoopbackProviderServer(options = {}) {
  const host = options.host || '127.0.0.1'
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new Error('Local Agent server may only bind to loopback (127.0.0.1 / ::1).')
  }
  const port = typeof options.port === 'number' ? options.port : 4317
  const handler = createProviderApiHandler(options)
  const server = http.createServer((req, res) => {
    void handler(req, res)
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      const addr = server.address()
      const boundPort = typeof addr === 'object' && addr ? addr.port : port
      resolve({
        server,
        host,
        port: boundPort,
        close: () =>
          new Promise((resClose, rejClose) => {
            server.close((err) => (err ? rejClose(err) : resClose()))
          }),
      })
    })
  })
}
