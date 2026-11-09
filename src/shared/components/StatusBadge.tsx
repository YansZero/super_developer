import type { GitBranchSummary } from '../types/domain'
import { PROTOTYPE_STAGE_BANNER } from '../data/fixtures'
import './StatusBadge.css'

export type BadgeTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'err' | 'solid-danger'

interface StatusBadgeProps {
  label: string
  tone?: BadgeTone
  mono?: boolean
}

export function StatusBadge({ label, tone = 'neutral', mono = false }: StatusBadgeProps) {
  const classes = [
    'sd-badge',
    `sd-badge--${tone}`,
    mono ? 'sd-badge--mono' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{label}</span>
}

interface GitBranchAlertProps {
  git: GitBranchSummary
}

export function GitBranchBadge({ git }: GitBranchAlertProps) {
  if (git.status === 'no-git') {
    return (
      <div className="sd-badge-nogit" role="alert" aria-label="無 Git 版本控制警示">
        <span className="sd-badge-nogit__icon" aria-hidden="true">
          ⚠
        </span>
        <span className="sd-badge-nogit__text">{PROTOTYPE_STAGE_BANNER.gitNoRepoWarning}</span>
      </div>
    )
  }

  if (git.status === 'detached') {
    return (
      <div className="sd-badge-gitrow">
        <span className="sd-badge-branch-label">Branch:</span>
        <StatusBadge label={git.branchName ?? 'HEAD (detached)'} tone="warn" mono />
        {git.uncommittedFileCount && git.uncommittedFileCount > 0 ? (
          <StatusBadge label="有未提交的檔案" tone="warn" />
        ) : null}
      </div>
    )
  }

  if (git.status === 'unanalysed') {
    return <StatusBadge label="尚未分析" tone="accent" mono />
  }

  return (
    <div className="sd-badge-gitrow">
      <span className="sd-badge-branch-label">Branch:</span>
      <StatusBadge label={git.branchName ?? 'main'} tone="ok" mono />
      {git.uncommittedFileCount && git.uncommittedFileCount > 0 ? (
        <StatusBadge label="有未提交的檔案" tone="warn" />
      ) : null}
    </div>
  )
}
