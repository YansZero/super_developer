import { useState } from 'react'
import type {
  ProjectItem,
  ProviderSummary,
} from '../../../shared/types/domain'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useI18n } from '../../../shared/i18n'
import { GreetingBanner } from './GreetingBanner'
import type { RunningAnimalBackgroundId, RunningAnimalId } from '../../../shared/appearance/runningAnimal'
import './ProjectsOverviewPage.css'
import './ProjectsOverviewPage.scss'

interface ProjectsOverviewPageProps {
  runningAnimals?: RunningAnimalId[]
  runningAnimal?: RunningAnimalId
  runningAnimalBackground?: RunningAnimalBackgroundId
  projects: ProjectItem[]
  providers: ProviderSummary[]
  onAddProjects: (projectPaths: string[]) => Promise<ProjectItem[]>
  onAnalyzeProject: (projectId: string) => Promise<ProjectItem>
  onRemoveProject: (projectId: string) => Promise<void>
  onToggleProjectPinned: (projectId: string) => Promise<void>
  onPickProjectFolders: () => Promise<string[]>
  onOpenProjectDetail: (projectId: string) => void
  currentTime?: Date
}

export interface AddProjectFormProps {
  projectPaths: string[]
  isBusy: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onCancel?: () => void
  onPickFolders: () => void
}

function getBranchTone(branchName: string | null | undefined) {
  const branch = branchName?.trim().toLowerCase() ?? ''
  if (branch === 'master' || branch === 'main' || branch === 'dev' || branch.startsWith('dev/')) return 'blue'
  if (branch.startsWith('feature') || branch.startsWith('feat')) return 'green'
  if (branch.startsWith('bug')) return 'yellow'
  return 'blue'
}

function getProjectAnalysisStatus(status: ProjectItem['git']['status']) {
  if (status === 'unanalysed') return { labelKey: 'overview.unanalysed' as const, tone: 'warn' as const }
  if (status === 'normal') return { labelKey: 'overview.analysed' as const, tone: 'ok' as const }
  return { labelKey: 'overview.analysisError' as const, tone: 'err' as const }
}

export function AddProjectForm({
  projectPaths,
  isBusy,
  onSubmit,
  onCancel,
  onPickFolders,
}: AddProjectFormProps) {
  const { t } = useI18n()
  return (
    <form className="sd-overview__add-form" onSubmit={onSubmit}>
      <div className="sd-overview__selected-folders" aria-live="polite">
        <span className="sd-overview__search-label">{t('overview.selectedFolders', { count: projectPaths.length })}</span>
        {projectPaths.length > 0 ? (
          <ul>
            {projectPaths.map((path) => <li key={path}><code>{path}</code></li>)}
          </ul>
        ) : (
          <span className="sd-overview__selected-folders-empty">{t('overview.noFolders')}</span>
        )}
      </div>
      <div className="sd-overview__add-form-actions">
        <button type="button" className="sd-overview__btn" onClick={onPickFolders} disabled={isBusy}>
          {isBusy ? t('overview.processing') : t('overview.chooseFolders')}
        </button>
        <button type="submit" className="sd-overview__btn sd-overview__btn--cta" disabled={isBusy || projectPaths.length === 0}>
          {isBusy ? t('overview.adding') : t('overview.addCount', { count: projectPaths.length })}
        </button>
        {onCancel ? (
          <button type="button" className="sd-overview__btn" onClick={onCancel} disabled={isBusy}>
            {t('overview.cancel')}
          </button>
        ) : null}
      </div>
    </form>
  )
}

export function ProjectsOverviewPage({
  runningAnimals,
  runningAnimal,
  runningAnimalBackground,
  projects,
  providers,
  onAddProjects,
  onAnalyzeProject,
  onRemoveProject,
  onToggleProjectPinned,
  onPickProjectFolders,
  onOpenProjectDetail,
  currentTime,
}: ProjectsOverviewPageProps) {
  const { t, locale } = useI18n()
  const [filterText, setFilterText] = useState('')
  const [sort, setSort] = useState<{ key: 'name' | 'status'; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [folderPickerNotice, setFolderPickerNotice] = useState<string | null>(null)
  const [projectPaths, setProjectPaths] = useState<string[]>([])
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false)
  const [isPickingFolder, setIsPickingFolder] = useState(false)
  const [isAddingProjects, setIsAddingProjects] = useState(false)
  const [analyzingProjectId, setAnalyzingProjectId] = useState<string | null>(null)
  const [removingProjectId, setRemovingProjectId] = useState<string | null>(null)
  const [projectPendingRemoval, setProjectPendingRemoval] = useState<ProjectItem | null>(null)

  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const filteredProjects = projects.filter((proj) => {
    const keyword = filterText.trim().toLowerCase()
    if (!keyword) return true
    return (
      proj.name.toLowerCase().includes(keyword) ||
      proj.summary.toLowerCase().includes(keyword) ||
      proj.techStack.some((t) => t.toLowerCase().includes(keyword))
    )
  }).sort((left, right) => {
    const pinnedOrder = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    if (pinnedOrder) return pinnedOrder
    const leftValue = sort.key === 'name' ? left.name : t(getProjectAnalysisStatus(left.git.status).labelKey)
    const rightValue = sort.key === 'name' ? right.name : t(getProjectAnalysisStatus(right.git.status).labelKey)
    const order = collator.compare(leftValue, rightValue) * (sort.direction === 'asc' ? 1 : -1)
    return order || collator.compare(left.name, right.name) || collator.compare(left.id, right.id)
  })
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / 10))
  const currentPage = Math.min(page, pageCount)
  const visibleProjects = filteredProjects.slice((currentPage - 1) * 10, currentPage * 10)
  const toggleSort = (key: 'name' | 'status') => {
    setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  const noGitCount = projects.filter((p) => p.git.status === 'no-git').length
  const normalProviderCount = providers.filter((p) => p.statusKind === 'normal').length
  const handleAddProjects = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (projectPaths.length === 0 || isAddingProjects) return
    setIsAddingProjects(true)
    setFolderPickerNotice(null)
    try {
      const addedProjects = await onAddProjects(projectPaths)
      setProjectPaths([])
      setIsAddPanelOpen(false)
      setFolderPickerNotice(`${t('overview.addCount', { count: addedProjects.length })}；${t('overview.analyse')}。`)
    } catch (error) {
      setFolderPickerNotice(error instanceof Error ? error.message : t('shell.agentOffline'))
    } finally {
      setIsAddingProjects(false)
    }
  }

  const handleAnalyzeProject = async (projectId: string) => {
    if (analyzingProjectId || removingProjectId || isAddingProjects) return
    setAnalyzingProjectId(projectId)
    setFolderPickerNotice(null)
    try {
      const project = await onAnalyzeProject(projectId)
      setFolderPickerNotice(`${project.name}：${t('overview.analysed')}`)
    } catch (error) {
      setFolderPickerNotice(error instanceof Error ? error.message : t('shell.agentOffline'))
    } finally {
      setAnalyzingProjectId(null)
    }
  }

  const handleRemoveProject = async () => {
    const project = projectPendingRemoval
    if (!project) return
    if (removingProjectId || analyzingProjectId || isAddingProjects) return
    setProjectPendingRemoval(null)
    setRemovingProjectId(project.id)
    setFolderPickerNotice(null)
    try {
      await onRemoveProject(project.id)
      setPage(1)
      setFolderPickerNotice(`${project.name}：${t('overview.remove')}。${t('overview.folderKept')}`)
    } catch (error) {
      setFolderPickerNotice(error instanceof Error ? error.message : t('shell.agentOffline'))
    } finally {
      setRemovingProjectId(null)
    }
  }

  const handlePickProjectFolders = async () => {
    if (isPickingFolder || isAddingProjects) return
    setIsPickingFolder(true)
    setFolderPickerNotice(null)
    try {
      const selectedPaths = await onPickProjectFolders()
      setProjectPaths((previous) => [...new Set([...previous, ...selectedPaths])])
    } catch (error) {
      setFolderPickerNotice(error instanceof Error ? error.message : t('shell.agentOffline'))
    } finally {
      setIsPickingFolder(false)
    }
  }

  return (
    <div className="sd-overview">
      <GreetingBanner currentTime={currentTime} animals={runningAnimals} animal={runningAnimal} background={runningAnimalBackground} />

      <section className="sd-overview__metrics" aria-label="專案工作區指標">
        <article className="sd-overview__metric-card">
          <div className="sd-overview__metric-head"><span>{t('overview.activeProjects')}</span><strong>{projects.length} {t('overview.loaded')}</strong></div>
          <div className="sd-overview__metric-value">{projects.length}<small> {t('overview.workspaces')}</small></div>
          <div className="sd-overview__metric-foot"><span>{t('overview.currentProjects')}</span><span>{t('overview.local')}</span></div>
        </article>
        <article className="sd-overview__metric-card">
          <div className="sd-overview__metric-head"><span>{t('overview.jiraTasks')}</span><strong>{projects.reduce((total, project) => total + project.jira.tickets.length, 0)} {t('overview.linked')}</strong></div>
          <div className="sd-overview__metric-value">{projects.reduce((total, project) => total + project.jira.tickets.length, 0)}<small> {t('overview.tickets')}</small></div>
          <div className="sd-overview__metric-foot"><span>{t('overview.synced')}</span><span>Jira</span></div>
        </article>
        <article className="sd-overview__metric-card">
          <div className="sd-overview__metric-head"><span>{t('overview.aiProviders')}</span><strong>{normalProviderCount}/{providers.length} {t('overview.ready')}</strong></div>
          <div className="sd-overview__metric-value">{normalProviderCount}<small> {t('overview.healthy')}</small></div>
          <div className="sd-overview__metric-foot"><span>{t('overview.availableProviders')}</span><span>{providers.length ? `${Math.round((normalProviderCount / providers.length) * 100)}%` : '0%'}</span></div>
        </article>
        <article className="sd-overview__metric-card">
          <div className="sd-overview__metric-head"><span>{t('overview.gitHealth')}</span><strong>{noGitCount ? `${noGitCount} ${t('overview.warnings')}` : t('overview.allClear')}</strong></div>
          <div className="sd-overview__metric-value">{projects.length - noGitCount}<small> {t('overview.analyzed')}</small></div>
          <div className="sd-overview__metric-foot"><span>{t('overview.gitBranchFound')}</span><span>{projects.length ? `${Math.round(((projects.length - noGitCount) / projects.length) * 100)}%` : '0%'}</span></div>
        </article>
      </section>

      <section className="sd-overview__hero sd-overview__workspace-header">
        <div className="sd-overview__hero-text">
          <div className="sd-overview__title-row">
            <h1 className="sd-overview__title">{t('overview.title')}</h1>
          </div>
          <p className="sd-overview__subtitle">
            {t('overview.subtitle')}
          </p>
        </div>
        <div className="sd-overview__hero-actions">
          <button
            type="button"
            className="sd-overview__btn sd-overview__btn--cta"
            onClick={() => {
              setIsAddPanelOpen(true)
              setFolderPickerNotice(null)
            }}
          >
            {t('overview.addProject')}
          </button>
        </div>
      </section>

      {isAddPanelOpen ? (
        <div className="sd-overview__modal-backdrop" role="presentation" onMouseDown={() => setIsAddPanelOpen(false)}>
          <section
            className="sd-overview__modal sd-overview__modal--add"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sd-add-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sd-overview__modal-header">
              <h2 id="sd-add-project-title" className="sd-overview__add-panel-title">{t('overview.addFolderTitle')}</h2>
              <p className="sd-overview__add-panel-copy">
                {t('overview.addFolderCopy')}
              </p>
            </div>
            <AddProjectForm
              projectPaths={projectPaths}
              isBusy={isAddingProjects || isPickingFolder}
              onSubmit={(event) => void handleAddProjects(event)}
              onCancel={() => {
                setProjectPaths([])
                setIsAddPanelOpen(false)
              }}
              onPickFolders={() => void handlePickProjectFolders()}
            />
          </section>
        </div>
      ) : null}

      {folderPickerNotice ? (
        <div className="sd-overview__notice" role="status">
          <span>{folderPickerNotice}</span>
          <button
            type="button"
            className="sd-overview__notice-close"
            onClick={() => setFolderPickerNotice(null)}
          >
            {t('overview.closeNotice')}
          </button>
        </div>
      ) : null}

      {projectPendingRemoval ? (
        <div className="sd-overview__modal-backdrop" role="presentation" onMouseDown={() => setProjectPendingRemoval(null)}>
          <section
            className="sd-overview__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sd-remove-project-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="sd-remove-project-title">{t('overview.removeTitle')}</h2>
            <p>
              {t('overview.removeCopy', { name: projectPendingRemoval.name })}
              <br />{t('overview.folderKept')}
            </p>
            <div className="sd-overview__modal-actions">
              <button
                type="button"
                className="sd-overview__btn"
                onClick={() => setProjectPendingRemoval(null)}
              >
                {t('overview.cancel')}
              </button>
              <button
                type="button"
                className="sd-overview__btn sd-overview__btn--danger"
                disabled={removingProjectId !== null}
                onClick={() => void handleRemoveProject()}
              >
                {t('overview.confirmRemove')}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <section className="sd-overview__projects-panel" aria-label="專案清單">
        <header className="sd-overview__projects-toolbar" aria-label="專案篩選工具列">
          <div className="sd-overview__projects-heading">
            <h2 className="sd-overview__projects-title">{t('overview.projects')}</h2>
            <p className="sd-overview__projects-copy">{t('overview.projectsCopy')}</p>
          </div>
          <div className="sd-overview__search-box">
            <label className="sd-overview__search-label" htmlFor="sd-project-filter">
              {t('overview.filterLabel')}
            </label>
            <input
              id="sd-project-filter"
              type="search"
              className="sd-overview__search-input"
              placeholder={t('overview.filterPlaceholder')}
              value={filterText}
              onChange={(e) => { setFilterText(e.target.value); setPage(1) }}
            />
          </div>
        </header>
        <div className="sd-overview__table-wrap">
          <table className="sd-overview__project-table">
            <thead>
              <tr>
                <th scope="col" aria-sort={sort.key === 'name' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="sd-overview__sort" onClick={() => toggleSort('name')}>{t('overview.projectName')} <span aria-hidden="true">{sort.key === 'name' ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>
                <th scope="col" aria-sort={sort.key === 'status' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}><button type="button" className="sd-overview__sort" onClick={() => toggleSort('status')}>{t('overview.projectStatus')} <span aria-hidden="true">{sort.key === 'status' ? (sort.direction === 'asc' ? '▲' : '▼') : '↕'}</span></button></th>
                <th scope="col">{t('overview.gitBranch')}</th>
                <th scope="col">{t('overview.jiraCount')}</th>
                <th scope="col">{t('overview.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProjects.length > 0 ? visibleProjects.map((project) => {
                const projectStatus = getProjectAnalysisStatus(project.git.status)
                return (
                  <tr key={project.id}>
                    <td>
                      <div className="sd-overview__project-name-cell">
                        <div>
                          <strong className="sd-overview__project-name">{project.name}</strong>
                        </div>
                      </div>
                    </td>
                    <td>
                        <StatusBadge label={t(projectStatus.labelKey)} tone={projectStatus.tone} mono />
                    </td>
                    <td>
                      {project.git.status === 'unanalysed' ? (
                        <StatusBadge label={t('overview.notAnalysed')} tone="accent" mono />
                      ) : project.git.status === 'no-git' ? (
                        <StatusBadge label={t('overview.noGit')} tone="err" mono />
                      ) : (
                        <code className={`sd-overview__branch-value sd-overview__branch-value--${getBranchTone(project.git.branchName)}`}>
                          {project.git.branchName ?? 'main'}
                        </code>
                      )}
                    </td>
                    <td><span className="sd-overview__jira-count">{project.jira.tickets.length}</span></td>
                    <td>
                      <div className="sd-overview__project-actions">
                        <button
                          type="button"
                          className="sd-overview__btn sd-overview__btn--primary"
                          onClick={() => onOpenProjectDetail(project.id)}
                        >
                          {t('overview.projectDetail')}
                        </button>
                        <button
                          type="button"
                          className="sd-overview__btn sd-overview__btn--cta"
                          disabled={analyzingProjectId !== null || removingProjectId !== null || isAddingProjects}
                          onClick={() => void handleAnalyzeProject(project.id)}
                        >
                          {analyzingProjectId === project.id
                            ? t('overview.analysing')
                            : project.git.status === 'unanalysed' ? t('overview.analyse') : t('overview.reanalyse')}
                        </button>
                        {!project.isDemoFixture ? (
                          <button
                            type="button"
                            className="sd-overview__btn sd-overview__btn--danger"
                            disabled={removingProjectId !== null || analyzingProjectId !== null || isAddingProjects}
                            onClick={() => setProjectPendingRemoval(project)}
                          >
                            {removingProjectId === project.id ? t('overview.removing') : t('overview.remove')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={`sd-overview__pin-btn ${project.pinned ? 'sd-overview__pin-btn--active' : ''}`}
                          onClick={() => {
                            void onToggleProjectPinned(project.id).then(() => setPage(1)).catch((error) => {
                              setFolderPickerNotice(error instanceof Error ? error.message : t('shell.agentOffline'))
                            })
                          }}
                          aria-pressed={project.pinned === true}
                          aria-label={project.pinned ? t('overview.unpin', { name: project.name }) : t('overview.pin', { name: project.name })}
                        >
                          {project.pinned ? t('overview.pinned') : t('overview.pinShort')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={5} className="sd-overview__empty-cell">
                    {projects.length === 0 ? t('overview.empty') : t('overview.noMatch')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {pageCount > 1 ? <nav className="sd-overview__pagination" aria-label={t('overview.pagination')}><button type="button" className="sd-overview__btn" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t('common.previous')}</button><span>{t('overview.pageOf', { page: currentPage, pages: pageCount })}</span><button type="button" className="sd-overview__btn" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>{t('common.next')}</button></nav> : null}
      </section>

      <button
        type="button"
        className="sd-overview__floating-add"
        onClick={() => {
          setIsAddPanelOpen(true)
          setFolderPickerNotice(null)
        }}
        aria-label={t('overview.newProject')}
      >
        <span aria-hidden="true">＋</span>
        <span>{t('overview.newProject')}</span>
      </button>

    </div>
  )
}
