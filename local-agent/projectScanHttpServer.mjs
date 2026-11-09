import { agentMessage } from './requestI18n.mjs'
import {
  MAX_PROJECT_SCAN_BODY_BYTES,
  PROJECT_SCAN_ERROR_CODES,
  validateProjectPath,
} from './projectScanContracts.mjs'
import { createProjectScanner } from './projectScanner.mjs'
import { createProjectFolderPicker, createProjectFolderOpener } from './projectFolderPicker.mjs'
import { verifyGitLoopbackRequestSecurity } from './gitHttpServer.mjs'

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let totalBytes = 0
    let settled = false
    const fail = (payload) => {
      if (settled) return
      settled = true
      resolve(payload)
    }
    req.on('data', (chunk) => {
      if (settled) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buffer.byteLength
      if (totalBytes > MAX_PROJECT_SCAN_BODY_BYTES) {
        fail({ ok: false, status: 413, errorCode: PROJECT_SCAN_ERROR_CODES.PAYLOAD_TOO_LARGE, message: agentMessage('agent.http.bodyTooLarge') })
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (settled) return
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        fail({ ok: false, status: 400, errorCode: PROJECT_SCAN_ERROR_CODES.EMPTY_BODY, message: agentMessage('agent.http.emptyBody') })
        return
      }
      try {
        const value = JSON.parse(raw)
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          fail({ ok: false, status: 400, errorCode: PROJECT_SCAN_ERROR_CODES.INVALID_JSON_OBJECT, message: agentMessage('agent.http.invalidJsonObject') })
          return
        }
        fail({ ok: true, value })
      } catch {
        fail({ ok: false, status: 400, errorCode: 'INVALID_JSON', message: agentMessage('agent.http.invalidJson') })
      }
    })
    req.on('error', () => fail({ ok: false, status: 400, errorCode: 'REQUEST_STREAM_ERROR', message: agentMessage('agent.http.readFailed') }))
  })
}

export function createProjectScanApiHandler(options = {}) {
  const scanner = options.scanner || createProjectScanner(options)
  const folderPicker = options.folderPicker || createProjectFolderPicker(options)
  const folderOpener = options.folderOpener || createProjectFolderOpener(options)
  return async function handleProjectScanRequest(req, res, next) {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    if (
      pathname !== '/api/local-agent/projects/scan' &&
      pathname !== '/api/local-agent/projects/progress' &&
      pathname !== '/api/local-agent/projects/progress/complete' &&
      pathname !== '/api/local-agent/projects/git-status' &&
      pathname !== '/api/local-agent/projects/pick' &&
      pathname !== '/api/local-agent/projects/open-folder'
    ) {
      next?.()
      return
    }
    const security = verifyGitLoopbackRequestSecurity(req)
    if (!security.ok) {
      sendJson(res, security.status, { ok: false, errorCode: security.errorCode, message: security.message })
      return
    }
    if (pathname === '/api/local-agent/projects/pick') {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, errorCode: 'METHOD_NOT_ALLOWED', message: agentMessage('agent.http.postOnly') })
        return
      }
      const result = await folderPicker.pick()
      sendJson(res, result.ok ? 200 : 400, result)
      return
    }

    if (pathname === '/api/local-agent/projects/open-folder') {
      if ((req.method || 'GET').toUpperCase() !== 'POST') {
        sendJson(res, 405, { ok: false, errorCode: 'METHOD_NOT_ALLOWED', message: agentMessage('agent.http.postOnly') })
        return
      }
      const body = await readBody(req)
      if (!body.ok) {
        sendJson(res, body.status, body)
        return
      }
      const projectPath = body.value?.projectPath
      if (typeof projectPath !== 'string' || !projectPath.trim()) {
        sendJson(res, 400, { ok: false, errorCode: 'INVALID_PROJECT_PATH', message: agentMessage('agent.project.missingProjectPath') })
        return
      }
      const result = await folderOpener.open(projectPath.trim())
      sendJson(res, result.ok ? 200 : 400, result)
      return
    }

    if ((req.method || 'GET').toUpperCase() !== 'POST') {
      sendJson(res, 405, { ok: false, errorCode: 'METHOD_NOT_ALLOWED', message: agentMessage('agent.http.postOnly') })
      return
    }
    const body = await readBody(req)
    if (!body.ok) {
      sendJson(res, body.status, body)
      return
    }
    if (pathname === '/api/local-agent/projects/git-status') {
      const keys = Object.keys(body.value)
      if (keys.length !== 1 || keys[0] !== 'projectPath') {
        sendJson(res, 400, {
          ok: false,
          errorCode: 'INVALID_GIT_STATUS_REQUEST',
          message: agentMessage('agent.project.gitStatusFieldsOnly'),
        })
        return
      }
      const pathCheck = validateProjectPath(body.value.projectPath)
      if (!pathCheck.ok) {
        sendJson(res, 400, pathCheck)
        return
      }
      const result = await scanner.scanGitStatus(pathCheck.value)
      sendJson(res, result.ok ? 200 : 400, result)
      return
    }
    const pathCheck = validateProjectPath(body.value.projectPath)
    if (!pathCheck.ok) {
      sendJson(res, 400, pathCheck)
      return
    }
    if (pathname === '/api/local-agent/projects/progress') {
      const result = await scanner.scanProgress(pathCheck.value)
      sendJson(res, result.ok ? 200 : 400, result)
      return
    }
    if (pathname === '/api/local-agent/projects/progress/complete') {
      if (typeof body.value.todoId !== 'string' || !body.value.todoId.trim()) {
        sendJson(res, 400, { ok: false, errorCode: 'INVALID_PROGRESS_TODO', message: agentMessage('agent.project.missingTodoId') })
        return
      }
      const result = await scanner.completeProgressTodo(pathCheck.value, body.value.todoId.trim())
      sendJson(res, result.ok ? 200 : 400, result)
      return
    }
    const result = await scanner.scan(pathCheck.value)
    sendJson(res, result.ok ? 200 : 400, result)
  }
}
