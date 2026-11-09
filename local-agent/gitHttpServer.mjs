import { agentMessage } from './requestI18n.mjs'
import {
  GIT_ERROR_CODES,
  MAX_GIT_HTTP_BODY_BYTES,
  validateBranchName,
  validateGitCommand,
} from './gitContracts.mjs'
import { createGitExecutor } from './gitExecutor.mjs'

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

export function verifyGitLoopbackRequestSecurity(req) {
  const remoteAddress = req.socket?.remoteAddress
  if (!isLoopbackSocketAddress(remoteAddress)) {
    return {
      ok: false,
      status: 403,
      errorCode: 'NON_LOOPBACK_SOCKET',
      message: agentMessage('agent.http.git.loopback'),
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
      message: agentMessage('agent.http.git.origin'),
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

function readBoundedJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let totalBytes = 0
    let aborted = false

    req.on('data', (chunk) => {
      if (aborted) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buf.byteLength
      if (totalBytes > MAX_GIT_HTTP_BODY_BYTES) {
        aborted = true
        resolve({
          ok: false,
          status: 413,
          errorCode: GIT_ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: agentMessage('agent.http.bodyLimit', { max: MAX_GIT_HTTP_BODY_BYTES }),
        })
      } else {
        chunks.push(buf)
      }
    })

    req.on('end', () => {
      if (aborted) return
      if (chunks.length === 0) {
        resolve({
          ok: false,
          status: 400,
          errorCode: GIT_ERROR_CODES.EMPTY_BODY,
          message: agentMessage('agent.http.emptyBody'),
        })
        return
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      try {
        const parsed = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          resolve({
            ok: false,
            status: 400,
            errorCode: GIT_ERROR_CODES.INVALID_JSON_OBJECT,
            message: agentMessage('agent.http.invalidJsonObject'),
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

    req.on('error', (err) => {
      if (aborted) return
      resolve({
        ok: false,
        status: 400,
        errorCode: 'REQUEST_STREAM_ERROR',
        message: err?.message || agentMessage('agent.http.readFailed'),
      })
    })
  })
}

export function createGitApiHandler(options = {}) {
  const executor = options.executor || createGitExecutor(options)

  return async function handleGitApiRequest(req, res, next) {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    if (pathname !== '/api/local-agent/git/execute') {
      if (typeof next === 'function') {
        next()
        return
      }
      sendJson(res, 404, { ok: false, errorCode: 'NOT_FOUND', message: agentMessage('agent.http.notFound') })
      return
    }

    const security = verifyGitLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, {
        ok: false,
        errorCode: security.errorCode,
        message: security.message,
      })
      return
    }

    const method = (req.method || 'GET').toUpperCase()
    if (method !== 'POST') {
      sendJson(res, 405, { ok: false, errorCode: 'METHOD_NOT_ALLOWED', message: agentMessage('agent.http.postOnly') })
      return
    }

    const bodyCheck = await readBoundedJsonBody(req)
    if (!bodyCheck.ok) {
      sendJson(res, bodyCheck.status, bodyCheck)
      return
    }

    const { command, projectPath, branch, filePath, files, commitMessage, isDemoFixture } = bodyCheck.value
    const cmdCheck = validateGitCommand(command)
    if (!cmdCheck.ok) {
      sendJson(res, 400, cmdCheck)
      return
    }

    const branchCheck = validateBranchName(branch)
    if (!branchCheck.ok) {
      sendJson(res, 400, branchCheck)
      return
    }

    const result = await executor.execute({
      command: cmdCheck.value,
      projectPath: typeof projectPath === 'string' ? projectPath : null,
      branch: branchCheck.value,
      filePath: typeof filePath === 'string' ? filePath : null,
      files: Array.isArray(files) ? files : null,
      commitMessage: typeof commitMessage === 'string' ? commitMessage : null,
      isDemoFixture: isDemoFixture === true,
    })

    sendJson(res, result.ok ? 200 : 400, result)
  }
}
