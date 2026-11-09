import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
import { isAgentEvent, isAgentTask } from '../../../../shared/agentProgress'
import type { AgentTask, AgentExecutionEvent } from '../../../../shared/agentProgress'
export type { AgentTask, AgentExecutionEvent } from '../../../../shared/agentProgress'
export type DispatchJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'timed_out'
export type DispatchTaskType = 'custom' | 'jira' | 'architecture' | 'library-skill' | 'library-mcp'

export interface DispatchJob {
  tasks?: AgentTask[]
  events?: AgentExecutionEvent[]
  id: string
  status: DispatchJobStatus
  providerId: string
  projectId: string
  projectName: string
  startedAt: string
  updatedAt: string
  output: string
  resultOutput: string
  error: string | null
  exitCode: number | null
  artifactPath: string | null
  taskType: DispatchTaskType
  modelId: string
  effort: string
  branchName: string | null
  jiraTicketKey: string | null
  jiraTicketTitle: string
  progressTodoId?: string | null
  progressSourceFileLabel?: string | null
  summary: string
  inputMarkdown: string
  outputMarkdown: string
  executionOutput: string
  errorReason: string | null
}

export interface ImageAttachment {
  name: string
  mimeType: string
  dataUrl: string
}

export interface StartDispatchInput {
  taskType: DispatchTaskType
  projectId: string
  providerId: string
  modelId: string
  effort: string
  projectPath: string
  projectName: string
  branchName: string | null
  prompt: string
  imageAttachment?: ImageAttachment
  imageAttachments?: ImageAttachment[]
  jiraTicketKey?: string
  jiraTicketTitle?: string
  progressTodoId?: string
  progressSourceFileLabel?: string
  jobId?: string
}

export type AiJobStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN ERROR'

export interface AiJobRecord {
  tasks?: AgentTask[]
  events?: AgentExecutionEvent[]
  id: string
  taskType: StartDispatchInput['taskType']
  projectId: string
  projectName: string
  providerId: string
  modelId: string
  effort: string
  branchName: string | null
  jiraTicketKey: string | null
  jiraTicketTitle: string
  progressTodoId?: string | null
  progressSourceFileLabel?: string | null
  summary: string
  inputMarkdown: string
  status: AiJobStatus
  outputMarkdown: string
  executionOutput: string
  errorReason: string | null
  exitCode: number | null
  createdAt: string
  startedAt: string
  updatedAt: string
}

export class DispatchClientError extends Error {
  readonly status?: number
  readonly code?: string

  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'DispatchClientError'
    this.status = status
    this.code = code
  }
}

const KNOWN_ERROR_CODES: Record<string, string> = {
  INVALID_IMAGE_ATTACHMENT: 'dispatch.error.INVALID_IMAGE_ATTACHMENT',
  IMAGE_ATTACHMENT_MAX_COUNT: 'dispatch.error.IMAGE_ATTACHMENT_MAX_COUNT',
  IMAGE_ATTACHMENT_TOO_LARGE: 'dispatch.error.IMAGE_ATTACHMENT_TOO_LARGE',
  IMAGE_ATTACHMENT_WRITE_FAILED: 'dispatch.error.IMAGE_ATTACHMENT_WRITE_FAILED',
  TOO_MANY_ACTIVE_JOBS: 'dispatch.error.TOO_MANY_ACTIVE_JOBS',
  RULE_CONTEXT_TOO_LARGE: 'dispatch.error.RULE_CONTEXT_TOO_LARGE',
  PROJECT_DIRECTORY_UNAVAILABLE: 'dispatch.error.PROJECT_DIRECTORY_UNAVAILABLE',
  PROVIDER_NOT_FOUND: 'dispatch.error.PROVIDER_NOT_FOUND',
  CLI_UNAVAILABLE: 'dispatch.error.CLI_UNAVAILABLE',
  MODEL_UNAVAILABLE: 'dispatch.error.MODEL_UNAVAILABLE',
  EFFORT_UNAVAILABLE: 'dispatch.error.EFFORT_UNAVAILABLE',
  INVALID_PROMPT: 'dispatch.error.INVALID_PROMPT',
  INVALID_JIRA_TICKET_KEY: 'dispatch.error.INVALID_JIRA_TICKET_KEY',
  INVALID_JIRA_TICKET_TITLE: 'dispatch.error.INVALID_JIRA_TICKET_TITLE',
  INVALID_PROGRESS_TODO: 'dispatch.error.INVALID_PROGRESS_TODO',
  INVALID_PROGRESS_SOURCE: 'dispatch.error.INVALID_PROGRESS_SOURCE',
  FAILED_TO_CONNECT: 'dispatch.error.FAILED_TO_CONNECT',
  INVALID_RESPONSE_FORMAT: 'dispatch.error.INVALID_RESPONSE_FORMAT',
  DISPATCH_FAILED: 'dispatch.error.DISPATCH_FAILED',
  PROVIDER_UNSUPPORTED: 'dispatch.error.PROVIDER_UNSUPPORTED',
  MODEL_CATALOG_NOT_LOADED: 'dispatch.error.MODEL_CATALOG_NOT_LOADED',
}

export function resolveDispatchErrorMessage(
  error: unknown,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (error instanceof DispatchClientError && error.code) {
    const key = KNOWN_ERROR_CODES[error.code] ?? `dispatch.error.${error.code}`
    const translated = t(key)
    if (translated && translated !== key) return translated
  }

  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!rawMessage) return t('aiWork.dispatchFailed')

  return rawMessage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseTaskType(value: unknown): DispatchTaskType {
  return value === 'custom' || value === 'architecture' || value === 'library-skill' || value === 'library-mcp' ? value : 'jira'
}

function parseJob(value: unknown): DispatchJob {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.status !== 'string') {
    throw new DispatchClientError('Local Agent 派工狀態格式不正確。', undefined, 'INVALID_RESPONSE_FORMAT')
  }
  return {
    tasks: Array.isArray(value.tasks) ? value.tasks.filter(isAgentTask) : [],
    events: Array.isArray(value.events) ? value.events.filter(isAgentEvent) : [],
    id: value.id,
    status: value.status as DispatchJobStatus,
    providerId: typeof value.providerId === 'string' ? value.providerId : '',
    projectId: typeof value.projectId === 'string' ? value.projectId : '',
    projectName: typeof value.projectName === 'string' ? value.projectName : '',
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    output: typeof value.output === 'string' ? value.output : '',
    resultOutput: typeof value.resultOutput === 'string' ? value.resultOutput : '',
    error: typeof value.error === 'string' ? value.error : null,
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : null,
    artifactPath: typeof value.artifactPath === 'string' ? value.artifactPath : null,
    taskType: parseTaskType(value.taskType),
    modelId: typeof value.modelId === 'string' ? value.modelId : 'default',
    effort: typeof value.effort === 'string' ? value.effort : 'default',
    branchName: typeof value.branchName === 'string' ? value.branchName : null,
    jiraTicketKey: typeof value.jiraTicketKey === 'string' ? value.jiraTicketKey : null,
    jiraTicketTitle: typeof value.jiraTicketTitle === 'string' ? value.jiraTicketTitle : '',
    progressTodoId: typeof value.progressTodoId === 'string' ? value.progressTodoId : null,
    progressSourceFileLabel: typeof value.progressSourceFileLabel === 'string' ? value.progressSourceFileLabel : null,
    summary: typeof value.summary === 'string' ? value.summary : '',
    inputMarkdown: typeof value.inputMarkdown === 'string' ? value.inputMarkdown : '',
    outputMarkdown: typeof value.outputMarkdown === 'string' ? value.outputMarkdown : '',
    executionOutput: typeof value.executionOutput === 'string' ? value.executionOutput : '',
    errorReason: typeof value.errorReason === 'string' ? value.errorReason : null,
  }
}

async function requestJson(url: string, init?: RequestInit, fetcher: typeof fetch = (...args) => fetch(...args)) {
  let response: Response
  try {
    response = await localAgentFetch(fetcher)(url, init)
  } catch {
    throw new DispatchClientError('無法連線至本機 Local Agent；請確認 Local Agent 已啟動。', undefined, 'FAILED_TO_CONNECT')
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new DispatchClientError('Local Agent 回應格式不正確。', response.status, 'INVALID_RESPONSE_FORMAT')
  }
  if (!response.ok || !isRecord(data) || data.ok !== true) {
    const message = isRecord(data) && typeof data.message === 'string' ? data.message : 'Local Agent 派工請求失敗。'
    const code = isRecord(data) && typeof data.code === 'string'
      ? data.code
      : isRecord(data) && typeof data.errorCode === 'string'
        ? data.errorCode
        : undefined
    throw new DispatchClientError(message, response.status, code)
  }
  return data
}

export async function startDispatch(input: StartDispatchInput, fetcher?: typeof fetch): Promise<DispatchJob> {
  const data = await requestJson('/api/local-agent/dispatch', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, fetcher)
  return parseJob(data.job)
}

export async function getDispatchJob(jobId: string, signal?: AbortSignal, fetcher?: typeof fetch): Promise<DispatchJob> {
  const data = await requestJson(`/api/local-agent/dispatch/${encodeURIComponent(jobId)}`, { headers: { Accept: 'application/json' }, signal }, fetcher)
  return parseJob(data.job)
}

export async function cancelDispatch(jobId: string, fetcher?: typeof fetch): Promise<DispatchJob> {
  const data = await requestJson(`/api/local-agent/dispatch/${encodeURIComponent(jobId)}`, { method: 'DELETE', headers: { Accept: 'application/json' } }, fetcher)
  return parseJob(data.job)
}

export async function startPromptTranslation(input: StartDispatchInput, filename: string, language: string): Promise<DispatchJob> {
  const data = await requestJson(`/api/prompts/${encodeURIComponent(filename)}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId: input.jobId, content: input.prompt, language, providerId: input.providerId, modelId: input.modelId, effort: input.effort }),
  })
  return parseJob(data.job)
}

export async function promptTranslationJob(jobId: string, cancel = false): Promise<DispatchJob> {
  const data = await requestJson(`/api/prompts/translation/${encodeURIComponent(jobId)}`, { method: cancel ? 'DELETE' : 'GET', headers: { Accept: 'application/json' } })
  return parseJob(data.job)
}

async function requestJobJson(url: string, init: RequestInit = {}, fetcher: typeof fetch = (...args) => fetch(...args)) {
  let response: Response
  try {
    response = await fetcher(url, init)
  } catch (error) {
    throw new DispatchClientError(`無法連線至 Job 資料庫：${error instanceof Error ? error.message : String(error)}`)
  }
  let data: unknown
  try { data = await response.json() } catch { throw new DispatchClientError(`Job 資料庫回應格式不正確（HTTP ${response.status}）。`) }
  if (!response.ok || !isRecord(data)) {
    const error = isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string' ? data.error.message : `Job 資料庫請求失敗（HTTP ${response.status}）。`
    throw new DispatchClientError(error)
  }
  return data
}

function jobInput(input: StartDispatchInput) {
  return {
    taskType: input.taskType,
    projectId: input.projectId,
    projectName: input.projectName,
    providerId: input.providerId,
    modelId: input.modelId,
    effort: input.effort,
    branchName: input.branchName,
    jiraTicketKey: input.jiraTicketKey ?? null,
    jiraTicketTitle: input.jiraTicketTitle ?? '',
    progressTodoId: input.progressTodoId ?? null,
    progressSourceFileLabel: input.progressSourceFileLabel ?? null,
    summary: input.jiraTicketTitle || (input.taskType === 'custom' ? 'AI Work Center dispatch' : input.taskType === 'jira' ? input.jiraTicketKey || 'Jira AI dispatch' : 'Project architecture analysis'),
    inputMarkdown: input.prompt,
  }
}

function parseAiJob(value: unknown): AiJobRecord {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.status !== 'string') throw new DispatchClientError('Job 資料格式不正確。')
  return {
    tasks: Array.isArray(value.tasks) ? value.tasks.filter(isAgentTask) : [],
    events: Array.isArray(value.events) ? value.events.filter(isAgentEvent) : [],
    id: value.id,
    taskType: parseTaskType(value.taskType),
    projectId: typeof value.projectId === 'string' ? value.projectId : '',
    projectName: typeof value.projectName === 'string' ? value.projectName : '',
    providerId: typeof value.providerId === 'string' ? value.providerId : '',
    modelId: typeof value.modelId === 'string' ? value.modelId : 'default',
    effort: typeof value.effort === 'string' ? value.effort : 'default',
    branchName: typeof value.branchName === 'string' ? value.branchName : null,
    jiraTicketKey: typeof value.jiraTicketKey === 'string' ? value.jiraTicketKey : null,
    jiraTicketTitle: typeof value.jiraTicketTitle === 'string' ? value.jiraTicketTitle : '',
    summary: typeof value.summary === 'string' ? value.summary : '',
    progressTodoId: typeof value.progressTodoId === 'string' ? value.progressTodoId : null,
    progressSourceFileLabel: typeof value.progressSourceFileLabel === 'string' ? value.progressSourceFileLabel : null,
    inputMarkdown: typeof value.inputMarkdown === 'string' ? value.inputMarkdown : '',
    status: value.status as AiJobStatus,
    outputMarkdown: typeof value.outputMarkdown === 'string' ? value.outputMarkdown : '',
    executionOutput: typeof value.executionOutput === 'string' ? value.executionOutput : '',
    errorReason: typeof value.errorReason === 'string' ? value.errorReason : null,
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : null,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

export async function createAiJob(input: StartDispatchInput, fetcher?: typeof fetch) {
  const data = await requestJobJson('/api/jobs', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ job: jobInput(input) }) }, fetcher)
  return parseAiJob(data.job)
}

export async function listAiJobs(fetcher?: typeof fetch) {
  const data = await requestJobJson('/api/jobs', { headers: { Accept: 'application/json' } }, fetcher)
  return Array.isArray(data.jobs) ? data.jobs.map(parseAiJob) : []
}

export async function updateAiJob(id: string, job: DispatchJob, fetcher?: typeof fetch) {
  const status: AiJobStatus = job.status === 'succeeded' ? 'SUCCESS' : job.status === 'failed' ? 'FAILED' : ['queued', 'running'].includes(job.status) ? 'RUNNING' : 'UNKNOWN ERROR'
  const data = await requestJobJson(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: job.tasks, events: job.events, status, outputMarkdown: job.resultOutput || '', executionOutput: job.output || '', errorReason: job.error, exitCode: job.exitCode }) }, fetcher)
  return parseAiJob(data.job)
}

export async function updateAiJobFailure(id: string, errorReason: string, fetcher?: typeof fetch) {
  const data = await requestJobJson(`/api/jobs/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'UNKNOWN ERROR', outputMarkdown: '', executionOutput: '', errorReason, exitCode: null }) }, fetcher)
  return parseAiJob(data.job)
}

export async function deleteAiJob(id: string, fetcher?: typeof fetch) {
  const data = await requestJobJson(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Accept: 'application/json' } }, fetcher)
  return typeof data.deleted === 'number' ? data.deleted : 0
}

export async function deleteAiJobsByDateRange(from: string, to: string, fetcher?: typeof fetch) {
  const data = await requestJobJson(`/api/jobs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { method: 'DELETE', headers: { Accept: 'application/json' } }, fetcher)
  return typeof data.deleted === 'number' ? data.deleted : 0
}

export type AgentConnectionState = 'connecting' | 'connected' | 'polling' | 'closed'
export function subscribeDispatchEvents(job: DispatchJob, onEvent: (event: AgentExecutionEvent) => void, onConnection: (state: AgentConnectionState) => void) {
  if (typeof EventSource === 'undefined') { onConnection('polling'); return () => {} }
  let sequence = job.events?.at(-1)?.sequence ?? 0
  onConnection('connecting')
  let source: EventSource
  try { source = new EventSource(`/api/agent/runs/${encodeURIComponent(job.id)}/events?sinceSequence=${sequence}`) }
  catch { onConnection('polling'); return () => {} }
  const close = () => { source.close(); onConnection('closed') }
  source.onopen = () => onConnection('connected')
  source.onerror = () => onConnection('polling') // EventSource reconnects with Last-Event-ID; polling covers the gap.
  source.onmessage = (message) => {
    try {
      const event: unknown = JSON.parse(message.data)
      if (!isAgentEvent(event) || event.runId !== job.id || event.projectId !== job.projectId || event.sequence <= sequence) return
      sequence = event.sequence
      onEvent(event)
      if (event.type === 'run.completed' || event.type === 'run.failed') close()
    } catch { /* Polling remains available for malformed frames. */ }
  }
  return close
}
