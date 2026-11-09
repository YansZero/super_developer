import { useEffect, useState } from 'react'
import { useI18n } from '../../shared/i18n'
import { loadTrackedDispatchJobs, subscribeDispatchCompletions, type TrackedDispatchJob } from '../projects/detail/dispatchJobStore'
import { aiJobHref } from '../projects/detail/projectDetailHelpers'
import type { DispatchNotificationSettings } from './dispatchNotificationSettings'
import './DispatchNotifications.css'

function resultStatusKey(status: TrackedDispatchJob['job']['status']) {
  if (status === 'succeeded') return 'common.completed'
  if (status === 'cancelled') return 'common.cancelled'
  if (status === 'timed_out') return 'common.timedOut'
  return 'common.failed'
}

export function DispatchNotifications({ settings }: { settings: DispatchNotificationSettings }) {
  const { t } = useI18n()
  const [queue, setQueue] = useState<TrackedDispatchJob[]>([])

  useEffect(() => {
    return subscribeDispatchCompletions((record) => {
      const { job } = record
      const background = document.hidden || !document.hasFocus()
      if (settings.desktop && (background || !settings.inApp) && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          const notification = new Notification(t('aiWork.notifications.result', { status: t(resultStatusKey(job.status)) }), {
            body: `${job.projectName} · ${record.aiJob.summary || job.summary}`,
            tag: `super-developer-job-${job.id}`,
          })
          notification.onclick = () => {
            notification.close()
            window.focus()
            window.location.assign(aiJobHref(job.id))
          }
          return
        } catch { /* Use the in-app notification when desktop delivery is unavailable. */ }
      }
      if (settings.inApp) setQueue((current) => [...current, record])
    })
  }, [settings, t])

  useEffect(() => {
    void loadTrackedDispatchJobs().catch(() => undefined)
  }, [])

  const record = queue[0]
  if (!record) return null
  const { job } = record

  return (
    <aside className="sd-dispatch-notification" aria-label={t('aiWork.notifications.enable')}>
      <div role="status">
        <strong>{t('aiWork.notifications.result', { status: t(resultStatusKey(job.status)) })}</strong>
        <p>{job.projectName} · {record.aiJob.summary || job.summary}</p>
        {job.error ? <p className="sd-dispatch-notification__error">{job.error}</p> : null}
      </div>
      <div className="sd-dispatch-notification__actions">
        <a href={aiJobHref(job.id)}>{t('agentProgress.openJob')}</a>
        <button type="button" onClick={() => setQueue((current) => current.slice(1))}>{t('common.close')}</button>
      </div>
    </aside>
  )
}
