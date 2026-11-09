import { agentMessage } from './requestI18n.mjs'
import { spawn } from 'node:child_process'
import { buildSafeSubprocessEnv } from './providerAdapter.mjs'
import { sanitizeCliOutput } from './cliOutputSanitizer.mjs'
import { writeProgressCompletion } from './projectScanner.mjs'

export const PROGRESS_PREFIX = '@@agent-progress '
const commands = new Set(['test', 'run test:frontend', 'run test:bff', 'run typecheck', 'run build', 'run lint'])

// Verification runs independently of the agent's claimed exit code, with no shell.
export function verifyTask(command, cwd, signal) {
  if (!Array.isArray(command) || command[0] !== 'npm' || !commands.has(command.slice(1).join(' '))) return Promise.resolve({ ok: false, output: 'Unsupported verification command' })
  return new Promise((resolve) => {
    let output = ''
    const child = spawn('npm', command.slice(1), { cwd, env: buildSafeSubprocessEnv(), shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal })
    const capture = (chunk) => { output = (output + chunk.toString('utf8')).slice(-12000) }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    const timer = setTimeout(() => { child.kill('SIGKILL') }, 120000)
    timer.unref?.()
    child.once('error', (error) => { clearTimeout(timer); resolve({ ok: false, output: error.message }) })
    child.once('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, output: sanitizeCliOutput(`${command.join(' ')} (exit ${code})\n${output}`) }) })
  })
}

export function createRunProgress(job, todos, notify, verify = verifyTask) {
  job.tasks = todos.map((todo) => ({ taskId: todo.taskId ?? todo.id, title: todo.title, status: todo.completed ? 'completed' : 'pending', startedAt: null, completedAt: null, message: null, evidence: null, error: null }))
  job.events = []
  const aliases = new Map(todos.map((todo) => [todo.id, todo.taskId ?? todo.id]))
  const abort = new AbortController()
  let pending = ''
  let chain = Promise.resolve()
  let closed = false
  function emit(type, task, message = null) {
    const timestamp = new Date().toISOString()
    job.updatedAt = timestamp
    const event = {
      type, runId: job.id, projectId: job.projectId, timestamp,
      sequence: (job.events.at(-1)?.sequence ?? 0) + 1,
      ...(task ? { taskId: task.taskId } : {}),
      status: task?.status ?? job.status,
      message: task?.message ?? message,
      evidence: task?.evidence ?? null, error: task?.error ?? job.error ?? null,
      tasks: structuredClone(task ? [task] : job.tasks),
      progress: job.tasks.length ? Math.round(job.tasks.filter((item) => item.status === 'completed').length / job.tasks.length * 100) : 0,
    }
    job.events.push(event)
    notify(event)
  }
  async function report(value) {
    if (closed || !value || typeof value !== 'object' || Array.isArray(value)) return
    const task = job.tasks.find((item) => item.taskId === (aliases.get(value.taskId) ?? value.taskId))
    if (!task || ['completed', 'failed', 'skipped'].includes(task.status)) return
    const type = value.type
    if (!['task.started', 'task.progress', 'task.completed', 'task.failed', 'task.blocked'].includes(type)) return
    const text = (key) => typeof value[key] === 'string' ? sanitizeCliOutput(value[key]).slice(0, 12000) : null
    if (type === 'task.started') {
      if (!['pending', 'blocked'].includes(task.status)) return
      task.status = 'running'
      task.error = null
      task.startedAt ??= new Date().toISOString()
    } else if (type === 'task.progress') {
      if (task.status !== 'running') return
      if (value.status === 'skipped') { task.status = 'skipped'; task.completedAt = new Date().toISOString() }
    } else if (type === 'task.completed') {
      if (task.status !== 'running') return
      // A structured completion is a request to verify, never an assertion of success.
      if (!text('evidence') || !Array.isArray(value.verification?.command)) {
        task.status = 'blocked'
        task.error = 'Completion requires evidence and a supported verification.command'
        emit('task.blocked', task)
        return
      }
      task.message = 'Verifying task'
      emit('task.progress', task)
      let result
      try { result = await verify(value.verification.command, job.projectPath, abort.signal) }
      catch (error) { result = { ok: false, output: String(error.message ?? error) } }
      if (closed) return
      task.evidence = `${text('evidence')}\n${sanitizeCliOutput(result.output).slice(-12000)}`.slice(-16000)
      if (!result.ok) {
        task.status = 'failed'
        task.error = sanitizeCliOutput(result.output).slice(-12000) || 'Verification failed'
        task.completedAt = new Date().toISOString()
        emit('task.failed', task)
        return
      }
      const sync = writeProgressCompletion(job.projectPath, task.taskId, task.title)
      if (!sync.ok) {
        task.status = 'blocked'
        task.error = sync.message
        emit('task.blocked', task)
        return
      }
      task.status = 'completed'
      task.completedAt = new Date().toISOString()
    } else {
      task.status = type === 'task.failed' ? 'failed' : 'blocked'
      task.error = text('error') || text('message') || 'Task cannot continue'
      if (type === 'task.failed') task.completedAt = new Date().toISOString()
    }
    task.message = text('message')
    if (type !== 'task.completed') task.evidence = text('evidence') ?? task.evidence
    if (task.status === 'completed') task.error = null
    emit(type, task)
  }
  function feed(text, flush = false) {
    pending += text
    if (pending.length > 128000) pending = pending.slice(-128000)
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    if (flush && pending) { lines.push(pending); pending = '' }
    for (const line of lines) {
      if (!line.startsWith(PROGRESS_PREFIX)) continue
      try {
        const value = JSON.parse(line.slice(PROGRESS_PREFIX.length))
        chain = chain.then(() => report(value)).catch(() => { /* Invalid reports cannot end the run. */ })
      } catch { /* Prose, invalid JSON and partial lines never mark tasks completed. */ }
    }
  }
  function finish() {
    if (closed) return
    closed = true
    abort.abort()
    for (const task of job.tasks) {
      if (task.status !== 'running') continue
      task.status = job.status === 'succeeded' ? 'blocked' : 'failed'
      task.error = job.error || 'Agent ended without verified completion'
      task.completedAt = new Date().toISOString()
      emit(task.status === 'blocked' ? 'task.blocked' : 'task.failed', task)
    }
    emit(job.status === 'succeeded' ? 'run.completed' : 'run.failed', undefined, job.error)
  }
  return { feed, drain: () => chain, emit, finish }
}

export function progressPrompt(tasks) {
  if (!tasks.length) return ''
  return `\n<agent-progress-protocol>
${agentMessage('agent.progress.protocolTitle')}
${agentMessage('agent.progress.protocolRequireNdjson', { prefix: PROGRESS_PREFIX.trim() })}
${agentMessage('agent.progress.protocolWarning')}

${agentMessage('agent.progress.protocolRulesTitle')}
${agentMessage('agent.progress.protocolRule1', { prefix: PROGRESS_PREFIX })}
${agentMessage('agent.progress.protocolRule2', { prefix: PROGRESS_PREFIX })}
${agentMessage('agent.progress.protocolRule3')}
   ["npm","test"], ["npm","run","test:frontend"], ["npm","run","test:bff"], ["npm","run","typecheck"], ["npm","run","build"], ["npm","run","lint"]
${agentMessage('agent.progress.protocolRule4')}
${agentMessage('agent.progress.protocolRule5')}
${agentMessage('agent.progress.protocolRule6', { prefix: PROGRESS_PREFIX })}

${agentMessage('agent.progress.protocolTaskListTitle')}
${JSON.stringify(tasks.map(({ taskId, title, completed }) => ({ taskId, title, completed })))}
</agent-progress-protocol>`
}
