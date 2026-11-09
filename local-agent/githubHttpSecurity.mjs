import { agentMessage } from './requestI18n.mjs'
import {
  GITHUB_ERROR_CODES,
  MAX_GITHUB_HTTP_BODY_BYTES,
  hasForbiddenObjectKeys,
  isPlainObject,
} from './githubContracts.mjs'

const LOOPBACK_HOST_REGEX = /^(127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i
const LOOPBACK_ORIGIN_REGEX = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/i

export function isLoopbackSocketAddress(remoteAddress) {
  if (typeof remoteAddress !== 'string') return false
  const normalized = remoteAddress.trim().toLowerCase()
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  )
}

export function isAllowedLoopbackHost(hostHeader) {
  if (typeof hostHeader !== 'string' || !hostHeader.trim()) return false
  return LOOPBACK_HOST_REGEX.test(hostHeader.trim())
}

export function isAllowedLoopbackOrigin(originHeader) {
  if (originHeader === undefined || originHeader === null || originHeader === '') return true
  if (typeof originHeader !== 'string') return false
  return LOOPBACK_ORIGIN_REGEX.test(originHeader.trim())
}

export function verifyGitHubLoopbackRequestSecurity(req) {
  if (!isLoopbackSocketAddress(req.socket?.remoteAddress)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'NON_LOOPBACK_SOCKET',
      message: agentMessage('agent.http.github.loopback'),
    }
  }
  if (!isAllowedLoopbackHost(req.headers?.host)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'FORBIDDEN_HOST',
      message: agentMessage('agent.http.hostDenied'),
    }
  }
  if (!isAllowedLoopbackOrigin(req.headers?.origin)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'FORBIDDEN_ORIGIN',
      message: agentMessage('agent.http.github.origin'),
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

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(body)
}

function hasJsonContentType(contentTypeHeader) {
  if (typeof contentTypeHeader !== 'string') return false
  const mediaType = contentTypeHeader.split(';')[0]?.trim().toLowerCase() ?? ''
  return mediaType === 'application/json'
}

export function readBoundedGitHubJsonBody(req, allowEmpty = false) {
  return new Promise((resolve) => {
    const contentType = req.headers?.['content-type']
    const chunks = []
    let totalBytes = 0
    let aborted = false

    req.on('data', (chunk) => {
      if (aborted) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buf.byteLength
      if (totalBytes > MAX_GITHUB_HTTP_BODY_BYTES) {
        aborted = true
        resolve({
          ok: false,
          status: 413,
          errorCode: GITHUB_ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: agentMessage('agent.http.bodyLimit', { max: MAX_GITHUB_HTTP_BODY_BYTES }),
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
          errorCode: GITHUB_ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
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
          errorCode: GITHUB_ERROR_CODES.EMPTY_BODY,
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
          errorCode: GITHUB_ERROR_CODES.EMPTY_BODY,
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
            errorCode: GITHUB_ERROR_CODES.INVALID_JSON_OBJECT,
            message: agentMessage('agent.http.unsafeJsonObject'),
          })
          return
        }
        resolve({ ok: true, value: parsed })
      } catch {
        resolve({
          ok: false,
          status: 400,
          errorCode: GITHUB_ERROR_CODES.INVALID_JSON,
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
