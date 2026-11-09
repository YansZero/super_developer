import { agentMessage } from './requestI18n.mjs'
import { verifyLoopbackRequestSecurity } from './providerHttpServer.mjs'
import { createSpecDocumentStore } from './specDocumentStore.mjs'

const MAX_BODY_BYTES = 8 * 1024

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const contentType = req.headers?.['content-type']?.split(';')[0]?.trim().toLowerCase()
    if (contentType !== 'application/json') {
      resolve({ ok: false, status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: agentMessage('agent.http.contentType') })
      return
    }
    const chunks = []
    let totalBytes = 0
    let settled = false
    const fail = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    req.on('data', (chunk) => {
      if (settled) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buffer.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        fail({ ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: agentMessage('agent.spec.requestTooLarge') })
        req.resume?.()
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (settled) return
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value) || ['__proto__', 'constructor', 'prototype'].some((key) => Object.hasOwn(value, key))) {
          fail({ ok: false, status: 400, code: 'INVALID_JSON', message: agentMessage('agent.spec.requestMustBeJsonObject') })
          return
        }
        fail({ ok: true, value })
      } catch {
        fail({ ok: false, status: 400, code: 'INVALID_JSON', message: agentMessage('agent.spec.cannotParseJson') })
      }
    })
    req.on('error', () => fail({ ok: false, status: 400, code: 'REQUEST_STREAM_ERROR', message: agentMessage('agent.spec.readRequestFailed') }))
  })
}

export function createSpecFilesApiHandler(options = {}) {
  const store = options.store || createSpecDocumentStore()
  return async function handleSpecFilesRequest(req, res, next) {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    if (pathname !== '/api/local-agent/spec/list' && pathname !== '/api/local-agent/spec/read') {
      if (typeof next === 'function') return next()
      return sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: agentMessage('agent.spec.endpointNotFound') })
    }
    const security = verifyLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, { ok: false, code: security.errorCode, message: security.message })
      return
    }
    if ((req.method || 'GET').toUpperCase() !== 'POST') {
      sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: agentMessage('agent.spec.postOnly') })
      return
    }
    const body = await readJsonBody(req)
    if (!body.ok) {
      sendJson(res, body.status, { ok: false, code: body.code, message: body.message })
      return
    }
    const expectedKeys = pathname.endsWith('/list') ? ['projectPath'] : ['projectPath', 'fileName']
    const keys = Object.keys(body.value).sort()
    if (keys.length !== expectedKeys.length || expectedKeys.some((key) => !keys.includes(key))) {
      sendJson(res, 400, { ok: false, code: 'INVALID_SPEC_REQUEST', message: agentMessage('agent.spec.invalidFields') })
      return
    }
    try {
      if (pathname.endsWith('/list')) {
        const files = store.list(body.value.projectPath)
        sendJson(res, 200, { ok: true, files })
        return
      }
      const document = store.read(body.value.projectPath, body.value.fileName)
      sendJson(res, 200, { ok: true, document })
    } catch (error) {
      const notFound = error && typeof error === 'object' && error.code === 'ENOENT'
      sendJson(res, notFound ? 404 : 400, {
        ok: false,
        code: notFound ? 'SPEC_DOCUMENT_NOT_FOUND' : 'SPEC_DOCUMENT_UNAVAILABLE',
        message: notFound ? agentMessage('agent.spec.specFileNotFound') : error instanceof Error ? error.message : agentMessage('agent.spec.readFailed'),
      })
    }
  }
}
