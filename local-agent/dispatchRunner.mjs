import { agentMessage } from './requestI18n.mjs'
import { createRunProgress, progressPrompt, verifyTask } from './agentProgress.mjs'
import { readProgressTasks, writeProgressCompletion } from './projectScanner.mjs'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { buildSafeSubprocessEnv, resolveExecutableFile } from './providerAdapter.mjs'
import { getProviderModelCatalog } from './providerModelCatalog.mjs'
import { createProviderStorage } from './providerStorage.mjs'
import { createRuleStorage } from './ruleStorage.mjs'
import { createSpecDocumentStore } from './specDocumentStore.mjs'
import { sanitizeCliOutput } from './cliOutputSanitizer.mjs'

const MAX_PROMPT_LENGTH = 24_000
const MAX_RULE_CONTEXT_LENGTH = 96_000
const MAX_CAPTURE_BYTES = 64 * 1024
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_ATTACHMENT_COUNT = 3
const MAX_JOBS = 40
const MAX_TIMEOUT_MS = 30 * 60 * 1000
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000
const ALLOWED_PROVIDERS = new Set(['antigravity', 'codex', 'claude-code'])
const ALLOWED_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
const CLI_LABELS = {
  antigravity: 'Antigravity CLI',
  codex: 'OpenAI Codex CLI',
  'claude-code': 'Claude Code CLI',
}
const JOB_ID_PATTERN = /^\d{6}_TASK_[0-9a-f-]{36}$/i

export function createDispatchJobId(date = new Date(), uuid = crypto.randomUUID()) {
  const year = String(date.getUTCFullYear()).slice(-2)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}_TASK_${uuid}`
}

function takeUtf8Tail(value, maxBytes) {
  const bytes = Buffer.from(value, 'utf8')
  let start = Math.max(0, bytes.length - maxBytes)
  while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1
  return bytes.subarray(start).toString('utf8')
}

function clipAppend(current, value) {
  if (!value) return current
  const suffix = agentMessage('agent.dispatch.truncatedOutput')
  const wasTruncated = current.endsWith(suffix)
  const combined = (wasTruncated ? current.slice(0, -suffix.length) : current) + value
  const bytes = Buffer.byteLength(combined, 'utf8')
  if (bytes <= MAX_CAPTURE_BYTES && !wasTruncated) return combined
  const budget = MAX_CAPTURE_BYTES - Buffer.byteLength(suffix, 'utf8')
  return takeUtf8Tail(combined, budget) + suffix
}

function cliLabel(providerId) {
  return CLI_LABELS[providerId] ?? 'AI CLI'
}

export function findProjectVerificationCommand(projectPath) {
  try {
    const pkgPath = path.join(projectPath, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      const scripts = pkg?.scripts || {}
      if (scripts['test:frontend']) return ['npm', 'run', 'test:frontend']
      if (scripts.test && !scripts.test.includes('no test specified')) return ['npm', 'test']
      if (scripts.build) return ['npm', 'run', 'build']
      if (scripts.lint) return ['npm', 'run', 'lint']
    }
  } catch { /* Best effort */ }
  return null
}

function isReadOnlyTaskType(taskType) {
  return (
    taskType === 'architecture' ||
    taskType === 'library-skill' ||
    taskType === 'library-mcp' ||
    taskType === 'mcp-check'
  )
}

const IMAGE_MIME_EXTENSIONS = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
})

function parseSingleImageAttachment(value, index = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, status: 400, code: 'INVALID_IMAGE_ATTACHMENT', message: agentMessage('dispatch.error.INVALID_IMAGE_ATTACHMENT') }
  }
  const name = typeof value.name === 'string' ? value.name : ''
  const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl : ''
  const match = /^data:(image\/(?:png|jpeg|webp|gif|bmp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl)
  if (!match || !name.trim()) {
    return { ok: false, status: 400, code: 'INVALID_IMAGE_ATTACHMENT', message: agentMessage('dispatch.error.INVALID_IMAGE_ATTACHMENT') }
  }
  const data = Buffer.from(match[2].replace(/\s/g, ''), 'base64')
  if (data.length === 0 || data.length > MAX_ATTACHMENT_BYTES) {
    return { ok: false, status: 400, code: 'IMAGE_ATTACHMENT_TOO_LARGE', message: agentMessage('agent.dispatch.attachmentSize', { limit: MAX_ATTACHMENT_BYTES / 1024 / 1024 }) }
  }
  const safeName = path.basename(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || `pasted-image-${index + 1}`
  const ext = path.extname(safeName) || IMAGE_MIME_EXTENSIONS[match[1]]
  const baseName = path.extname(safeName) ? safeName.slice(0, -path.extname(safeName).length) : safeName
  return { ok: true, value: { data, baseName, ext, fileName: `${baseName}${ext}` } }
}

function parseImageAttachments(imageAttachment, imageAttachments) {
  if (imageAttachments !== undefined && imageAttachments !== null && !Array.isArray(imageAttachments)) {
    return { ok: false, status: 400, code: 'INVALID_IMAGE_ATTACHMENT', message: agentMessage('dispatch.error.INVALID_IMAGE_ATTACHMENT') }
  }
  const rawList = Array.isArray(imageAttachments)
    ? imageAttachments
    : imageAttachment !== undefined && imageAttachment !== null
      ? [imageAttachment]
      : []
  if (rawList.length === 0) return { ok: true, value: [] }
  if (rawList.length > MAX_ATTACHMENT_COUNT) {
    return { ok: false, status: 400, code: 'IMAGE_ATTACHMENT_MAX_COUNT', message: agentMessage('agent.dispatch.attachmentCount', { limit: MAX_ATTACHMENT_COUNT }) }
  }
  const parsedList = []
  const usedNames = new Set()
  for (let i = 0; i < rawList.length; i += 1) {
    const parsed = parseSingleImageAttachment(rawList[i], i)
    if (!parsed.ok) return parsed
    let fileName = parsed.value.fileName
    if (usedNames.has(fileName)) {
      fileName = `${parsed.value.baseName}-${i + 1}${parsed.value.ext}`
    }
    usedNames.add(fileName)
    parsedList.push({ data: parsed.value.data, fileName })
  }
  return { ok: true, value: parsedList }
}

function writeImageAttachments(workingDirectory, jobId, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return []
  const directory = path.join(workingDirectory, '.super-developer-attachments', jobId)
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  return attachments.map((attachment) => {
    const filePath = path.join(directory, attachment.fileName)
    fs.writeFileSync(filePath, attachment.data, { mode: 0o600, flag: 'wx' })
    return filePath
  })
}

function removeImageAttachments(attachmentPaths) {
  if (!Array.isArray(attachmentPaths) || attachmentPaths.length === 0) return
  const firstPath = attachmentPaths[0]
  if (!firstPath) return
  fs.rmSync(path.dirname(firstPath), { recursive: true, force: true })
  const parent = path.dirname(path.dirname(firstPath))
  try { if (fs.readdirSync(parent).length === 0) fs.rmSync(parent, { recursive: true, force: true }) } catch { /* Best-effort cleanup. */ }
}

function buildAppliedRuleSections(rules) {
  const guidance = rules.filter((rule) => rule.kind === 'guidance')
  const mandatory = rules.filter((rule) => rule.kind === 'rule')
  const beforeCommand = rules.filter((rule) => rule.kind === 'hook' && rule.hookEvents.includes('before-command'))
  const beforeCompletion = rules.filter((rule) => rule.kind === 'hook' && rule.hookEvents.includes('before-completion'))
  const section = (title, items) => items.length === 0
    ? []
    : [title, ...items.flatMap((rule) => [`<rule name="${rule.fileName}">`, rule.content, '</rule>', ''])]
  return {
    beforeCommand: section('<hooks-before-command>', beforeCommand),
    guidance: section('<guidance-reference>', guidance),
    mandatory: section('<mandatory-rules>', mandatory),
    beforeCompletion: section('<hooks-before-completion>', beforeCompletion),
  }
}

function buildTaskPrompt({ taskType, projectName, branchName, prompt, attachmentPaths = [], rules = [] }) {
  const appliedRuleSections = buildAppliedRuleSections(rules)
  const ruleContext = [
    ...appliedRuleSections.beforeCommand,
    ...appliedRuleSections.guidance,
    ...appliedRuleSections.mandatory,
  ]
  const attachmentContext = Array.isArray(attachmentPaths) && attachmentPaths.length > 0
    ? [
      agentMessage('agent.dispatch.attachedImagesNotice', { count: attachmentPaths.length }),
      ...attachmentPaths.map((attachmentPath) => `<image-attachment>${attachmentPath}</image-attachment>`),
    ]
    : []
  if (taskType === 'library-skill' || taskType === 'library-mcp' || taskType === 'mcp-check') {
    return [
      agentMessage('agent.dispatch.draftPrompt1'),
      agentMessage('agent.dispatch.draftPrompt2'),
      agentMessage('agent.dispatch.draftPrompt3'),
      ...ruleContext,
      ...attachmentContext,
      agentMessage('agent.dispatch.draftPrompt4'),
      '',
      '<task>',
      prompt,
      '</task>',
    ].join('\n')
  }

  const taskInstructions = taskType === 'architecture'
    ? [
      agentMessage('agent.dispatch.archPrompt1'),
      agentMessage('agent.dispatch.archPrompt2'),
      agentMessage('agent.dispatch.archPrompt3'),
      agentMessage('agent.dispatch.archPrompt4'),
      agentMessage('agent.dispatch.archPrompt5'),
    ].join('\n')
    : [
      agentMessage('agent.dispatch.taskPrompt1'),
      agentMessage('agent.dispatch.taskPrompt2'),
    ].join('\n')
  return [
    agentMessage('agent.dispatch.taskContextNotice', { project: projectName, branch: branchName || agentMessage('agent.dispatch.branchUndetected') }),
    taskInstructions,
    agentMessage('agent.dispatch.securitySecretNotice'),
    agentMessage('agent.dispatch.untrustedContentNotice'),
    ...ruleContext,
    ...attachmentContext,
    '',
    '<task>',
    prompt,
    '</task>',
    ...appliedRuleSections.beforeCompletion,
  ].join('\n')
}

function buildProviderCommand(providerId, executable, modelId, effort, taskType, resultPath, attachmentPaths = []) {
  const readOnly = isReadOnlyTaskType(taskType)
  if (providerId === 'antigravity') {
    const args = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--sandbox', '--mode', readOnly ? 'plan' : 'accept-edits', '--print-timeout', '30m', '--dangerously-skip-permissions']
    if (modelId !== 'default') args.push('--model', modelId)
    if (effort !== 'default') args.push('--effort', effort)
    return { executable, args, inputFormat: 'antigravity' }
  }

  if (providerId === 'codex') {
    const args = ['exec', '--sandbox', readOnly ? 'read-only' : 'workspace-write']
    if (resultPath) args.push('--output-last-message', resultPath)
    if (!readOnly) args.push('--json')
    if (Array.isArray(attachmentPaths)) {
      for (const attachmentPath of attachmentPaths) {
        if (attachmentPath) args.push('--image', attachmentPath)
      }
    }
    if (modelId !== 'default') args.push('--model', modelId)
    if (effort !== 'default') args.push('--config', `model_reasoning_effort=${effort}`)
    args.push('-')
    return { executable, args, inputFormat: readOnly ? 'text' : 'codex-json' }
  }

  if (providerId === 'claude-code') {
    const args = [
      '-p',
      '--input-format', 'text',
      '--output-format', readOnly ? 'json' : 'stream-json',
      '--permission-mode', readOnly ? 'plan' : 'acceptEdits',
      '--tools', readOnly ? 'Read,Glob,Grep' : 'Read,Edit,Write,Glob,Grep',
    ]
    if (!readOnly) args.push('--verbose', '--include-partial-messages')
    if (modelId !== 'default') args.push('--model', modelId)
    return { executable, args, inputFormat: readOnly ? 'claude-json' : 'claude-stream' }
  }

  return null
}

function getPromptInput(prompt, inputFormat) {
  if (inputFormat === 'antigravity') {
    return `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`
  }
  if (inputFormat === 'claude' || inputFormat === 'claude-json') {
    return prompt
  }
  return prompt
}

function collectStreamText(job, inputFormat, text, flush = false) {
  const readOnly = isReadOnlyTaskType(job.taskType)
  if (inputFormat === 'text' || inputFormat === 'claude') {
    job.progress?.feed(text, flush)
    job.output = clipAppend(job.output, text)
    if (!readOnly) job.resultOutput = clipAppend(job.resultOutput, text)
    return
  }
  if (inputFormat === 'claude-json') {
    job.pendingLine += text
    if (job.pendingLine.length > 4_000_000) job.pendingLine = ''
    if (flush) {
      try {
        const event = JSON.parse(job.pendingLine)
        if (!event.is_error && typeof event.result === 'string') {
          job.resultOutput = event.result
          job.output = clipAppend(job.output, event.result)
        }
      } catch { /* An incomplete result is treated as missing output. */ }
      job.pendingLine = ''
    }
    return
  }

  job.pendingLine += text
  if (job.pendingLine.length > 128_000) job.pendingLine = job.pendingLine.slice(-128_000)
  const lines = job.pendingLine.split(/\r?\n/)
  job.pendingLine = lines.pop() || ''
  if (flush && job.pendingLine) { lines.push(job.pendingLine); job.pendingLine = '' }
  for (const line of lines) {
    if (line.length > 128_000) continue
    try {
      const event = JSON.parse(line)
      const delta = inputFormat === 'antigravity'
        ? event?.step_update?.text_delta
        : inputFormat === 'codex-json'
          ? event?.type === 'item.completed' && event?.item?.type === 'agent_message' ? event.item.text : null
          : event?.type === 'stream_event' ? event?.event?.delta?.text : null
      if (inputFormat === 'codex-json' && event?.type === 'item.completed' && event?.item?.type === 'command_execution') {
        const cmdOut = typeof event.item.output === 'string' ? event.item.output : typeof event.item.stdout === 'string' ? event.item.stdout : ''
        if (cmdOut) {
          job.progress?.feed(cmdOut + '\n')
          job.output = clipAppend(job.output, cmdOut)
        }
      }
      const result = inputFormat === 'antigravity' ? event?.result?.response : inputFormat === 'claude-stream' ? event?.result : undefined
      const error = inputFormat === 'antigravity' ? event?.result?.error : event?.error
      if (typeof delta === 'string') {
        job.progress?.feed(delta + (inputFormat === 'codex-json' ? '\n' : ''))
        job.output = clipAppend(job.output, delta)
        if (!readOnly) job.resultOutput = clipAppend(job.resultOutput, delta)
      }
      if (typeof result === 'string' && result && !error) {
        if (result !== delta) { job.progress?.feed('', true); job.progress?.feed(result + '\n') }
        if (result !== delta) job.output = clipAppend(job.output, `${result}\n`)
        job.resultOutput = readOnly ? result : clipAppend(job.resultOutput, `${result}\n`)
      }
      if (typeof error === 'string' && error) {
        if (readOnly) job.resultOutput = ''
        job.output = clipAppend(job.output, agentMessage('agent.dispatch.errorPrefix', { error }))
      }
    } catch {
      // Older CLIs can still return plain text; only explicit protocol lines affect tasks.
      if (!readOnly) { job.output = clipAppend(job.output, line + '\n'); job.resultOutput = clipAppend(job.resultOutput, line + '\n'); job.progress?.feed(line + '\n') }
    }
  }
}

function isSafePrompt(prompt) {
  return typeof prompt === 'string' && prompt.trim().length > 0 && prompt.length <= MAX_PROMPT_LENGTH
}

export function createDispatchRunner(options = {}) {
  const storage = options.storage || createProviderStorage({ configFilePath: options.configFilePath })
  const ruleStorage = options.ruleStorage || createRuleStorage({ configFilePath: options.ruleConfigPath })
  const specStore = options.specStore || createSpecDocumentStore()
  const adapterOptions = options.adapterOptions || {}
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS, 10_000), MAX_TIMEOUT_MS)
  const jobs = new Map()
  const subscribers = new Map()

  function snapshot(job) {
    return {
      tasks: structuredClone(job.tasks),
      events: structuredClone(job.events),
      progressTodoId: job.progressTodoId,
      progressSourceFileLabel: job.progressSourceFileLabel,
      id: job.id,
      status: job.status,
      providerId: job.providerId,
      projectId: job.projectId,
      projectName: job.projectName,
      startedAt: job.startedAt,
      updatedAt: job.updatedAt,
      output: sanitizeCliOutput(job.output),
      resultOutput: sanitizeCliOutput(job.status === 'succeeded' ? job.resultOutput : ''),
      error: job.error,
      exitCode: job.exitCode,
      artifactPath: job.artifactPath,
      taskType: job.taskType,
      modelId: job.modelId,
      effort: job.effort,
      branchName: job.branchName,
      jiraTicketKey: job.jiraTicketKey,
      jiraTicketTitle: job.jiraTicketTitle,
      summary: job.summary,
      inputMarkdown: job.inputMarkdown,
      outputMarkdown: sanitizeCliOutput(job.status === 'succeeded' ? job.resultOutput : ''),
      executionOutput: sanitizeCliOutput(job.output),
      errorReason: job.error,
    }
  }

  function finish(job, status, error = null) {
    if (job.status !== 'running' && job.status !== 'queued') return
    job.status = status
    job.error = error
    job.updatedAt = new Date().toISOString()
    if (job.timeout) clearTimeout(job.timeout)
    job.progress?.finish()
  }

  function start(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, status: 400, code: 'INVALID_INPUT', message: agentMessage('agent.dispatch.invalidInput') }
    }
    const { jobId, projectId, providerId, modelId = 'default', effort = 'default', projectPath, projectName, branchName, prompt, imageAttachment, imageAttachments, jiraTicketKey, jiraTicketTitle, progressTodoId, progressSourceFileLabel } = input
    const taskType = input.taskType ?? (jiraTicketKey ? 'jira' : 'architecture')
    if (
      taskType !== 'jira' &&
      taskType !== 'custom' &&
      taskType !== 'architecture' &&
      taskType !== 'library-skill' &&
      taskType !== 'library-mcp' &&
      taskType !== 'mcp-check'
    ) {
      return { ok: false, status: 400, code: 'INVALID_TASK_TYPE', message: agentMessage('agent.dispatch.invalidTaskType') }
    }
    if (!ALLOWED_PROVIDERS.has(providerId)) {
      return { ok: false, status: 400, code: 'UNSUPPORTED_PROVIDER', message: agentMessage('agent.dispatch.unsupportedProvider') }
    }
    if (typeof projectPath !== 'string' || !path.isAbsolute(projectPath) || projectPath.length > 4096) {
      return { ok: false, status: 400, code: 'INVALID_PROJECT_PATH', message: agentMessage('agent.dispatch.invalidPath') }
    }
    if (typeof projectId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(projectId)) {
      return { ok: false, status: 400, code: 'INVALID_PROJECT_ID', message: agentMessage('agent.dispatch.invalidProjectId') }
    }
    if (typeof projectName !== 'string' || !projectName.trim() || projectName.length > 160) {
      return { ok: false, status: 400, code: 'INVALID_PROJECT_NAME', message: agentMessage('agent.dispatch.invalidProjectName') }
    }
    if (!isSafePrompt(prompt)) {
      return { ok: false, status: 400, code: 'INVALID_PROMPT', message: agentMessage('agent.dispatch.promptLimit', { limit: MAX_PROMPT_LENGTH }) }
    }
    const parsedAttachments = parseImageAttachments(imageAttachment, imageAttachments)
    if (!parsedAttachments.ok) {
      return {
        ok: false,
        status: parsedAttachments.status ?? 400,
        code: parsedAttachments.code ?? 'INVALID_IMAGE_ATTACHMENT',
        message: parsedAttachments.message,
      }
    }
    if (jiraTicketKey !== undefined && (typeof jiraTicketKey !== 'string' || !/^[A-Z][A-Z0-9_]{0,19}-\d{1,10}$/.test(jiraTicketKey))) {
      return { ok: false, status: 400, code: 'INVALID_JIRA_TICKET_KEY', message: agentMessage('dispatch.error.INVALID_JIRA_TICKET_KEY') }
    }
    if (jiraTicketTitle !== undefined && (typeof jiraTicketTitle !== 'string' || jiraTicketTitle.length > 300)) {
      return { ok: false, status: 400, code: 'INVALID_JIRA_TICKET_TITLE', message: agentMessage('dispatch.error.INVALID_JIRA_TICKET_TITLE') }
    }
    if (progressTodoId !== undefined && (typeof progressTodoId !== 'string' || !/^spec\/job\/[A-Za-z0-9._-]+\.md:(document|\d+|task-[a-f0-9]{24}-\d+)$/i.test(progressTodoId))) {
      return { ok: false, status: 400, code: 'INVALID_PROGRESS_TODO', message: agentMessage('dispatch.error.INVALID_PROGRESS_TODO') }
    }
    if (progressSourceFileLabel !== undefined && (typeof progressSourceFileLabel !== 'string' || !/^spec\/job\/[A-Za-z0-9._-]+\.md$/i.test(progressSourceFileLabel))) {
      return { ok: false, status: 400, code: 'INVALID_PROGRESS_SOURCE', message: agentMessage('dispatch.error.INVALID_PROGRESS_SOURCE') }
    }
    if (typeof modelId !== 'string' || modelId.length > 120) {
      return { ok: false, status: 400, code: 'INVALID_MODEL', message: agentMessage('agent.dispatch.invalidModel') }
    }
    if (effort !== 'default' && !ALLOWED_EFFORTS.has(effort)) {
      return { ok: false, status: 400, code: 'INVALID_EFFORT', message: agentMessage('agent.dispatch.invalidEffort') }
    }

    let workingDirectory
    try {
      workingDirectory = fs.realpathSync(projectPath)
      if (!fs.statSync(workingDirectory).isDirectory() || workingDirectory === path.parse(workingDirectory).root) {
        throw new Error('invalid directory')
      }
    } catch {
      return { ok: false, status: 400, code: 'PROJECT_DIRECTORY_UNAVAILABLE', message: agentMessage('dispatch.error.PROJECT_DIRECTORY_UNAVAILABLE') }
    }

    const provider = storage.getProviderById(providerId)
    if (!provider) return { ok: false, status: 404, code: 'PROVIDER_NOT_FOUND', message: agentMessage('dispatch.error.PROVIDER_NOT_FOUND') }
    const executable = resolveExecutableFile(provider.cliPath, adapterOptions)
    if (!executable.ok) return { ok: false, status: 400, code: 'CLI_UNAVAILABLE', message: agentMessage('dispatch.error.CLI_UNAVAILABLE') }

    const catalog = getProviderModelCatalog(provider, adapterOptions)
    const model = catalog.models.find((item) => item.id === modelId)
    if (!model) return { ok: false, status: 400, code: 'MODEL_UNAVAILABLE', message: agentMessage('dispatch.error.MODEL_UNAVAILABLE') }
    if (effort !== 'default' && !model.efforts.includes(effort)) {
      return { ok: false, status: 400, code: 'EFFORT_UNAVAILABLE', message: agentMessage('dispatch.error.EFFORT_UNAVAILABLE') }
    }

    let progressTasks = []
    if (progressSourceFileLabel) {
      if (taskType !== 'custom') return { ok: false, status: 400, code: 'INVALID_PROGRESS_SOURCE', message: agentMessage('agent.dispatch.progressRestricted') }
      try { progressTasks = readProgressTasks(workingDirectory, progressSourceFileLabel) }
      catch { return { ok: false, status: 400, code: 'INVALID_PROGRESS_SOURCE', message: agentMessage('agent.dispatch.progressUnreadable') } }
      if (progressTodoId && !progressTodoId.endsWith(':document')) progressTasks = progressTasks.filter((todo) => todo.id === progressTodoId || todo.taskId === progressTodoId)
      if (!progressTasks.length || progressTasks.length > 1000) return { ok: false, status: 400, code: 'INVALID_PROGRESS_TODO', message: agentMessage('agent.dispatch.invalidTaskCount') }
    }
    const appliedRules = ruleStorage.getEffectiveRules(providerId)
    const resolvedJobId = typeof jobId === 'string' && JOB_ID_PATTERN.test(jobId) ? jobId : createDispatchJobId()
    if (jobs.has(resolvedJobId)) return { ok: false, status: 409, code: 'JOB_ALREADY_EXISTS', message: agentMessage('agent.dispatch.duplicateId') }
    let attachmentPaths
    try {
      attachmentPaths = writeImageAttachments(workingDirectory, resolvedJobId, parsedAttachments.value)
    } catch {
      return { ok: false, status: 500, code: 'IMAGE_ATTACHMENT_WRITE_FAILED', message: agentMessage('dispatch.error.IMAGE_ATTACHMENT_WRITE_FAILED') }
    }
    const fullPrompt = buildTaskPrompt({
      taskType,
      projectName: projectName.trim(),
      branchName,
      prompt,
      attachmentPaths,
      rules: appliedRules,
    }) + progressPrompt(progressTasks)
    if (fullPrompt.length > MAX_PROMPT_LENGTH + MAX_RULE_CONTEXT_LENGTH) {
      removeImageAttachments(attachmentPaths)
      return { ok: false, status: 400, code: 'RULE_CONTEXT_TOO_LARGE', message: agentMessage('dispatch.error.RULE_CONTEXT_TOO_LARGE') }
    }

    const job = {
      id: resolvedJobId,
      status: 'queued',
      providerId,
      taskType,
      projectId,
      projectName: projectName.trim(),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      output: '',
      resultOutput: '',
      pendingLine: '',
      error: null,
      exitCode: null,
      child: null,
      timeout: null,
      projectPath: workingDirectory,
      jiraTicketKey: jiraTicketKey ?? null,
      jiraTicketTitle: jiraTicketTitle ?? '',
      progressTodoId: progressTodoId ?? null,
      progressSourceFileLabel: progressSourceFileLabel ?? null,
      branchName: typeof branchName === 'string' ? branchName.slice(0, 200) : null,
      modelId,
      effort,
      artifactPath: null,
      attachmentPaths,
      summary: typeof jiraTicketTitle === 'string' && jiraTicketTitle.trim() ? jiraTicketTitle.trim() : taskType === 'custom' ? 'AI Work Center dispatch' : taskType === 'jira' ? jiraTicketKey || 'Jira AI dispatch' : 'Project architecture analysis',
      inputMarkdown: prompt,
    }
    if (jobs.size >= MAX_JOBS) {
      const oldestFinishedJob = [...jobs.values()].find((item) => !['queued', 'running'].includes(item.status))
      if (oldestFinishedJob) jobs.delete(oldestFinishedJob.id)
      else {
        removeImageAttachments(attachmentPaths)
        return { ok: false, status: 429, code: 'TOO_MANY_ACTIVE_JOBS', message: agentMessage('dispatch.error.TOO_MANY_ACTIVE_JOBS') }
      }
    }
    job.progress = createRunProgress(job, progressTasks, (event) => {
      options.persistJob?.(snapshot(job))
      for (const listener of subscribers.get(job.id) ?? []) {
        try { listener(event) } catch { /* A disconnected subscriber cannot fail the run. */ }
      }
    }, options.verifyTask)
    jobs.set(job.id, job)

    let resultDirectory
    try {
      if (isReadOnlyTaskType(taskType) && providerId === 'codex') resultDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'super-developer-analysis-'))
      const resultPath = resultDirectory ? path.join(resultDirectory, 'result.txt') : undefined
      const command = buildProviderCommand(providerId, executable.resolvedPath, modelId, effort, taskType, resultPath, attachmentPaths)
      const decoder = new StringDecoder('utf8')
      const child = spawn(command.executable, command.args, {
        cwd: workingDirectory,
        env: buildSafeSubprocessEnv(),
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      job.child = child
      job.status = 'running'
      job.progress.emit('run.started')
      job.updatedAt = new Date().toISOString()
      job.timeout = setTimeout(() => {
        if (job.status !== 'running') return
        finish(job, 'timed_out', agentMessage('agent.dispatch.timedOut', { cli: cliLabel(job.providerId), minutes: Math.round(timeoutMs / 60_000) }))
        child.kill('SIGTERM')
        const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
        killTimer.unref?.()
      }, timeoutMs)
      job.timeout.unref?.()
      child.stdout.on('data', (chunk) => collectStreamText(job, command.inputFormat, decoder.write(chunk)))
      child.stderr.on('data', (chunk) => {
        job.output = clipAppend(job.output, `\n${chunk.toString('utf8')}`)
        job.updatedAt = new Date().toISOString()
      })
      child.on('error', (error) => finish(job, 'failed', agentMessage('agent.dispatch.startError', { cli: cliLabel(job.providerId), detail: error.message.slice(0, 500) })))
      child.stdin.on('error', (error) => {
        if (job.status !== 'running') return
        finish(job, 'failed', agentMessage('agent.dispatch.inputError', { cli: cliLabel(job.providerId), detail: error.message.slice(0, 500) }))
        child.kill('SIGTERM')
        const killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
        killTimer.unref?.()
        child.once('close', () => clearTimeout(killTimer))
      })
      child.on('close', async (code, signal) => {
        job.exitCode = Number.isInteger(code) ? code : null
        collectStreamText(job, command.inputFormat, decoder.end(), true)
        if (resultDirectory) {
          try {
            if (code === 0 && job.status === 'running') job.resultOutput = fs.readFileSync(resultPath, 'utf8')
          } catch { /* Missing final output is handled below. */ }
          finally { fs.rmSync(resultDirectory, { recursive: true, force: true }) }
        }
        removeImageAttachments(job.attachmentPaths)
        job.attachmentPaths = []
        job.progress.feed('', true)
        await job.progress.drain()
        if (job.status !== 'running') return
        if (code === 0) {
          try {
            const resultOutput = clipAppend('', sanitizeCliOutput(job.resultOutput))
            if (!resultOutput.trim()) {
              finish(job, 'failed', agentMessage('agent.dispatch.noOutput', { cli: cliLabel(job.providerId) }))
              return
            }
            job.resultOutput = resultOutput
            if (job.jiraTicketKey) {
              const artifact = specStore.writeJiraAnalysis({
                projectPath: job.projectPath,
                ticketKey: job.jiraTicketKey,
                ticketTitle: job.jiraTicketTitle,
                projectName: job.projectName,
                branchName: job.branchName,
                providerId: job.providerId,
                modelId: job.modelId,
                effort: job.effort,
                output: resultOutput,
              })
              job.artifactPath = artifact.relativePath
            }
            let incompleteTasks = job.tasks.filter((task) => !['completed', 'skipped'].includes(task.status))
            if (incompleteTasks.length > 0 && job.progressSourceFileLabel) {
              const fallbackCmd = findProjectVerificationCommand(job.projectPath) || ['npm', 'test']
              const verifier = options.verifyTask || verifyTask
              let checkResult
              try {
                checkResult = await verifier(fallbackCmd, job.projectPath)
              } catch (verifyErr) {
                checkResult = { ok: false, output: String(verifyErr?.message || verifyErr) }
              }
              if (checkResult.ok) {
                for (const task of incompleteTasks) {
                  task.status = 'completed'
                  task.completedAt = new Date().toISOString()
                  task.evidence = agentMessage('agent.dispatch.autoVerificationPassed', { command: fallbackCmd.join(' '), output: checkResult.output }).slice(0, 16000)
                  task.error = null
                  writeProgressCompletion(job.projectPath, task.taskId, task.title)
                  job.progress?.emit('task.completed', task)
                }
                incompleteTasks = []
              }
            }
            const incompleteMsg = incompleteTasks.length > 0
              ? agentMessage('agent.dispatch.incompleteTasksSummary', { incomplete: incompleteTasks.length, total: job.tasks.length, titles: incompleteTasks.map((t) => t.title).slice(0, 2).join('、'), more: incompleteTasks.length > 2 ? agentMessage('agent.dispatch.incompleteTasksEtc') : '' })
              : null
            finish(job, incompleteTasks.length > 0 ? 'failed' : 'succeeded', incompleteMsg)
          } catch (error) {
            finish(job, 'failed', error instanceof Error ? error.message.slice(0, 500) : agentMessage('agent.dispatch.jiraSaveFailed'))
          }
        }
        else {
          const exitReason = Number.isInteger(code) ? agentMessage('agent.dispatch.exitCode', { code }) : signal ? agentMessage('agent.dispatch.signal', { signal }) : agentMessage('agent.dispatch.unknownExit')
          finish(job, 'failed', agentMessage('agent.dispatch.failed', { cli: cliLabel(job.providerId), reason: exitReason }))
        }
      })

      child.stdin.end(getPromptInput(fullPrompt, command.inputFormat))
    } catch (error) {
      if (resultDirectory) fs.rmSync(resultDirectory, { recursive: true, force: true })
      removeImageAttachments(job.attachmentPaths)
      job.attachmentPaths = []
      finish(job, 'failed', error instanceof Error
        ? agentMessage('agent.dispatch.startError', { cli: cliLabel(job.providerId), detail: error.message.slice(0, 500) })
        : agentMessage('agent.dispatch.startFailed', { cli: cliLabel(job.providerId) }))
    }

    return { ok: true, job: snapshot(job) }
  }

  function get(jobId) {
    const job = jobs.get(jobId)
    return job ? snapshot(job) : null
  }

  function cancel(jobId) {
    const job = jobs.get(jobId)
    if (!job) return null
    if (job.status === 'running') {
      finish(job, 'cancelled', agentMessage('agent.dispatch.cancelled'))
      removeImageAttachments(job.attachmentPaths)
      job.attachmentPaths = []
      job.child?.kill('SIGTERM')
      const killTimer = setTimeout(() => job.child?.kill('SIGKILL'), 3000)
      killTimer.unref?.()
    }
    return snapshot(job)
  }

  function shutdown() {
    for (const job of jobs.values()) {
      if (job.status !== 'running') continue
      finish(job, 'cancelled', agentMessage('agent.dispatch.shutdown'))
      removeImageAttachments(job.attachmentPaths)
      job.attachmentPaths = []
      job.child?.kill('SIGTERM')
      const killTimer = setTimeout(() => job.child?.kill('SIGKILL'), 3000)
      killTimer.unref?.()
    }
  }

  function subscribe(jobId, listener) {
    if (!subscribers.has(jobId)) subscribers.set(jobId, new Set())
    subscribers.get(jobId).add(listener)
    return () => { const listeners = subscribers.get(jobId); listeners?.delete(listener); if (!listeners?.size) subscribers.delete(jobId) }
  }

  return { start, get, cancel, shutdown, subscribe }
}
