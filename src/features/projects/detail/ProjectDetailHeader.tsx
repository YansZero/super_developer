import { GitBranchBadge, StatusBadge } from '../../../shared/components/StatusBadge'
import type { JiraTicketSummary, ProjectItem, SettingsTabId } from '../../../shared/types/domain'
import { FolderGlyph } from './ProjectDetailArchitectureTree'
import { useI18n } from '../../../shared/i18n'

export type ProjectDetailSubView = 'all' | 'git' | 'jira' | 'code'

interface Props {
  project: ProjectItem
  allProjects: ProjectItem[]
  activeSubView: ProjectDetailSubView
  setActiveSubView: (subView: ProjectDetailSubView) => void
  gitRefreshError: boolean
  gitRefreshedAt: string | null
  gitRefreshCountdown: number
  onProjectSwitch: (projectId: string) => void
  onOpenSettingsTab: (tab: SettingsTabId) => void
}

export function ProjectDetailHeader({
  project, allProjects, activeSubView, setActiveSubView, gitRefreshError, gitRefreshedAt,
  gitRefreshCountdown, onProjectSwitch, onOpenSettingsTab,
}: Props) {
  const { t } = useI18n()
  const jiraTicketGroups = [
    { status: 'TODO' as const, label: t('common.toDo'), tone: 'pending' },
    { status: 'IN_PROGRESS' as const, label: t('common.inProgressAlt'), tone: 'in-progress' },
    { status: 'DONE' as const, label: t('common.done'), tone: 'done' },
  ].map((group) => ({
    ...group,
    tickets: project.jira.tickets.filter((ticket: JiraTicketSummary) => ticket.status === group.status),
  }))
  return (
    <>
<div className="sd-detail__topbar-row">
        <div className="sd-detail__breadcrumb">
          <span>{t('common.projectDetails')}</span>
          <span aria-hidden="true">&gt;</span>
          <strong>{project.name}</strong>
        </div>

        <section className="sd-detail__switcher" aria-label={t('common.projectSwitcher')}>
          <span className="sd-detail__switcher-label">{t('common.viewAddedProjects')}</span>
          <div className="sd-detail__switcher-Btns">
            {allProjects.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sd-detail__switch-btn ${item.id === project.id ? 'sd-detail__switch-btn--active' : ''}`}
                onClick={() => onProjectSwitch(item.id)}
              >
                <span>{item.name}</span>
                {item.git.status === 'no-git' ? (
                  <span className="sd-detail__switch-nogit">{t('common.noGit')}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      </div>

<section className="sd-detail__branch-header" aria-label={t('common.projectBranchAndSourceSummary')}>
        <div className="sd-detail__branch-main">
          <div className="sd-detail__hero-row">
            <span className="sd-detail__folder-badge" aria-hidden="true">
              <FolderGlyph />
            </span>
            <div className="sd-detail__hero-titles">
              <div className="sd-detail__title-row">
                <h1 className="sd-detail__title">{project.name}</h1>
                <StatusBadge label={project.git.status === 'unanalysed' ? t('common.notAnalyzed') : t('common.inDevelopment')} tone="accent" />
                <StatusBadge label={project.isDemoFixture ? t('common.demoFixtures') : project.git.status === 'unanalysed' ? t('common.notAnalyzed') : t('common.locallyScannedData')} tone="neutral" />
              </div>
              <code className="sd-detail__folder">{project.folderDisplayName}</code>
            </div>
          </div>
          <p className="sd-detail__desc">{t(project.summary)}</p>
          <div className="sd-detail__branch-inline">
            <GitBranchBadge git={project.git} />
            {project.git.status !== 'no-git' ? (
              <code className="sd-detail__commit-chip">
                {project.git.lastCommitHash} · {project.git.lastCommitMessage}
              </code>
            ) : (
              <span className="sd-detail__nogit-explain">
                {t('common.noGitDirectoryWasDetectedThisFolderMayNotBeUnderVersionControl')}
              </span>
            )}
            <span className={`sd-detail__git-refresh${gitRefreshError ? ' sd-detail__git-refresh--error' : ''}`} role="status">
              {project.isDemoFixture
                ? t('common.demoSnapshot')
                : gitRefreshError
                  ? `${t('common.branchRefreshFailedKeepingPreviousData')}${gitRefreshCountdown} ${t('common.secondsBeforeRetry')}`
                  : gitRefreshedAt
                    ? `${t('common.updated')}${gitRefreshedAt} · ${gitRefreshCountdown} ${t('common.secondsBeforeRefresh')}`
                    : `Git ${t('common.status')}${gitRefreshCountdown} ${t('common.secondsBeforeRefresh')}`}
            </span>
          </div>
        </div>

        <div className="sd-detail__branch-meta">
          <div className="sd-detail__jira-binding-box">
            <div className="sd-detail__jira-binding-header">
              <div className="sd-detail__jira-binding-header-left">
                <span className="sd-detail__jira-diamond" aria-hidden="true">◆</span>
                <div className="sd-detail__jira-binding-heading">
                  <strong className="sd-detail__assigned-jira-title">{t('common.jiraTasksForThisProject')}</strong>
                  <span className="sd-detail__assigned-jira-hint">{t('common.openJiraTasksToReviewThem')}</span>
                </div>
              </div>
              <button
                type="button"
                className="sd-detail__mini-btn sd-detail__jira-settings-btn"
                onClick={() => onOpenSettingsTab('jira')}
              >
                Jira {t('common.settings')}
              </button>
            </div>
            <div className="sd-detail__jira-binding-divider" />
            <div className="sd-detail__assigned-jira-groups">
              {jiraTicketGroups.map((group) => (
                <section key={group.status} className={`sd-detail__assigned-jira-card sd-detail__assigned-jira-card--${group.tone}`}>
                  <div className="sd-detail__assigned-jira-card-head">
                    <strong>{group.label.replace('：', '')}</strong>
                    <span>{group.tickets.length}</span>
                  </div>
                  <div className="sd-detail__assigned-jira-list">
                    {group.tickets.length > 0 ? group.tickets.map((ticket) => (
                      <span key={ticket.key} className={`sd-detail__assigned-jira-tag sd-detail__assigned-jira-tag--${group.tone}`}>
                        {ticket.key} - {ticket.title}
                      </span>
                    )) : <span className="sd-detail__assigned-jira-empty">{t('common.none')}</span>}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>

<nav className="sd-detail__subtabs" aria-label={t('common.projectDetailSections')}>
        <button
          type="button"
          className={`sd-detail__subtab ${activeSubView === 'all' ? 'sd-detail__subtab--active' : ''}`}
          onClick={() => setActiveSubView('all')}
        >
          {t('common.overviewProgressSpecsArchitecture')}
        </button>
        <button
          type="button"
          className={`sd-detail__subtab ${activeSubView === 'git' ? 'sd-detail__subtab--active' : ''}`}
          onClick={() => setActiveSubView('git')}
        >
          {t('common.gitOperationsAndRemoteIntegration')}
        </button>
        <button
          type="button"
          className={`sd-detail__subtab ${activeSubView === 'jira' ? 'sd-detail__subtab--active' : ''}`}
          onClick={() => setActiveSubView('jira')}
        >
          Jira {t('common.task')} ({project.jira.tickets.length})
        </button>
        <button
          type="button"
          className={`sd-detail__subtab ${activeSubView === 'code' ? 'sd-detail__subtab--active' : ''}`}
          onClick={() => setActiveSubView('code')}
        >
          {t('common.codeAndSpecPreview')}
        </button>
      </nav>
    </>
  )
}
