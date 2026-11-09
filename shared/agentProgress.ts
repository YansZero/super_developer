export type AgentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'skipped'
export interface AgentTask {
  taskId: string
  title: string
  status: AgentTaskStatus
  startedAt: string | null
  completedAt: string | null
  message: string | null
  evidence: string | null
  error: string | null
}
export type AgentEventType = 'run.started' | 'task.started' | 'task.progress' | 'task.completed' | 'task.failed' | 'task.blocked' | 'run.completed' | 'run.failed'
export interface AgentExecutionEvent {
  type: AgentEventType
  runId: string
  projectId: string
  taskId?: string
  timestamp: string
  sequence: number
  status: string
  message: string | null
  evidence: string | null
  error: string | null
  tasks: AgentTask[]
  progress: number
}
const taskStatuses = new Set(['pending', 'running', 'completed', 'failed', 'blocked', 'skipped'])
const eventTypes = new Set(['run.started', 'task.started', 'task.progress', 'task.completed', 'task.failed', 'task.blocked', 'run.completed', 'run.failed'])
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function nullableText(value: unknown, max = 16000) { return value === null || typeof value === 'string' && value.length <= max }
function date(value: unknown) { return value === null || typeof value === 'string' && Number.isFinite(Date.parse(value)) }
export function isAgentTask(value: unknown): value is AgentTask {
  return record(value) && typeof value.taskId === 'string' && value.taskId.length > 0 && value.taskId.length <= 512 && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 1000 && taskStatuses.has(String(value.status)) && date(value.startedAt) && date(value.completedAt) && nullableText(value.message) && nullableText(value.evidence) && nullableText(value.error)
}
export function isAgentEvent(value: unknown): value is AgentExecutionEvent {
  return record(value) && eventTypes.has(String(value.type)) && typeof value.runId === 'string' && typeof value.projectId === 'string' && (value.taskId === undefined || typeof value.taskId === 'string') && typeof value.timestamp === 'string' && Number.isFinite(Date.parse(value.timestamp)) && Number.isSafeInteger(value.sequence) && Number(value.sequence) > 0 && typeof value.status === 'string' && nullableText(value.message) && nullableText(value.evidence) && nullableText(value.error) && Array.isArray(value.tasks) && value.tasks.length <= 1000 && value.tasks.every(isAgentTask) && typeof value.progress === 'number' && value.progress >= 0 && value.progress <= 100
}
export function taskProgress(tasks: readonly AgentTask[]) {
  const completed = tasks.filter((task) => task.status === 'completed').length
  return { completed, total: tasks.length, percentage: tasks.length ? Math.round(completed / tasks.length * 100) : 0 }
}
