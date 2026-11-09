import { agentMessage } from './requestI18n.mjs'
import { createDispatchRunner } from './dispatchRunner.mjs'
import { verifyLoopbackRequestSecurity } from './providerHttpServer.mjs'

const MAX_BODY_BYTES = 36 * 1024 * 1024
const JOB_ID_PATTERN = /^\d{6}_TASK_[0-9a-f-]{36}$/i

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
    let finished = false
    req.on('data', (chunk) => {
      if (finished) return
      totalBytes += chunk.length
      if (totalBytes > MAX_BODY_BYTES) {
        finished = true
        resolve({ ok: false, status: 413, code: 'PAYLOAD_TOO_LARGE', message: agentMessage('agent.dispatch.bodyTooLarge') })
        req.resume()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (finished) return
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!value || typeof value !== 'object' || Array.isArray(value) || ['__proto__', 'constructor', 'prototype'].some((key) => Object.hasOwn(value, key))) {
          resolve({ ok: false, status: 400, code: 'INVALID_JSON', message: agentMessage('agent.dispatch.invalidBody') })
          return
        }
        resolve({ ok: true, value })
      } catch {
        resolve({ ok: false, status: 400, code: 'INVALID_JSON', message: agentMessage('agent.dispatch.invalidJson') })
      }
    })
    req.on('error', () => {
      if (!finished) resolve({ ok: false, status: 400, code: 'REQUEST_STREAM_ERROR', message: agentMessage('agent.dispatch.bodyReadFailed') })
    })
  })
}

export function createDispatchApiHandler(options = {}) {
  const pendingSnapshots = new Map()
  const persistenceTimers = new Map()
  const backendPort = Number(options.backendPort ?? process.env.SD_BFF_PORT ?? 4318)
  const persist = (snapshot) => {
    pendingSnapshots.set(snapshot.id, snapshot)
    if (persistenceTimers.has(snapshot.id)) return
    const save = async () => {
      const latest = pendingSnapshots.get(snapshot.id)
      if (!latest) return
      try {
        const response = await fetch(`http://127.0.0.1:${backendPort}/api/jobs/${encodeURIComponent(latest.id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ status: ['queued', 'running'].includes(latest.status) ? 'RUNNING' : latest.status === 'succeeded' ? 'SUCCESS' : 'FAILED', tasks: latest.tasks, events: latest.events, outputMarkdown: latest.resultOutput, executionOutput: latest.output, errorReason: latest.error, exitCode: latest.exitCode }),
        })
        if (response.status === 404) pendingSnapshots.delete(snapshot.id)
        else if (!response.ok) throw new Error('Snapshot persistence unavailable')
        else if (pendingSnapshots.get(snapshot.id) === latest) pendingSnapshots.delete(snapshot.id)
      } catch { /* Keep the most recent snapshot and retry independently of browser lifetime. */ }
      persistenceTimers.delete(snapshot.id)
      if (pendingSnapshots.has(snapshot.id)) {
        const timer = setTimeout(save, 3000)
        timer.unref?.()
        persistenceTimers.set(snapshot.id, timer)
      }
    }
    const timer = setTimeout(save, 100)
    timer.unref?.()
    persistenceTimers.set(snapshot.id, timer)
  }
  const runner = options.runner || createDispatchRunner({ ...options, persistJob: options.persistJob ?? persist })

  const handleDispatchApiRequest = async function handleDispatchApiRequest(req, res, next) {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    if (!pathname.startsWith('/api/local-agent/dispatch') && !pathname.startsWith('/api/agent/runs/')) {
      if (typeof next === 'function') return next()
      return sendJson(res, 404, { ok: false, code: 'NOT_FOUND', message: agentMessage('agent.http.notFound') })
    }

    const security = verifyLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, { ok: false, code: security.errorCode, message: security.message })
      return
    }

    const method = (req.method || 'GET').toUpperCase()
    if (pathname === '/api/local-agent/dispatch' && method === 'POST') {
      const body = await readJsonBody(req)
      if (!body.ok) {
        sendJson(res, body.status, { ok: false, code: body.code, message: body.message })
        return
      }
      const result = runner.start(body.value)
      sendJson(res, result.ok ? 202 : result.status, result.ok ? { ok: true, job: result.job } : result)
      return
    }

    const streamMatch = /^\/api\/(?:agent\/runs|local-agent\/dispatch)\/([^/]+)\/events$/.exec(pathname)
    if (streamMatch && method === 'GET' && JOB_ID_PATTERN.test(streamMatch[1])) {
      const jobId = streamMatch[1]
      const job = runner.get(jobId)
      if (!job) return sendJson(res, 404, { ok: false, code: 'JOB_NOT_FOUND', message: agentMessage('agent.dispatch.notFound') })
      const url = new URL(req.url, 'http://127.0.0.1')
      const cursor = Math.max(Number(req.headers?.['last-event-id']) || 0, Number(url.searchParams.get('sinceSequence')) || 0)
      if (!Number.isSafeInteger(cursor) || cursor < 0) return sendJson(res, 400, { ok: false, code: 'INVALID_SEQUENCE' })
      res.statusCode = 200
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('X-Accel-Buffering', 'no')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.flushHeaders?.()
      let sequence = cursor
      let closed = false
      let unsubscribe = () => {}
      let heartbeat
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(heartbeat)
        unsubscribe()
      }
      const send = (event) => {
        if (closed || event.sequence <= sequence) return
        sequence = event.sequence
        // Bound a slow consumer instead of accumulating unbounded socket buffers.
        const writable = res.write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`)
        if (!writable) { close(); res.end(); return }
        if (event.type === 'run.completed' || event.type === 'run.failed') { close(); res.end() }
      }
      unsubscribe = runner.subscribe?.(jobId, send) ?? (() => {})
      res.on?.('close', close)
      res.write('retry: 1500\n\n')
      for (const event of job.events ?? []) send(event)
      if (!['running', 'queued'].includes(job.status)) { close(); res.end(); return }
      if (!closed) {
        heartbeat = setInterval(() => { if (!res.write(': heartbeat\n\n')) { close(); res.end() } }, 15000)
        heartbeat.unref?.()
      }
      return
    }

    const match = /^\/api\/local-agent\/dispatch\/([^/]+)$/.exec(pathname)
    if (!match || !JOB_ID_PATTERN.test(match[1])) {
      sendJson(res, 404, { ok: false, code: 'JOB_NOT_FOUND', message: agentMessage('agent.dispatch.notFound') })
      return
    }
    const jobId = match[1]
    if (method === 'GET') {
      const job = runner.get(jobId)
      if (!job) {
        sendJson(res, 404, { ok: false, code: 'JOB_NOT_FOUND', message: agentMessage('agent.dispatch.lost') })
        return
      }
      sendJson(res, 200, { ok: true, job })
      return
    }
    if (method === 'DELETE') {
      const job = runner.cancel(jobId)
      if (!job) {
        sendJson(res, 404, { ok: false, code: 'JOB_NOT_FOUND', message: agentMessage('agent.dispatch.notFound') })
        return
      }
      sendJson(res, 200, { ok: true, job })
      return
    }
    sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: agentMessage('agent.dispatch.method') })
  }
  handleDispatchApiRequest.close = () => runner.shutdown?.()
  return handleDispatchApiRequest
}
