import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import type { ProjectItem, ProviderSummary, SettingsTabId, SideProgress } from '../../../shared/types/domain'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { SidebarNavIcon } from '../../../app/SidebarNavIcon'
import { AddProjectForm } from '../overview/ProjectsOverviewPage'
import { jiraTicketProjectKeys } from '../../jira/jiraTicketPresentation'
import './ProjectDetailWorkspace.css'
import '../overview/ProjectsOverviewPage.css'
import { useI18n } from '../../../shared/i18n'

export type ProjectDetailWorkspaceTab = 'overview' | 'branches' | 'jira' | 'ai' | 'code' | 'specs' | 'progress'

interface Props {
  project: ProjectItem
  frontendProgress: SideProgress
  backendProgress: SideProgress
  allProjects: ProjectItem[]
  providers: ProviderSummary[]
  activeTab: ProjectDetailWorkspaceTab
  onTabChange: (tab: ProjectDetailWorkspaceTab) => void
  onSelectProject: (projectId: string) => void
  onAddProjects?: (projectPaths: string[]) => Promise<ProjectItem[]>
  onRemoveProjects?: (projectIds: string[]) => Promise<void>
  onPickProjectFolders?: () => Promise<string[]>
  onOpenSettingsTab: (tab: SettingsTabId) => void
  gitRefreshError: boolean
  gitRefreshedAt: string | null
  gitRefreshCountdown: number
  children: ReactNode
}

function ProjectWorkspaceTabIcon({ tab }: { tab: ProjectDetailWorkspaceTab }) {
  switch (tab) {
    case 'overview':
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
          <rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
    case 'ai':
      return <SidebarNavIcon kind="ai-agent" />
    case 'code':
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M5.5 5.5h5v5h-5z" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.5 5.5H4a1.75 1.75 0 1 1 1.5-1.5v1.5Zm5 0H12a1.75 1.75 0 1 0-1.5-1.5v1.5Zm-5 5H4a1.75 1.75 0 1 0 1.5 1.5v-1.5Zm5 0H12a1.75 1.75 0 1 1-1.5 1.5v-1.5Z" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
    case 'specs':
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3.5 2.5h5.5l3.5 3.5v7.5a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M9 2.5V6h3.5M5.5 8.5h5M5.5 11h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'jira':
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'progress':
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 5v3.25l2.25 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'branches':
      return (
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="4.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="4.5" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="11.5" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M4.5 5.5v5M4.5 8.5a4 4 0 0 0 4-2.5l1.5-.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
  }
}

const TABS: Array<{ id: ProjectDetailWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'project.tab.overview' },
  { id: 'ai', label: 'project.tab.aiAnalysis' },
  { id: 'code', label: 'project.tab.architecture' },
  { id: 'specs', label: 'project.tab.specifications' },
  { id: 'jira', label: 'project.tab.jiraTasks' },
  { id: 'progress', label: 'project.tab.progress' },
  { id: 'branches', label: 'project.tab.gitOperations' },
]

function gitStatusLabel(project: ProjectItem) {
  if (project.isDemoFixture) return 'project.git.demoSnapshot'
  if (project.git.status === 'normal') return 'project.git.connected'
  if (project.git.status === 'detached') return 'project.git.detachedHead'
  if (project.git.status === 'no-git') return 'project.git.noRepository'
  return 'project.git.notAnalyzed'
}

export function ProjectDetailWorkspace({
  project, frontendProgress, backendProgress, allProjects, providers, activeTab, onTabChange, onSelectProject,
  onAddProjects, onRemoveProjects, onPickProjectFolders, onOpenSettingsTab,
  gitRefreshError, gitRefreshedAt, gitRefreshCountdown, children,
}: Props) {
  const { t } = useI18n()
  const agentJobDialog = useRef<HTMLDialogElement>(null)
  const [selectedAgentJob, setSelectedAgentJob] = useState<'ai' | 'progress' | null>(null)
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [isRemovePanelOpen, setIsRemovePanelOpen] = useState(false)
  const [projectPaths, setProjectPaths] = useState<string[]>([])
  const [selectedRemovalIds, setSelectedRemovalIds] = useState<string[]>([])
  const [isPickingFolder, setIsPickingFolder] = useState(false)
  const [isAddingProjects, setIsAddingProjects] = useState(false)
  const [isRemovingProjects, setIsRemovingProjects] = useState(false)
  const [managementNotice, setManagementNotice] = useState<string | null>(null)
  const openJira = project.jira.tickets.filter((ticket) => ticket.status !== 'DONE').length
  const jiraProjectKeys = jiraTicketProjectKeys(project.jira.tickets)
  const totalTodos = frontendProgress.todos.length + backendProgress.todos.length
  const completedTodos = [...frontendProgress.todos, ...backendProgress.todos]
    .filter((todo) => todo.completed).length
  const readyProviders = providers.filter((provider) => provider.statusKind === 'normal').length
  const removableProjects = allProjects.filter((item) => !item.isDemoFixture)
  const managementEnabled = Boolean(onAddProjects && onRemoveProjects && onPickProjectFolders)

  const handlePickProjectFolders = async () => {
    if (!onPickProjectFolders || isPickingFolder || isAddingProjects) return
    setIsPickingFolder(true)
    setManagementNotice(null)
    try {
      const selectedPaths = await onPickProjectFolders()
      setProjectPaths((previous) => [...new Set([...previous, ...selectedPaths])])
    } catch (error) {
      setManagementNotice(error instanceof Error ? error.message : t('common.failedToOpenTheFolderPicker'))
    } finally {
      setIsPickingFolder(false)
    }
  }

  const handleAddProjects = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onAddProjects || projectPaths.length === 0 || isAddingProjects) return
    setIsAddingProjects(true)
    setManagementNotice(null)
    try {
      const addedProjects = await onAddProjects(projectPaths)
      setProjectPaths([])
      setIsAddPanelOpen(false)
      setManagementNotice(`${t('common.added')}${addedProjects.length} ${t('common.projects')}`)
    } catch (error) {
      setManagementNotice(error instanceof Error ? error.message : t('common.failedToAddProjects'))
    } finally {
      setIsAddingProjects(false)
    }
  }

  const handleRemoveProjects = async () => {
    if (!onRemoveProjects || selectedRemovalIds.length === 0 || isRemovingProjects) return
    setIsRemovingProjects(true)
    setManagementNotice(null)
    try {
      await onRemoveProjects(selectedRemovalIds)
      setManagementNotice(`${t('common.removedAlt')}${selectedRemovalIds.length} ${t('common.projectsFromTheDashboardLocalFoldersAndProjectFilesWereNotDeleted')}`)
      setSelectedRemovalIds([])
      setIsRemovePanelOpen(false)
    } catch (error) {
      setManagementNotice(error instanceof Error ? error.message : t('common.failedToRemoveProjects'))
    } finally {
      setIsRemovingProjects(false)
    }
  }

  return (
    <div className="sd-project-workspace">
      <section className="sd-project-workspace__project-head" aria-label={t('common.projectSummary')}>
        <div className="sd-project-workspace__title-row">
          <div className="sd-project-workspace__title-group">
            <h1>{project.name}</h1>
            <span className="sd-project-workspace__branch">⑂ {project.git.branchName ?? t('common.branchNotDetected')}</span>
          </div>
          <div className="sd-project-workspace__actions">
            <button type="button" onClick={() => onTabChange('branches')}>{t('project.tab.gitOperations')}</button>
            <button type="button" className="sd-project-workspace__primary-action" aria-haspopup="dialog" onClick={() => {
              setSelectedAgentJob(null)
              agentJobDialog.current?.showModal()
            }}>＋ {t('project.action.newAgentJob')}</button>
          </div>
        </div>
      </section>

      <section className="sd-project-workspace__health" aria-label={t('common.projectMetricsAndHealth')}>
        <div className="sd-project-workspace__panel-heading">
          <span>{t('project.metricsWorkspaceHealth')}</span>
          <span className="sd-project-workspace__health-dot" aria-hidden="true" />
        </div>
        <div className="sd-project-workspace__health-cards">
          <section className="sd-project-workspace__health-section">
            <div className="sd-project-workspace__health-title"><strong>{t('project.repositoryStatus')}</strong><StatusBadge label={t(gitStatusLabel(project))} tone={project.git.status === 'no-git' ? 'err' : project.git.status === 'normal' ? 'ok' : 'neutral'} mono /></div>
            <div className="sd-project-workspace__metric-grid">
              <div><span>{t('project.uncommitted')}</span><strong>{project.git.uncommittedFileCount ?? '—'}</strong></div>
              <div className="sd-project-workspace__recent-commit">
                <span>{t('common.recentCommit')}</span>
                {project.git.lastCommitHash ? (
                  <strong className="sd-project-workspace__recent-commit-value" title={[project.git.lastCommitHash, project.git.lastCommitMessage].filter(Boolean).join(' / ')}>
                    <span>{project.git.lastCommitHash}</span>
                    {project.git.lastCommitMessage ? <span>{project.git.lastCommitMessage}</span> : null}
                  </strong>
                ) : <strong className="sd-project-workspace__recent-commit-value sd-project-workspace__recent-commit-value--empty" title={t('common.noCommitInformation')}>{t('common.noCommitInformation')}</strong>}
              </div>
            </div>
            <p className="sd-project-workspace__refresh" role="status">
              {project.isDemoFixture ? t('common.demoSnapshot') : gitRefreshError ? `${t('common.refreshFailed')}${gitRefreshCountdown}s ${t('common.beforeRetry')}` : gitRefreshedAt ? `${t('common.updated')}${gitRefreshedAt}` : `${gitRefreshCountdown}s ${t('common.beforeRefresh')}`}
            </p>
          </section>
          <section className="sd-project-workspace__health-section">
            <div className="sd-project-workspace__health-title"><strong>{t('common.jiraTasks')}</strong><button type="button" onClick={() => onOpenSettingsTab('jira')}>{t('common.settings')}</button></div>
            <div className="sd-project-workspace__metric-grid">
              <div><span>{t('project.open')}</span><strong>{openJira}</strong></div>
              <div><span>{t('project.done')}</span><strong>{project.jira.tickets.length - openJira}</strong></div>
            </div>
            <p className="sd-project-workspace__refresh">{t('common.jiraTicketProjects')}：{jiraProjectKeys.join(', ') || t('common.noJiraProjectCodes')}</p>
          </section>
          <section className="sd-project-workspace__health-section">
            <div className="sd-project-workspace__health-title"><strong>{t('project.progress')}</strong><button type="button" onClick={() => onTabChange('progress')}>{t('common.view')}</button></div>
            <div className="sd-project-workspace__progress-row"><span>{t('common.frontendDirectory')}</span><strong>{frontendProgress.available ? `${frontendProgress.todos.filter((todo) => todo.completed).length}/${frontendProgress.todos.length}` : t('common.notScanned')}</strong></div>
            <div className="sd-project-workspace__progress-row"><span>{t('common.backendDirectory')}</span><strong>{backendProgress.available ? `${backendProgress.todos.filter((todo) => todo.completed).length}/${backendProgress.todos.length}` : t('common.notScanned')}</strong></div>
            <p className="sd-project-workspace__refresh">{t('common.todos')}{completedTodos}/{totalTodos} {t('common.complete')}</p>
          </section>
          <section className="sd-project-workspace__health-section">
            <div className="sd-project-workspace__health-title"><strong>{t('project.localAiProviders')}</strong><button type="button" onClick={() => onOpenSettingsTab('providers')}>{t('common.settings')}</button></div>
            <strong className="sd-project-workspace__provider-count">{readyProviders} / {providers.length} {t('common.available')}</strong>
            <p className="sd-project-workspace__refresh">{t('common.basedOnLocalProbeStatus')}</p>
          </section>
        </div>
      </section>

      <nav className="sd-project-workspace__tabs" role="tablist" aria-label={t('common.projectWorkspace')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`sd-project-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="sd-project-tabpanel"
            className={activeTab === tab.id ? 'is-active' : ''}
            onClick={() => onTabChange(tab.id)}
          >
            <span className="sd-project-workspace__tab-icon" aria-hidden="true"><ProjectWorkspaceTabIcon tab={tab.id} /></span>
            <span className="sd-project-workspace__tab-label">{t(tab.label)}</span>
            {tab.id === 'jira' ? <small>{project.jira.tickets.length}</small> : null}
          </button>
        ))}
      </nav>

      <div className="sd-project-workspace__grid">
        <aside className="sd-project-workspace__explorer" aria-label={t('common.workspaceProjects')}>
            <div className="sd-project-workspace__panel-heading">
            <span>{t('project.workspaces')}</span><span>{allProjects.length}</span>
          </div>
          <div className="sd-project-workspace__project-list">
            {allProjects.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sd-project-workspace__project-link${item.id === project.id ? ' is-active' : ''}`}
                aria-current={item.id === project.id ? 'page' : undefined}
                onClick={() => onSelectProject(item.id)}
              >
                <span className="sd-project-workspace__project-link-name">{item.name}</span>
                <span className="sd-project-workspace__project-link-branch">{item.git.branchName ?? t(gitStatusLabel(item))}</span>
              </button>
            ))}
          </div>
          {managementEnabled ? (
            <section className="sd-project-workspace__project-management" aria-label={t('common.projectManagement')}>
              <button type="button" className="sd-project-workspace__management-btn sd-project-workspace__management-btn--primary" onClick={() => { setManagementNotice(null); setIsAddPanelOpen(true) }}>＋ {t('common.addProject')}</button>
              <button type="button" className="sd-project-workspace__management-btn sd-project-workspace__management-btn--danger" onClick={() => { setManagementNotice(null); setSelectedRemovalIds([]); setIsRemovePanelOpen(true) }} disabled={removableProjects.length === 0}>− {t('common.removeProject')}</button>
              {managementNotice ? <p className="sd-project-workspace__management-notice" role="status">{managementNotice}</p> : null}
            </section>
          ) : null}
        </aside>

        <section
          id="sd-project-tabpanel"
          className="sd-project-workspace__main"
          role="tabpanel"
          aria-labelledby={`sd-project-tab-${activeTab}`}
          tabIndex={0}
        >
          {children}
        </section>
      </div>

      <dialog ref={agentJobDialog} className="sd-detail__confirm-dialog sd-project-workspace__agent-job-dialog" aria-labelledby="sd-agent-job-title">
        <h2 id="sd-agent-job-title">{t('project.action.newAgentJob')}</h2>
        <form onSubmit={(event) => {
          event.preventDefault()
          if (!selectedAgentJob) return
          agentJobDialog.current?.close()
          onTabChange(selectedAgentJob)
        }}>
          <fieldset className="sd-project-workspace__agent-job-options">
            <legend>{t('project.action.chooseAgentJob')}</legend>
            {([['ai', 'project.action.analyzeProject'], ['progress', 'project.action.dispatchTask']] as const).map(([tab, label]) => (
              <label key={tab}>
                <input type="radio" name="agent-job" value={tab} checked={selectedAgentJob === tab} onChange={() => setSelectedAgentJob(tab)} />
                <span className="sd-project-workspace__tab-icon" aria-hidden="true"><ProjectWorkspaceTabIcon tab={tab} /></span>
                {t(label)}
              </label>
            ))}
          </fieldset>
          <div className="sd-detail__confirm-actions">
            <button type="button" className="sd-detail__confirm-cancel" onClick={() => agentJobDialog.current?.close()}>{t('common.cancel')}</button>
            <button type="submit" className="sd-detail__confirm-start" disabled={!selectedAgentJob}>{t('project.action.confirmAgentJob')}</button>
          </div>
        </form>
      </dialog>

      {managementEnabled && isAddPanelOpen ? (
        <div className="sd-overview__modal-backdrop" role="presentation" onMouseDown={() => setIsAddPanelOpen(false)}>
          <section className="sd-overview__modal sd-overview__modal--add" role="dialog" aria-modal="true" aria-labelledby="sd-detail-add-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sd-overview__modal-header">
              <h2 id="sd-detail-add-project-title" className="sd-overview__add-panel-title">{t('project.addFolderTitle')}</h2>
              <p className="sd-overview__add-panel-copy">{t('project.addFolderDescription')}</p>
            </div>
            <AddProjectForm
              projectPaths={projectPaths}
              isBusy={isAddingProjects || isPickingFolder}
              onSubmit={(event) => void handleAddProjects(event)}
              onCancel={() => { setProjectPaths([]); setIsAddPanelOpen(false) }}
              onPickFolders={() => void handlePickProjectFolders()}
            />
          </section>
        </div>
      ) : null}

      {managementEnabled && isRemovePanelOpen ? (
        <div className="sd-overview__modal-backdrop" role="presentation" onMouseDown={() => setIsRemovePanelOpen(false)}>
          <section className="sd-overview__modal sd-project-workspace__remove-modal" role="dialog" aria-modal="true" aria-labelledby="sd-detail-remove-project-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="sd-overview__modal-header">
              <h2 id="sd-detail-remove-project-title" className="sd-overview__add-panel-title">{t('project.removeFolderTitle')}</h2>
              <p className="sd-overview__add-panel-copy">{t('project.removeFolderDescription')}</p>
            </div>
            <div className="sd-project-workspace__remove-list">
              {removableProjects.map((item) => (
                <label key={item.id} className="sd-project-workspace__remove-option">
                  <input type="checkbox" checked={selectedRemovalIds.includes(item.id)} onChange={(event) => setSelectedRemovalIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                  <span><strong>{item.name}</strong><small>{item.folderDisplayName}</small></span>
                </label>
              ))}
            </div>
            <div className="sd-overview__modal-actions">
              <button type="button" className="sd-overview__btn" onClick={() => setIsRemovePanelOpen(false)} disabled={isRemovingProjects}>{t('common.cancel')}</button>
              <button type="button" className="sd-overview__btn sd-overview__btn--danger" onClick={() => void handleRemoveProjects()} disabled={selectedRemovalIds.length === 0 || isRemovingProjects}>{isRemovingProjects ? t('common.removing') : t('project.removeConfirmation', { count: selectedRemovalIds.length })}</button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="sd-project-workspace__statusbar">
        <span><i aria-hidden="true" />{project.isDemoFixture ? t('project.git.demoSnapshot') : project.git.status === 'normal' ? t('project.git.localRepositoryReady') : t(gitStatusLabel(project))}</span>
        <span>{project.folderDisplayName} · {project.git.branchName ?? '無分支'}</span>
        <span>{project.jira.tickets.length} {t('common.jiraTasks')}</span>
      </footer>
    </div>
  )
}
