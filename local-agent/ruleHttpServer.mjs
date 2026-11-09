import { agentMessage } from './requestI18n.mjs'
import http from 'node:http'
import {
  MAX_RULE_HTTP_BODY_BYTES,
  RULE_ERROR_CODES,
  hasForbiddenObjectKeys,
  isPlainObject,
  validateRuleIdParam,
} from './ruleContracts.mjs'
import { createRuleStorage } from './ruleStorage.mjs'

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

export function verifyRuleLoopbackRequestSecurity(req) {
  const remoteAddress = req.socket?.remoteAddress
  if (!isLoopbackSocketAddress(remoteAddress)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'NON_LOOPBACK_SOCKET',
      message: agentMessage('agent.http.rules.loopback'),
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
      message: agentMessage('agent.http.rules.origin'),
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

function readBoundedRuleJsonBody(req) {
  return new Promise((resolve) => {
    const contentType = req.headers?.['content-type']
    const chunks = []
    let totalBytes = 0
    let aborted = false

    req.on('data', (chunk) => {
      if (aborted) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buf.byteLength
      if (totalBytes > MAX_RULE_HTTP_BODY_BYTES) {
        aborted = true
        resolve({
          ok: false,
          status: 413,
          errorCode: RULE_ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: agentMessage('agent.http.bodyLimit', { max: MAX_RULE_HTTP_BODY_BYTES }),
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
          errorCode: RULE_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
          message: agentMessage('agent.http.contentType'),
        })
        return
      }

      if (totalBytes === 0) {
        resolve({
          ok: false,
          status: 400,
          errorCode: RULE_ERROR_CODES.EMPTY_BODY,
          message: agentMessage('agent.http.emptyBody'),
        })
        return
      }

      const rawText = Buffer.concat(chunks).toString('utf8')
      if (rawText.trim() === '') {
        resolve({
          ok: false,
          status: 400,
          errorCode: RULE_ERROR_CODES.EMPTY_BODY,
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
            errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
            message: agentMessage('agent.http.unsafeJsonObject'),
          })
          return
        }
        resolve({ ok: true, value: parsed })
      } catch {
        resolve({
          ok: false,
          status: 400,
          errorCode: RULE_ERROR_CODES.INVALID_JSON,
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

function mapStorageErrorStatus(errorCode) {
  if (errorCode === RULE_ERROR_CODES.RULE_NOT_FOUND) {
    return 404
  }
  if (errorCode === RULE_ERROR_CODES.RULE_FILE_TOO_LARGE) {
    return 413
  }
  return 400
}

export function createRuleApiHandler(options = {}) {
  const storage =
    options.storage || createRuleStorage({ configFilePath: options.configFilePath })

  return async function handleRuleApiRequest(req, res, next) {
    const rawUrl = req.url || '/'
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1')
    const pathname = parsedUrl.pathname

    if (
      pathname !== '/api/local-agent/rules' &&
      !pathname.startsWith('/api/local-agent/rules/')
    ) {
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

    const security = verifyRuleLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, {
        ok: false,
        errorCode: security.errorCode,
        message: security.message,
      })
      return
    }

    const method = (req.method || 'GET').toUpperCase()

    if (method === 'GET' && pathname === '/api/local-agent/rules') {
      sendJson(res, 200, {
        ok: true,
        rules: storage.listRules(),
      })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/rules') {
      const bodyCheck = await readBoundedRuleJsonBody(req)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }

      const created = storage.addRule(bodyCheck.value)
      if (!created.ok) {
        sendJson(res, mapStorageErrorStatus(created.errorCode), created)
        return
      }

      sendJson(res, 201, {
        ok: true,
        rule: created.rule,
        rules: created.rules,
      })
      return
    }

    if (method === 'POST' && pathname === '/api/local-agent/rules/reorder') {
      const bodyCheck = await readBoundedRuleJsonBody(req)
      if (!bodyCheck.ok) {
        sendJson(res, bodyCheck.status, bodyCheck)
        return
      }

      const reordered = storage.reorderRules(bodyCheck.value)
      if (!reordered.ok) {
        sendJson(res, mapStorageErrorStatus(reordered.errorCode), reordered)
        return
      }

      sendJson(res, 200, {
        ok: true,
        rules: reordered.rules,
      })
      return
    }

    const applicationMatch = /^\/api\/local-agent\/rules\/([^/]+?)\/application$/.exec(pathname)
    if (applicationMatch) {
      let decodedId
      try {
        decodedId = decodeURIComponent(applicationMatch[1] || '')
      } catch {
        sendJson(res, 400, {
          ok: false,
          errorCode: RULE_ERROR_CODES.INVALID_RULE_ID,
          message: agentMessage('agent.rule.ruleIdEncodingInvalid'),
        })
        return
      }
      if (method === 'GET') {
        const providerId = parsedUrl.searchParams.get('providerId') || ''
        const result = storage.getRuleApplication(decodedId, providerId)
        sendJson(res, result.ok ? 200 : mapStorageErrorStatus(result.errorCode), result)
        return
      }
      if (method === 'POST') {
        const bodyCheck = await readBoundedRuleJsonBody(req)
        if (!bodyCheck.ok) {
          sendJson(res, bodyCheck.status, bodyCheck)
          return
        }
        const result = storage.applyRule(decodedId, bodyCheck.value)
        sendJson(res, result.ok ? 200 : mapStorageErrorStatus(result.errorCode), result)
        return
      }
    }

    const itemMatch = /^\/api\/local-agent\/rules\/([^/]+?)$/.exec(pathname)
    if (itemMatch) {
      let decodedId
      try {
        decodedId = decodeURIComponent(itemMatch[1] || '')
      } catch {
        sendJson(res, 400, {
          ok: false,
          errorCode: RULE_ERROR_CODES.INVALID_RULE_ID,
          message: agentMessage('agent.rule.ruleIdEncodingInvalid'),
        })
        return
      }

      const idCheck = validateRuleIdParam(decodedId)
      if (!idCheck.ok) {
        sendJson(res, 400, idCheck)
        return
      }
      const ruleId = idCheck.value

      if (method === 'GET') {
        const rule = storage.getRuleById(ruleId)
        if (!rule) {
          sendJson(res, 404, {
            ok: false,
            errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
            message: agentMessage('agent.rule.notFound'),
          })
          return
        }
        sendJson(res, 200, {
          ok: true,
          rule,
          rules: storage.listRules(),
        })
        return
      }

      if (method === 'PUT') {
        const bodyCheck = await readBoundedRuleJsonBody(req)
        if (!bodyCheck.ok) {
          sendJson(res, bodyCheck.status, bodyCheck)
          return
        }

        const updated = storage.updateRule(ruleId, bodyCheck.value)
        if (!updated.ok) {
          sendJson(res, mapStorageErrorStatus(updated.errorCode), updated)
          return
        }

        sendJson(res, 200, {
          ok: true,
          rule: updated.rule,
          rules: updated.rules,
        })
        return
      }

      if (method === 'DELETE') {
        const removed = storage.removeRule(ruleId)
        if (!removed.ok) {
          sendJson(res, mapStorageErrorStatus(removed.errorCode), removed)
          return
        }

        sendJson(res, 200, {
          ok: true,
          removedId: removed.removedId,
          rules: removed.rules,
        })
        return
      }
    }

    sendJson(res, 404, {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: agentMessage('agent.rule.endpointNotFound'),
    })
  }
}

export function startLoopbackRuleServer(options = {}) {
  const host = options.host || '127.0.0.1'
  if (host !== '127.0.0.1' && host !== '::1' && host !== 'localhost') {
    throw new Error('Local Agent rule server may only bind to loopback (127.0.0.1 / ::1).')
  }
  const port = typeof options.port === 'number' ? options.port : 4318
  const handler = createRuleApiHandler(options)
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
