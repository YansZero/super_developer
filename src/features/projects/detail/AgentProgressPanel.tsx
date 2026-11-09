import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useI18n } from '../../../shared/i18n'
import type { AgentTask } from './dispatchClient'
import type { TrackedDispatchJob } from './dispatchJobStore'
import { taskProgress } from '../../../../shared/agentProgress'
import './agent-progress.scss'

export function AgentTaskRow({ task }: { task: AgentTask }) {
  const { t, locale } = useI18n()
  const hasIssue = task.status === 'failed' || task.status === 'blocked'
  const statusLabel = t(`agentProgress.status.${task.status}`)
  const times = [task.startedAt, task.completedAt].flatMap((value) => value ? [new Date(value).toLocaleString(locale)] : [])
  return <li className={`sd-agent-progress__task sd-agent-progress__task--${task.status}`}>
    <details>
      <summary>
        {task.status === 'completed' || hasIssue
          ? <span className={`sd-agent-task-mark${hasIssue ? ' sd-agent-task-mark--error' : ''}`} role="img" aria-label={statusLabel}>{hasIssue ? '×' : '✓'}</span>
          : <StatusBadge label={statusLabel} tone={task.status === 'running' ? 'accent' : 'neutral'} mono />}
        <span>{task.title}</span>
        {times.length > 0 ? <span className="sd-agent-progress__time">{times.join(' → ')}</span> : null}
      </summary>
      {task.message ? <p>{task.message}</p> : null}
      <div className="sd-agent-progress__evidence"><strong>{t('agentProgress.evidence')}</strong><pre>{task.evidence || '—'}</pre>{task.error ? <><strong>{t('agentProgress.error')}</strong><pre role="alert">{task.error}</pre></> : null}</div>
    </details>
    {task.message ? <p className="sd-agent-progress__message">{task.message}</p> : null}
  </li>
}
export function AgentProgressPanel({ record }: { record: TrackedDispatchJob }) {
  const { t, locale } = useI18n()
  const tasks = record.job.tasks ?? []
  const events = record.job.events ?? []
  const progress = taskProgress(tasks)
  const active = ['running', 'queued'].includes(record.job.status)
  const connection = active ? record.connection ?? 'connecting' : 'closed'
  const running = tasks.filter((task) => task.status === 'running')
  return <section className="sd-agent-progress" aria-label={t('agentProgress.title')}>
    <div className="sd-agent-progress__stats" role="status">
      <strong>{t('agentProgress.verified', { completed: progress.completed, total: progress.total, percent: progress.percentage })}</strong>
      <span>{t('agentProgress.running')}: {running.length}</span>
      <span>{t('agentProgress.pending')}: {tasks.filter((task) => task.status === 'pending').length}</span>
      <span>{t('agentProgress.failedBlocked')}: {tasks.filter((task) => ['failed', 'blocked'].includes(task.status)).length}</span>
      <StatusBadge label={`${t(`agentProgress.connection.${connection}`)} · #${events.at(-1)?.sequence ?? 0}`} tone={connection === 'connected' ? 'ok' : 'neutral'} />
      {progress.total > 0 ? <div
        className="sd-agent-progress__steps"
        style={{ columnGap: `min(0.25rem, ${30 / progress.total}%)` }}
        role="progressbar"
        {...({ value: String(progress.percentage) })}
        aria-label={t('progress.percentage')}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        aria-valuetext={t('agentProgress.verified', { completed: progress.completed, total: progress.total, percent: progress.percentage })}
      >
        {tasks.map((task, index) => <span key={task.taskId} data-filled={index < progress.completed} />)}
      </div> : null}
    </div>
    {running.length ? <div className="sd-agent-progress__running" role="status"><strong>{t('agentProgress.currentTask')}</strong>{running.map((task) => <p key={task.taskId}>{task.title}{task.message ? ` · ${task.message}` : ''}</p>)}</div> : null}
    <details className="sd-agent-progress__task-list" open>
      <summary>{t('agentProgress.taskList')} ({tasks.length})</summary>
      <ul className="sd-agent-progress__tasks">{tasks.map((task) => <AgentTaskRow key={task.taskId} task={task} />)}</ul>
    </details>
    <details className="sd-agent-progress__activity" open><summary>{t('agentProgress.activity')}</summary><ol aria-live="polite">{events.slice(-30).reverse().map((event) => <li key={event.sequence}><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString(locale)}</time><code>#{event.sequence} {event.type}</code><span>{event.message || event.error || event.taskId || event.status}</span></li>)}</ol></details>
  </section>
}
