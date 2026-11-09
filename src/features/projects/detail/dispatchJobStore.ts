import { cancelDispatch, createAiJob, deleteAiJob, getDispatchJob, listAiJobs, promptTranslationJob, startDispatch, updateAiJob, updateAiJobFailure, subscribeDispatchEvents } from './dispatchClient'
import { DispatchClientError } from './dispatchClient'
import type { AiJobRecord, DispatchJob, StartDispatchInput, AgentExecutionEvent, AgentConnectionState } from './dispatchClient'

export interface TrackedDispatchJob {
  job: DispatchJob
  taskType: StartDispatchInput['taskType']
  branchName: string | null
  modelId: string
  effort: string
  jiraTicketKey?: string
  jiraTicketTitle?: string
  architectureSaving?: boolean
  architectureSaved?: boolean
  architectureSaveError?: string | null
  progressTodoId?: string
  progressSourceFileLabel?: string
  connection?: AgentConnectionState
  aiJob: AiJobRecord
}

type ArchitectureSaver = (projectId: string, analysis: {
  output: string
  analyzedAt: string
  branchName: string | null
  providerId: string
  modelId: string
  effort: string
}) => Promise<void>

const listeners = new Set<() => void>()
const completionListeners = new Set<(record: TrackedDispatchJob) => void>()
let jobs: TrackedDispatchJob[] = []
const pollers = new Map<string, ReturnType<typeof setInterval>>()
const streams = new Map<string, () => void>()
const persistence = new Map<string, Promise<unknown>>()
const architectureSavers = new Map<string, ArchitectureSaver>()
const progressSavers = new Map<string, () => Promise<void>>()
const MAX_TRACKED_JOBS = 100
const LOST_DISPATCH_MESSAGE = 'Local Agent 已重新啟動，原執行中的工作已遺失。'

function publish() {
  for (const listener of listeners) listener()
}

function upsert(record: TrackedDispatchJob, notifyNewCompletion = false) {
  const previous = jobs.find((item) => item.job.id === record.job.id)
  const orderedJobs = [...jobs.filter((item) => item.job.id !== record.job.id), record]
    .sort((left, right) => Date.parse(right.job.startedAt) - Date.parse(left.job.startedAt))
  const activeJobs = orderedJobs.filter((item) => ['queued', 'running'].includes(item.job.status))
  const finishedJobs = orderedJobs.filter((item) => !['queued', 'running'].includes(item.job.status))
  jobs = [...activeJobs, ...finishedJobs.slice(0, Math.max(0, MAX_TRACKED_JOBS - activeJobs.length))]
  publish()
  if (!['queued', 'running'].includes(record.job.status)
    && (previous ? ['queued', 'running'].includes(previous.job.status) : notifyNewCompletion)) {
    for (const listener of completionListeners) listener(record)
  }
}

function stopPolling(jobId: string) {
  const timer = pollers.get(jobId)
  if (timer) clearInterval(timer)
  pollers.delete(jobId)
  const close = streams.get(jobId)
  streams.delete(jobId)
  close?.()
}

async function saveProgress(record: TrackedDispatchJob) {
  const saver = progressSavers.get(record.job.id)
  if (!saver || record.taskType !== 'custom' || record.job.status !== 'succeeded' || !record.job.tasks?.length || !record.job.tasks.every((task) => task.status === 'completed')) return
  await saver()
  progressSavers.delete(record.job.id)
}

function markLostDispatch(jobId: string, status: 'failed' | 'cancelled') {
  const previous = jobs.find((item) => item.job.id === jobId)
  if (!previous) return null
  const job = { ...previous.job, tasks: previous.job.tasks?.map((task) => task.status === 'running' ? { ...task, status: 'failed' as const, error: LOST_DISPATCH_MESSAGE, completedAt: new Date().toISOString() } : task), status, updatedAt: new Date().toISOString(), error: LOST_DISPATCH_MESSAGE, errorReason: LOST_DISPATCH_MESSAGE, exitCode: null }
  upsert({ ...previous, job })
  stopPolling(jobId)
  progressSavers.delete(jobId)
  void updateAiJob(jobId, job).catch(() => undefined)
  return job
}

async function saveArchitecture(record: TrackedDispatchJob) {
  const saver = architectureSavers.get(record.job.id)
  if (!saver || record.taskType !== 'architecture' || record.job.status !== 'succeeded' || record.architectureSaved || record.architectureSaving) return
  const savingRecord = { ...record, architectureSaving: true, architectureSaveError: null }
  upsert(savingRecord)
  try {
    await saver(record.job.projectId, {
      output: record.job.resultOutput,
      analyzedAt: record.job.updatedAt || new Date().toISOString(),
      branchName: record.branchName,
      providerId: record.job.providerId,
      modelId: record.modelId,
      effort: record.effort,
    })
    upsert({ ...savingRecord, architectureSaving: false, architectureSaved: true, architectureSaveError: null })
    architectureSavers.delete(record.job.id)
  } catch (error) {
    upsert({ ...savingRecord, architectureSaving: false, architectureSaveError: error instanceof Error ? error.message : '保存 AI 架構分析結果失敗。' })
  }
}

function persistJob(job: DispatchJob) {
  const previous = persistence.get(job.id) ?? Promise.resolve()
  const saving = previous.catch(() => undefined).then(() => updateAiJob(job.id, job))
  persistence.set(job.id, saving)
  void saving.catch(() => undefined).finally(() => { if (persistence.get(job.id) === saving) persistence.delete(job.id) })
}

export function mergeAgentEvent(job: DispatchJob, event: AgentExecutionEvent): DispatchJob {
  if (event.runId !== job.id || event.projectId !== job.projectId || event.sequence <= (job.events?.at(-1)?.sequence ?? 0)) return job
  const tasks = event.type === 'run.started' ? event.tasks : [...(job.tasks ?? [])]
  if (event.type !== 'run.started') for (const task of event.tasks) {
    const index = tasks.findIndex((item) => item.taskId === task.taskId)
    if (index >= 0) tasks[index] = task
    else tasks.push(task)
  }
  const terminal = event.type === 'run.completed' || event.type === 'run.failed'
  const status = terminal && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(event.status) ? event.status as DispatchJob['status'] : job.status
  return { ...job, status, error: terminal ? event.error : job.error, errorReason: terminal ? event.error : job.errorReason, tasks, events: [...(job.events ?? []), event], updatedAt: event.timestamp }
}

function watch(jobId: string) {
  if (pollers.has(jobId)) return
  let inFlight = false
  const refresh = async () => {
    if (inFlight) return
    inFlight = true
    try {
      const current = jobs.find((item) => item.job.id === jobId)
      if (!current) return stopPolling(jobId)
      let latest = current.job.projectId === 'library-prompt' ? await promptTranslationJob(jobId) : await getDispatchJob(jobId)
      const previous = jobs.find((item) => item.job.id === jobId)
      if (!previous) return stopPolling(jobId)
      if (latest.id !== jobId || latest.projectId !== previous.job.projectId) return
      const previousSequence = previous.job.events?.at(-1)?.sequence ?? 0
      const latestSequence = latest.events?.at(-1)?.sequence ?? 0
      if (latestSequence < previousSequence) return
      if (!['queued', 'running'].includes(previous.job.status) && ['queued', 'running'].includes(latest.status)) return
      if (!latest.events?.length && previous.job.events?.length) latest = { ...latest, tasks: previous.job.tasks, events: previous.job.events }
      const updated = { ...previous, job: latest }
      upsert(updated)
      persistJob(latest)
      if (latest.status === 'succeeded') await saveArchitecture(updated)
      if (latest.status === 'succeeded') await saveProgress(updated)
      if (!['queued', 'running'].includes(latest.status)) {
        stopPolling(jobId)
        if (latest.status !== 'succeeded') progressSavers.delete(jobId)
      }
    } catch (error) {
      if (error instanceof DispatchClientError && error.status === 404) markLostDispatch(jobId, 'failed')
      // Keep polling for transient Local Agent restarts or fetch errors.
    } finally {
      inFlight = false
    }
  }
  pollers.set(jobId, setInterval(() => void refresh(), 1500))
  const current = jobs.find((item) => item.job.id === jobId)
  if (current && current.job.projectId !== 'library-prompt') {
    const close = subscribeDispatchEvents(current.job, (event) => {
      const previous = jobs.find((item) => item.job.id === jobId)
      if (!previous) return
      const job = mergeAgentEvent(previous.job, event)
      if (job === previous.job) return
      upsert({ ...previous, job })
      const terminal = event.type === 'run.completed' || event.type === 'run.failed'
      if (terminal) void refresh()
      else persistJob(job)
    }, (connection) => {
      const previous = jobs.find((item) => item.job.id === jobId)
      if (previous && previous.connection !== connection) upsert({ ...previous, connection })
    })
    streams.set(jobId, close)
  }
  void refresh()
}

export function subscribeDispatchJobs(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function subscribeDispatchCompletions(listener: (record: TrackedDispatchJob) => void) {
  completionListeners.add(listener)
  return () => { completionListeners.delete(listener) }
}

export function getDispatchJobsSnapshot(): readonly TrackedDispatchJob[] {
  return jobs
}

function dispatchJobFromRecord(record: AiJobRecord): DispatchJob {
  const status = record.status === 'SUCCESS' ? 'succeeded' : record.status === 'RUNNING' ? 'running' : 'failed'
  return { tasks: record.tasks ?? [], events: record.events ?? [], id: record.id, status, providerId: record.providerId, projectId: record.projectId, projectName: record.projectName, startedAt: record.startedAt, updatedAt: record.updatedAt, output: record.executionOutput, resultOutput: record.outputMarkdown, error: record.errorReason, exitCode: record.exitCode, artifactPath: null, taskType: record.taskType, modelId: record.modelId, effort: record.effort, branchName: record.branchName, jiraTicketKey: record.jiraTicketKey, jiraTicketTitle: record.jiraTicketTitle, progressTodoId: record.progressTodoId, progressSourceFileLabel: record.progressSourceFileLabel, summary: record.summary, inputMarkdown: record.inputMarkdown, outputMarkdown: record.outputMarkdown, executionOutput: record.executionOutput, errorReason: record.errorReason }
}

function trackedFromRecord(record: AiJobRecord): TrackedDispatchJob {
  return { job: dispatchJobFromRecord(record), taskType: record.taskType, branchName: record.branchName, modelId: record.modelId, effort: record.effort, jiraTicketKey: record.jiraTicketKey ?? undefined, jiraTicketTitle: record.jiraTicketTitle || undefined, progressTodoId: record.progressTodoId ?? undefined, progressSourceFileLabel: record.progressSourceFileLabel ?? undefined, architectureSaved: false, architectureSaveError: null, aiJob: record }
}

export async function loadTrackedDispatchJobs() {
  const records = await listAiJobs()
  records.forEach((record) => {
    const current = jobs.find((item) => item.job.id === record.id)
    if (!current || (record.events?.at(-1)?.sequence ?? 0) >= (current.job.events?.at(-1)?.sequence ?? 0) && Date.parse(record.updatedAt) >= Date.parse(current.job.updatedAt)) upsert({ ...current, ...trackedFromRecord(record), connection: current?.connection })
  })
  for (const record of records.filter((item) => item.status === 'RUNNING')) watch(record.id)
}

export function removeTrackedDispatchJobsByDateRange(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T23:59:59.999Z`)
  jobs = jobs.filter((record) => {
    const createdAt = Date.parse(record.aiJob.createdAt || record.job.startedAt)
    const keep = !Number.isFinite(createdAt) || createdAt < start || createdAt > end
    if (!keep) { stopPolling(record.job.id); progressSavers.delete(record.job.id); architectureSavers.delete(record.job.id) }
    return keep
  })
  publish()
}

export async function removeTrackedDispatchJob(jobId: string) {
  const deleted = await deleteAiJob(jobId)
  if (!deleted) return false
  stopPolling(jobId)
  architectureSavers.delete(jobId)
  progressSavers.delete(jobId)
  jobs = jobs.filter((record) => record.job.id !== jobId)
  publish()
  return true
}

export async function startTrackedDispatch(input: StartDispatchInput, saveArchitecture?: ArchitectureSaver, saveProgressTodo?: () => Promise<void>, startJob = startDispatch) {
  const aiJob = await createAiJob(input)
  if (saveProgressTodo && input.taskType === 'custom' && input.progressSourceFileLabel) progressSavers.set(aiJob.id, saveProgressTodo)
  let job: DispatchJob
  try {
    job = await startJob({ ...input, jobId: aiJob.id })
  } catch (error) {
    progressSavers.delete(aiJob.id)
    await updateAiJobFailure(aiJob.id, error instanceof Error ? error.message : 'AI CLI 啟動失敗。').catch(() => undefined)
    throw error
  }
  const tracked: TrackedDispatchJob = { job, taskType: input.taskType, branchName: input.branchName, modelId: input.modelId, effort: input.effort, jiraTicketKey: input.jiraTicketKey, jiraTicketTitle: input.jiraTicketTitle, progressTodoId: input.progressTodoId, progressSourceFileLabel: input.progressSourceFileLabel, architectureSaved: false, architectureSaveError: null, aiJob: { ...aiJob, status: ['queued', 'running'].includes(job.status) ? 'RUNNING' : job.status === 'succeeded' ? 'SUCCESS' : 'FAILED', outputMarkdown: job.resultOutput, executionOutput: job.output, errorReason: job.error, exitCode: job.exitCode, updatedAt: job.updatedAt } }
  upsert(tracked, true)
  await updateAiJob(aiJob.id, job).catch(() => undefined)
  if (saveArchitecture && input.taskType === 'architecture') architectureSavers.set(job.id, saveArchitecture)
  if (['queued', 'running'].includes(job.status)) watch(job.id)
  if (job.status === 'succeeded') await saveProgress(tracked)
  return job
}

export async function cancelTrackedDispatch(jobId: string) {
  let job: DispatchJob
  const previous = jobs.find((item) => item.job.id === jobId)
  try {
    job = previous?.job.projectId === 'library-prompt' ? await promptTranslationJob(jobId, true) : await cancelDispatch(jobId)
  } catch (error) {
    if (error instanceof DispatchClientError && error.status === 404) {
      const lostJob = markLostDispatch(jobId, 'cancelled')
      if (lostJob) return lostJob
    }
    throw error
  }
  if (previous) {
    upsert({ ...previous, job })
    void updateAiJob(jobId, job).catch(() => undefined)
    if (!['queued', 'running'].includes(job.status)) {
      stopPolling(jobId)
      progressSavers.delete(jobId)
    }
  }
  return job
}

export async function retryArchitectureSave(jobId: string) {
  const record = jobs.find((item) => item.job.id === jobId)
  if (!record) return
  await saveArchitecture({ ...record, architectureSaveError: null })
}
