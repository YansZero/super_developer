import type { SideProgress } from '../types/domain'
import { useI18n } from '../i18n'
import './ProgressMeter.css'

interface ProgressMeterProps {
  label: string
  progress: SideProgress
}

export function ProgressMeter({ label, progress }: ProgressMeterProps) {
  const { t } = useI18n()
  if (!progress.available) {
    return (
      <div className="sd-progress sd-progress--missing">
        <div className="sd-progress__head">
          <span className="sd-progress__label">{label}</span>
          <span className="sd-progress__missing-tag">{t('project.progress.todosUnavailable')}</span>
        </div>
        <p className="sd-progress__missing-note">
          {t(progress.missingReason ?? 'project.progress.defaultMissingReason')}
        </p>
      </div>
    )
  }

  const total = progress.todos.length
  const completed = progress.todos.filter((item) => item.completed).length
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100)
  const segments = Array.from({ length: 10 }, (_, idx) => percentage >= (idx + 1) * 10)

  return (
    <div className="sd-progress">
      <div className="sd-progress__head">
        <span className="sd-progress__label">{label}</span>
        <span className="sd-progress__stat">
          {completed}/{total} ({percentage}%)
        </span>
      </div>
      <div className="sd-progress__bar-wrapper">
        <progress
          className="sd-progress__bar"
          value={percentage}
          max={100}
          aria-label={t('project.progress.completion', { label, percentage })}
        />
        <div className="sd-progress__segmented" aria-hidden="true">
          {segments.map((filled, idx) => (
            <span
              key={idx}
              className={`sd-progress__seg ${filled ? 'sd-progress__seg--fill' : ''}`}
            />
          ))}
        </div>
      </div>
      {progress.sourceFileLabel ? (
        <span className="sd-progress__source">{t('project.progress.source')}{progress.sourceFileLabel}</span>
      ) : null}
    </div>
  )
}
