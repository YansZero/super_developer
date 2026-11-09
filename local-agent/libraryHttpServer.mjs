import { agentMessage } from './requestI18n.mjs'
import { createPromptHandler } from './promptHttpServer.mjs'
import { verifyRuleLoopbackRequestSecurity } from './ruleHttpServer.mjs'
import { hasForbiddenObjectKeys, isPlainObject } from './providerContracts.mjs'
import { ensureLibraryDirectories } from './libraryPaths.mjs'
import { createSkillStorage } from './skillStorage.mjs'
import { createMcpStorage } from './mcpStorage.mjs'
import { createTargetAdapters } from './targetAdapters.mjs'
import { createInstallRegistry } from './installRegistry.mjs'
import { createMcpHealthChecker, buildMcpAiCheckPrompt, parseMcpAiCheckOutput } from './mcpHealthCheck.mjs'
import { createNodeI18n } from '../shared/nodeI18n.mjs'
import {
  buildSkillAssistPrompt,
  parseSkillAssistDraft,
  buildMcpAssistPrompt,
  parseMcpAssistDraft,
} from './libraryAssist.mjs'
import { createDispatchRunner } from './dispatchRunner.mjs'
import { MAX_SKILL_HTTP_BODY_BYTES, SKILL_ERROR_CODES } from './skillContracts.mjs'
import { MCP_ERROR_CODES } from './mcpContracts.mjs'

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.end(body)
}

function parseLibraryAssistResult(job, kind, fallbackName) {
  const parse = kind === 'mcp' ? parseMcpAssistDraft : parseSkillAssistDraft
  const candidates = [job.resultOutput, job.output].filter(
    (value, index, values) => typeof value === 'string' && value.trim() && values.indexOf(value) === index,
  )
  let lastError = null
  for (const candidate of candidates) {
    const result = parse(candidate, fallbackName)
    if (result.ok) {
      const normalizedOutput = kind === 'mcp'
        ? JSON.stringify(result.draft, null, 2)
        : result.draft.content
      return { result, normalizedOutput }
    }
    lastError = result
  }
  return { result: lastError || parse('', fallbackName), normalizedOutput: null }
}

function readBoundedJsonBody(req, maxBytes = MAX_SKILL_HTTP_BODY_BYTES) {
  return new Promise((resolve) => {
    const contentType = req.headers?.['content-type']?.split(';')[0]?.trim().toLowerCase() ?? ''
    const chunks = []
    let totalBytes = 0
    let aborted = false

    req.on('data', (chunk) => {
      if (aborted) return
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      totalBytes += buf.byteLength
      if (totalBytes > maxBytes) {
        aborted = true
        resolve({
          ok: false,
          status: 413,
          errorCode: 'PAYLOAD_TOO_LARGE',
          message: agentMessage('agent.http.bodyLimit', { max: maxBytes }),
        })
      } else {
        chunks.push(buf)
      }
    })

    req.on('end', () => {
      if (aborted) return
      if (contentType !== 'application/json') {
        resolve({
          ok: false,
          status: 415,
          errorCode: 'UNSUPPORTED_MEDIA_TYPE',
          message: agentMessage('agent.http.contentType'),
        })
        return
      }
      if (totalBytes === 0) {
        resolve({
          ok: false,
          status: 400,
          errorCode: 'EMPTY_BODY',
          message: agentMessage('agent.http.emptyBody'),
        })
        return
      }
      const rawText = Buffer.concat(chunks).toString('utf8')
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
      if (!aborted) {
        resolve({
          ok: false,
          status: 400,
          errorCode: 'REQUEST_STREAM_ERROR',
          message: agentMessage('agent.http.readFailed'),
        })
      }
    })
  })
}

function mapErrorStatus(errorCode) {
  if (
    errorCode === SKILL_ERROR_CODES.SKILL_NOT_FOUND ||
    errorCode === SKILL_ERROR_CODES.FILE_NOT_FOUND ||
    errorCode === MCP_ERROR_CODES.MCP_NOT_FOUND ||
    errorCode === 'TARGET_NOT_FOUND' ||
    errorCode === 'NO_BACKUP_FOUND'
  ) {
    return 404
  }
  if (
    errorCode === SKILL_ERROR_CODES.SKILL_ALREADY_EXISTS ||
    errorCode === MCP_ERROR_CODES.MCP_ALREADY_EXISTS ||
    errorCode === 'EXTERNAL_ITEM_PROTECTED'
  ) {
    return 409
  }
  if (errorCode === SKILL_ERROR_CODES.PATH_OUTSIDE_LIBRARY || errorCode === SKILL_ERROR_CODES.FORBIDDEN_HIDDEN_FILE) {
    return 403
  }
  if (errorCode === SKILL_ERROR_CODES.SKILL_FILE_TOO_LARGE) {
    return 413
  }
  return 400
}

export function createLibraryApiHandler(options = {}) {
  const dirs = ensureLibraryDirectories(options)
  const registry = options.registry || createInstallRegistry(options)
  const adapters = options.adapters || createTargetAdapters({ ...options, registry })
  const skillStorage = options.skillStorage || createSkillStorage({ ...options, registry, adapters })
  const mcpStorage = options.mcpStorage || createMcpStorage({ ...options, registry, adapters })
  const healthChecker =
    options.healthChecker || createMcpHealthChecker({ ...options, registry, adapters, mcpStorage })
  const runner = options.runner || createDispatchRunner(options)

  const promptHandler = createPromptHandler(options, runner)

  // Store metadata for active library assist / check jobs so we can parse their output on poll
  const jobMeta = new Map()

  const handleRequest = async function handleLibraryApiRequest(req, res, next) {
    const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1')
    const pathname = parsedUrl.pathname

    const isLibraryRoute =
      pathname === '/api/prompts' ||
      pathname.startsWith('/api/prompts/') ||
      pathname === '/api/skills' ||
      pathname.startsWith('/api/skills/') ||
      pathname === '/api/mcp' ||
      pathname.startsWith('/api/mcp/') ||
      pathname === '/api/targets' ||
      pathname.startsWith('/api/targets/') ||
      pathname === '/api/library-assist' ||
      pathname.startsWith('/api/library-assist/')

    if (!isLibraryRoute) {
      if (typeof next === 'function') return next()
      return sendJson(res, 404, { ok: false, errorCode: 'NOT_FOUND', message: agentMessage('agent.http.notFound') })
    }

    const security = verifyRuleLoopbackRequestSecurity(req)
    if (!security.ok) {
      return sendJson(res, security.status, {
        ok: false,
        errorCode: security.errorCode,
        message: security.message,
      })
    }

    if (pathname === '/api/prompts' || pathname.startsWith('/api/prompts/')) return promptHandler(req, res, pathname)

    const method = (req.method || 'GET').toUpperCase()

    // --- /api/targets ---
    if (pathname === '/api/targets' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        libraryRoot: dirs.root,
        skillsDir: dirs.skillsDir,
        mcpsDir: dirs.mcpsDir,
        targets: adapters.listTargets(),
      })
    }

    if (pathname === '/api/targets/restore' && method === 'POST') {
      const body = await readBoundedJsonBody(req)
      if (!body.ok) return sendJson(res, body.status, body)
      const targetId = typeof body.value.targetId === 'string' ? body.value.targetId : undefined
      const result = adapters.restoreLatestBackup(targetId)
      return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
    }

    // --- /api/skills ---
    if (pathname === '/api/skills' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        libraryPath: dirs.skillsDir,
        skills: skillStorage.listSkills(),
        targets: adapters.listTargets(),
      })
    }

    if (pathname === '/api/skills' && method === 'POST') {
      const body = await readBoundedJsonBody(req)
      if (!body.ok) return sendJson(res, body.status, body)
      const result = skillStorage.createSkill(body.value)
      return sendJson(res, result.ok ? 201 : mapErrorStatus(result.errorCode), result)
    }

    const skillCheckMatch = /^\/api\/skills\/([^/]+)\/check$/.exec(pathname)
    if (skillCheckMatch && method === 'POST') {
      const skillName = decodeURIComponent(skillCheckMatch[1])
      const result = skillStorage.checkAndRepairSkillInstallations(skillName)
      return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
    }

    const skillTargetMatch = /^\/api\/skills\/([^/]+)\/targets\/([^/]+)$/.exec(pathname)
    if (skillTargetMatch) {
      const skillName = decodeURIComponent(skillTargetMatch[1])
      const targetId = decodeURIComponent(skillTargetMatch[2])
      if (method === 'POST') {
        const result = skillStorage.installSkill(skillName, targetId)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'DELETE') {
        const result = skillStorage.uninstallSkill(skillName, targetId)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
    }

    const skillFileMatch = /^\/api\/skills\/([^/]+)\/files\/(.+)$/.exec(pathname)
    if (skillFileMatch) {
      const skillName = decodeURIComponent(skillFileMatch[1])
      const relPath = decodeURIComponent(skillFileMatch[2])
      if (method === 'GET') {
        const result = skillStorage.getSupportingFile(skillName, relPath)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'PUT') {
        const body = await readBoundedJsonBody(req)
        if (!body.ok) return sendJson(res, body.status, body)
        const result = skillStorage.putSupportingFile(skillName, relPath, body.value.content)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'DELETE') {
        const result = skillStorage.deleteSupportingFile(skillName, relPath)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
    }

    const skillItemMatch = /^\/api\/skills\/([^/]+)$/.exec(pathname)
    if (skillItemMatch) {
      const skillName = decodeURIComponent(skillItemMatch[1])
      if (method === 'GET') {
        const result = skillStorage.getSkill(skillName)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'PUT') {
        const body = await readBoundedJsonBody(req)
        if (!body.ok) return sendJson(res, body.status, body)
        const result = skillStorage.updateSkill(skillName, body.value)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'DELETE') {
        const result = skillStorage.deleteSkill(skillName)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
    }

    // --- /api/mcp ---
    if (pathname === '/api/mcp' && method === 'GET') {
      const { servers, externalServers } = mcpStorage.listMcpServers()
      return sendJson(res, 200, {
        ok: true,
        libraryPath: dirs.mcpsDir,
        servers,
        externalServers,
        targets: adapters.listTargets(),
      })
    }

    if (pathname === '/api/mcp' && method === 'POST') {
      const body = await readBoundedJsonBody(req)
      if (!body.ok) return sendJson(res, body.status, body)
      const result = mcpStorage.createMcpServer(body.value)
      return sendJson(res, result.ok ? 201 : mapErrorStatus(result.errorCode), result)
    }

    const mcpCheckPollMatch = /^\/api\/mcp\/([^/]+)\/check\/([^/]+)$/.exec(pathname)
    if (mcpCheckPollMatch && method === 'GET') {
      const { locale, t } = createNodeI18n(req.headers?.['accept-language'], 'zh-TW')
      const serverName = decodeURIComponent(mcpCheckPollMatch[1])
      const jobId = decodeURIComponent(mcpCheckPollMatch[2])
      const job = runner.get(jobId)
      if (!job) {
        return sendJson(res, 404, {
          ok: false,
          errorCode: 'JOB_NOT_FOUND',
          message: t('mcp.health.aiJobNotFound'),
        })
      }
      let report = registry.getLastCheck('mcp', serverName)
      if (job.status === 'succeeded' && (!report || !report.aiVerification)) {
        const parsedAi = parseMcpAiCheckOutput(job.resultOutput || job.output, serverName, locale)
        report = healthChecker.attachAiCheckResult(serverName, {
          providerId: job.providerId,
          modelId: job.modelId,
          checkedAt: new Date().toISOString(),
          ...parsedAi,
        })
      } else if (job.status === 'failed' && (!report || !report.aiVerification)) {
        report = healthChecker.attachAiCheckResult(serverName, {
          providerId: job.providerId,
          modelId: job.modelId,
          checkedAt: new Date().toISOString(),
          ok: false,
          loaded: false,
          status: 'error',
          tools: [],
          detail: t('mcp.health.aiFailed'),
          suggestion: t('mcp.health.aiSuggestion'),
        })
      }
      return sendJson(res, 200, {
        ok: true,
        job,
        report,
        server: mcpStorage.getMcpServer(serverName).server,
      })
    }

    const mcpCheckMatch = /^\/api\/mcp\/([^/]+)\/check$/.exec(pathname)
    if (mcpCheckMatch && method === 'POST') {
      const { locale, t } = createNodeI18n(req.headers?.['accept-language'], 'zh-TW')
      const serverName = decodeURIComponent(mcpCheckMatch[1])
      const body = await readBoundedJsonBody(req)
      if (!body.ok) return sendJson(res, body.status, body)

      const autoInstall = body.value.autoInstall !== false
      const preflight = healthChecker.runPreflightAndAutoInstall(serverName, autoInstall, locale)
      if (!preflight.ok) {
        return sendJson(res, mapErrorStatus(preflight.errorCode), preflight)
      }

      const providerId = body.value.providerId
      const modelId = body.value.modelId || 'default'
      const effort = body.value.effort || 'default'

      // If preflight passed and a supported AI provider is given, launch read-only AI verification
      let aiJob = null
      if (!preflight.report.blockedByPreflight && providerId) {
        const raw = mcpStorage.readRawDefinition(serverName)
        const prompt = buildMcpAiCheckPrompt(serverName, raw.def, locale)
        const dispatchRes = runner.start({
          taskType: 'mcp-check',
          projectId: `library-mcp-${serverName}`,
          projectName: `MCP Check: ${serverName}`,
          projectPath: dirs.mcpsDir,
          providerId,
          modelId,
          effort,
          prompt,
        })
        if (dispatchRes.ok) {
          aiJob = dispatchRes.job
          jobMeta.set(aiJob.id, { kind: 'mcp-check', serverName })
        } else {
          // Attach note if CLI could not be spawned (e.g. unprobed in dev environment)
          preflight.report = healthChecker.attachAiCheckResult(serverName, {
            providerId,
            modelId,
            checkedAt: new Date().toISOString(),
            ok: false,
            loaded: false,
            status: 'warning',
            tools: [],
            detail: t('mcp.health.aiSkipped', { code: dispatchRes.code ?? 'UNKNOWN_ERROR' }),
            suggestion: '',
          })
        }
      }

      return sendJson(res, 200, {
        ok: true,
        report: preflight.report,
        server: mcpStorage.getMcpServer(serverName).server,
        job: aiJob,
      })
    }

    const mcpTargetMatch = /^\/api\/mcp\/([^/]+)\/targets\/([^/]+)$/.exec(pathname)
    if (mcpTargetMatch) {
      const serverName = decodeURIComponent(mcpTargetMatch[1])
      const targetId = decodeURIComponent(mcpTargetMatch[2])
      if (method === 'POST') {
        const result = mcpStorage.installMcp(serverName, targetId)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'DELETE') {
        const result = mcpStorage.uninstallMcp(serverName, targetId)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
    }

    const mcpItemMatch = /^\/api\/mcp\/([^/]+)$/.exec(pathname)
    if (mcpItemMatch) {
      const serverName = decodeURIComponent(mcpItemMatch[1])
      if (method === 'GET') {
        const result = mcpStorage.getMcpServer(serverName)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'PUT') {
        const body = await readBoundedJsonBody(req)
        if (!body.ok) return sendJson(res, body.status, body)
        const result = mcpStorage.updateMcpServer(serverName, body.value)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
      if (method === 'DELETE') {
        const result = mcpStorage.deleteMcpServer(serverName)
        return sendJson(res, result.ok ? 200 : mapErrorStatus(result.errorCode), result)
      }
    }

    // --- /api/library-assist ---
    if (pathname === '/api/library-assist' && method === 'POST') {
      const body = await readBoundedJsonBody(req, 36 * 1024 * 1024)
      if (!body.ok) return sendJson(res, body.status, body)

      const {
        jobId,
        kind,
        mode = 'create',
        name = '',
        description = '',
        instruction = '',
        providerId,
        modelId = 'default',
        effort = 'default',
        currentContent = '',
        imageAttachment,
        imageAttachments,
      } = body.value

      if (kind !== 'skill' && kind !== 'mcp') {
        return sendJson(res, 400, {
          ok: false,
          errorCode: 'INVALID_ASSIST_KIND',
          message: agentMessage('agent.library.kindInvalid'),
        })
      }
      if (typeof instruction !== 'string' || !instruction.trim()) {
        return sendJson(res, 400, {
          ok: false,
          errorCode: 'EMPTY_INSTRUCTION',
          message: agentMessage('agent.library.instructionRequired'),
        })
      }

      let prompt
      let fixedWorkingDir
      let taskType
      if (kind === 'skill') {
        taskType = 'library-skill'
        fixedWorkingDir = dirs.skillsDir
        prompt = buildSkillAssistPrompt({
          mode,
          name,
          description,
          currentContent,
          instruction: instruction.trim(),
        })
      } else {
        taskType = 'library-mcp'
        fixedWorkingDir = dirs.mcpsDir
        const rawExisting = name ? mcpStorage.readRawDefinition(name) : null
        prompt = buildMcpAssistPrompt({
          mode,
          name,
          currentDefinition: rawExisting?.def ?? null,
          instruction: instruction.trim(),
        })
      }

      const startRes = runner.start({
        jobId,
        taskType,
        projectId: `library-${kind}-${name || 'new'}`,
        projectName: `${kind === 'skill' ? 'Skill' : 'MCP'}: ${name || 'draft'}`,
        projectPath: fixedWorkingDir,
        providerId,
        modelId,
        effort,
        prompt,
        imageAttachment,
        imageAttachments,
      })

      if (!startRes.ok) {
        return sendJson(res, startRes.status || 400, {
          ok: false,
          code: startRes.code,
          errorCode: startRes.code,
          message: startRes.message,
        })
      }

      jobMeta.set(startRes.job.id, { kind, fallbackName: name || (kind === 'skill' ? 'custom-skill' : 'custom-mcp') })
      return sendJson(res, 202, { ok: true, job: startRes.job })
    }

    const assistPollMatch = /^\/api\/library-assist\/([^/]+)$/.exec(pathname)
    if (assistPollMatch) {
      const jobId = decodeURIComponent(assistPollMatch[1])
      if (method === 'GET') {
        const job = runner.get(jobId)
        if (!job) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'JOB_NOT_FOUND',
            message: agentMessage('agent.library.draftJobNotFound'),
          })
        }
        let draftResult = null
        let responseJob = job
        if (job.status === 'succeeded') {
          const meta = jobMeta.get(jobId) || {
            kind: job.taskType === 'library-mcp' ? 'mcp' : 'skill',
            fallbackName: 'draft-item',
          }
          const parsed = parseLibraryAssistResult(job, meta.kind, meta.fallbackName)
          draftResult = parsed.result
          responseJob = draftResult.ok
            ? { ...job, resultOutput: parsed.normalizedOutput, outputMarkdown: parsed.normalizedOutput, error: null, errorReason: null }
            : { ...job, status: 'failed', error: draftResult.message, errorReason: draftResult.message }
        }
        return sendJson(res, 200, {
          ok: true,
          job: responseJob,
          draft: draftResult?.ok ? draftResult.draft : null,
          parseError: draftResult && !draftResult.ok ? draftResult.message : null,
        })
      }
      if (method === 'DELETE') {
        const job = runner.cancel(jobId)
        if (!job) {
          return sendJson(res, 404, {
            ok: false,
            errorCode: 'JOB_NOT_FOUND',
            message: agentMessage('agent.library.draftJobNotFound'),
          })
        }
        return sendJson(res, 200, { ok: true, job })
      }
    }

    return sendJson(res, 405, {
      ok: false,
      errorCode: 'METHOD_NOT_ALLOWED',
      message: agentMessage('agent.http.unsupportedMethod'),
    })
  }

  handleRequest.close = () => runner.shutdown?.()
  return handleRequest
}
