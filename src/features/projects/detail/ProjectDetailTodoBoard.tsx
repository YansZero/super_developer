import { AgentProgressPanel } from './AgentProgressPanel'
import { taskProgress } from '../../../../shared/agentProgress'
import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import { ProgressMeter } from '../../../shared/components/ProgressMeter'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import type { ProjectItem, SideProgress } from '../../../shared/types/domain'
import { useI18n } from '../../../shared/i18n'
import { aiJobHref, getLoadedProgress, getProgressDocuments, isProgressDocumentCompleted, splitTodosByCompletion, type ProgressDocument } from './projectDetailHelpers'
import { getDispatchJobsSnapshot, loadTrackedDispatchJobs, subscribeDispatchJobs } from './dispatchJobStore'
import { MarkdownAnalysisOutput } from './ProjectDetailArchitectureTree'

interface Props {
  requestedSource?: string | null
  project: ProjectItem
  loadedDocuments: Record<'frontend' | 'backend', string | null>
  setLoadedDocuments: Dispatch<SetStateAction<Record<'frontend' | 'backend', string | null>>>
  onStartImplementation: (document: ProgressDocument) => void | Promise<void>
  onRefreshProgress: (projectId: string, projectPath: string) => Promise<void>
  onClearSource?: () => void
}

export function ProjectDetailTodoBoard({ requestedSource, project, loadedDocuments, setLoadedDocuments, onStartImplementation, onRefreshProgress, onClearSource }: Props) {
  const { t } = useI18n()
  const dispatchJobs = useSyncExternalStore(subscribeDispatchJobs, getDispatchJobsSnapshot, getDispatchJobsSnapshot)
  const [startingDocument, setStartingDocument] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [jobsLoaded, setJobsLoaded] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const previousStatuses = useRef<Record<string, string>>({})
  const refreshProgressRef = useRef(onRefreshProgress)
  useEffect(() => { refreshProgressRef.current = onRefreshProgress }, [onRefreshProgress])
  const [selectedDocuments, setSelectedDocuments] = useState<Record<'frontend' | 'backend', string | null>>({ frontend: null, backend: null })

  useEffect(() => {
    let cancelled = false
    void loadTrackedDispatchJobs().then(() => {
      if (cancelled) return
      setJobsLoaded(true)
      void refreshProgressRef.current(project.id, project.folderPath ?? project.folderDisplayName).catch((error: unknown) => { if (!cancelled) setRefreshError(error instanceof Error ? error.message : t('common.refreshFailed')) })
    }).catch((error: unknown) => { if (!cancelled) setJobsError(error instanceof Error ? error.message : t('common.refreshFailed')) })
    return () => { cancelled = true }
  }, [project.id, project.folderPath, project.folderDisplayName, t])

  useEffect(() => {
    const previous = previousStatuses.current
    const finished = dispatchJobs.filter((record) => record.job.projectId === project.id && record.progressSourceFileLabel && previous[record.job.id] && ['queued', 'running'].includes(previous[record.job.id]) && !['queued', 'running'].includes(record.job.status))
    previousStatuses.current = Object.fromEntries(dispatchJobs.map((record) => [record.job.id, record.job.status]))
    if (finished.length) {
      setLoadedDocuments((current) => {
        const next = { ...current }
        for (const category of ['frontend', 'backend'] as const) {
          const progress = category === 'frontend' ? project.frontendProgress : project.backendProgress
          const record = finished.find((item) => progress.todos.some((todo) => todo.sourceFileLabel === item.progressSourceFileLabel))
          if (record?.progressSourceFileLabel) next[category] = record.progressSourceFileLabel
        }
        return next
      })
      void onRefreshProgress(project.id, project.folderPath ?? project.folderDisplayName).catch((error: unknown) => setRefreshError(error instanceof Error ? error.message : t('common.refreshFailed')))
    }
  }, [dispatchJobs, onRefreshProgress, project.id, project.folderPath, project.folderDisplayName, project.frontendProgress, project.backendProgress, setLoadedDocuments, t])

  const handleStart = async (document: ProgressDocument) => {
    if (startingDocument) return
    setStartingDocument(document.sourceFileLabel)
    setStartError(null)
    try {
      await onStartImplementation(document)
    } catch (error) {
      setStartError(error instanceof Error ? error.message : t('common.implementationStartFailed'))
    } finally {
      setStartingDocument(null)
    }
  }

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      await onRefreshProgress(project.id, project.folderPath ?? project.folderDisplayName)
      setLoadedDocuments((current) => {
        const next = { ...current }
        for (const cat of ['frontend', 'backend'] as const) {
          const prog = cat === 'frontend' ? project.frontendProgress : project.backendProgress
          const docs = getProgressDocuments(prog.todos)
          const loaded = current[cat]
          const doc = docs.find((d) => d.sourceFileLabel === loaded)
          if (!loaded || !doc || isProgressDocumentCompleted(doc)) {
            next[cat] = null
          }
        }
        return next
      })
      onClearSource?.()
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : t('common.refreshFailed'))
    } finally {
      setRefreshing(false)
    }
  }

  const renderEmptyPane = (category: 'frontend' | 'backend') => (
    <div className="sd-detail__pane">
      <div className="sd-detail__pane-header">
        <span className={`sd-detail__cube sd-detail__cube--${category === 'frontend' ? 'fe' : 'be'}`} aria-hidden="true">◆</span>
        <strong>{t(category === 'frontend' ? 'progress.frontendTitle' : 'progress.backendTitle')}</strong>
        <span className="sd-detail__progress-empty" role="status">{t('progress.noDispatch')}</span>
      </div>
    </div>
  )

  const renderPane = (category: 'frontend' | 'backend', progress: SideProgress) => {
    const allTodos = progress.todos
    const allDocuments = getProgressDocuments(allTodos)
    const documents = allDocuments.filter((document) => !isProgressDocumentCompleted(document))
    const requestedDoc = allDocuments.find((document) => document.sourceFileLabel === requestedSource)
    const requested = loadedDocuments[category] === requestedSource && requestedDoc && !isProgressDocumentCompleted(requestedDoc) ? requestedSource : null
    const candidateSelectedDocumentLabel = selectedDocuments[category] && documents.some((document) => document.sourceFileLabel === selectedDocuments[category])
      ? selectedDocuments[category]
      : requested ?? documents[0]?.sourceFileLabel ?? null
    const activeRecord = dispatchJobs.find((record) => record.job.projectId === project.id && record.taskType === 'custom' && ['queued', 'running'].includes(record.job.status) && (!requested || requested === record.progressSourceFileLabel) && allDocuments.some((document) => document.sourceFileLabel === record.progressSourceFileLabel))
    const selectedDocumentLabel = documents.some((document) => document.sourceFileLabel === activeRecord?.progressSourceFileLabel)
      ? activeRecord?.progressSourceFileLabel
      : candidateSelectedDocumentLabel
    const selectedDocument = documents.find((document) => document.sourceFileLabel === selectedDocumentLabel)
    const loadedDocumentLabel = requested ?? activeRecord?.progressSourceFileLabel ?? (loadedDocuments[category] && allDocuments.some((document) => document.sourceFileLabel === loadedDocuments[category] && !isProgressDocumentCompleted(document)) ? loadedDocuments[category] : null)
    const loadedProgress = getLoadedProgress({ ...progress, todos: allTodos }, loadedDocumentLabel)
    const loadedSplit = splitTodosByCompletion(loadedProgress.todos)
    const locked = Boolean(activeRecord)
    const prepared = loadedDocumentLabel !== null
    const total = loadedProgress.todos.length
    const isLoadedCompleted = total > 0 && loadedSplit.pending.length === 0
    const associatedRecord = activeRecord ?? (loadedDocumentLabel ? dispatchJobs.find((record) => record.job.projectId === project.id && record.progressSourceFileLabel === loadedDocumentLabel) : undefined)
    if (documents.length === 0 && !activeRecord) return renderEmptyPane(category)
    const liveProgress = associatedRecord?.job.tasks?.length ? taskProgress(associatedRecord.job.tasks) : null
    const percentage = liveProgress?.percentage ?? (total ? Math.round(loadedSplit.completed.length / total * 100) : 0)

    return (
      <details className="sd-detail__pane sd-detail__progress-pane" open>
        <summary className="sd-detail__progress-summary">
          <span className={`sd-detail__cube sd-detail__cube--${category === 'frontend' ? 'fe' : 'be'}`} aria-hidden="true">◆</span>
          <strong>{t(category === 'frontend' ? 'progress.frontendTitle' : 'progress.backendTitle')}</strong>
          {isLoadedCompleted ? <StatusBadge label={t('common.completed')} tone="ok" /> : null}
        </summary>
        <div className="sd-detail__progress-stats">
          <span className="sd-detail__progress-source">{t('progress.source')} <strong>{loadedDocumentLabel ?? '—'}</strong></span>
          <span>{t('progress.pendingCount')} <strong>{liveProgress ? liveProgress.total - liveProgress.completed : loadedSplit.pending.length}</strong></span>
          <span>{t('progress.completedCount')} <strong>{liveProgress?.completed ?? loadedSplit.completed.length}/{liveProgress?.total ?? total}</strong></span>
          <span>{t('progress.percentage')} <strong>{percentage}%</strong></span>
          <progress value={percentage} max={100} aria-label={t('progress.percentage')} />
        </div>
        <div className="sd-detail__todo-actions sd-detail__progress-buttons">
          {associatedRecord ? <a className="sd-detail__mini-btn sd-detail__progress-job-link" href={aiJobHref(associatedRecord.job.id)}>{t('agentProgress.openJob')}</a> : null}
          <button
            type="button"
            className="sd-detail__mini-btn"
            disabled={!jobsLoaded || !prepared || locked}
            onClick={() => {
              setLoadedDocuments((current) => ({ ...current, [category]: null }))
              onClearSource?.()
            }}
          >
            {t('common.clearProgress')}
          </button>
          {isLoadedCompleted ? (
            <button type="button" className="sd-detail__mini-btn" disabled>
              ✓ {t('common.allTasksCompleted')}
            </button>
          ) : (
            <button
              type="button"
              className="sd-detail__mini-btn"
              disabled={!selectedDocument || !prepared || selectedDocumentLabel !== loadedDocumentLabel || startingDocument !== null || locked || !jobsLoaded || !loadedSplit.pending.length}
              onClick={() => { if (selectedDocument) void handleStart(selectedDocument) }}
            >
              {locked ? t('common.dispatchProgressLocked') : startingDocument ? t('common.implementationInProgress') : t('common.startImplementation')}
            </button>
          )}
        </div>
        {associatedRecord?.job.tasks?.length ? <AgentProgressPanel record={associatedRecord} /> : null}
        {prepared && !associatedRecord?.job.tasks?.length ? <details className="sd-detail__todo-groups" open>
          <summary className="sd-detail__todo-source-summary">{t('progress.pendingItems')} ({loadedSplit.pending.length})</summary>
          <ul className="sd-detail__todo-list">{loadedSplit.pending.map((todo) => <li key={todo.id} className="sd-detail__todo-item"><div className="sd-detail__todo-main"><input type="checkbox" checked={todo.completed} disabled aria-label={todo.title} /><span className="sd-detail__todo-title">{todo.title}</span></div></li>)}</ul>
        </details> : !prepared ? <div className="sd-detail__todo-not-prepared" role="status">{t('common.dispatchTasksNotPrepared')}</div> : null}
        <details className="sd-detail__todo-groups" open>
          <summary className="sd-detail__todo-source-summary">{t('progress.documents')} ({documents.length})</summary>
          <div className="sd-detail__todo-document sd-detail__document-body">
            {selectedDocument ? <>
              <div className="sd-detail__document-header">
                <button type="button" className="sd-detail__mini-btn" disabled={selectedDocumentLabel === loadedDocumentLabel || locked || !jobsLoaded} onClick={() => setLoadedDocuments((current) => ({ ...current, [category]: selectedDocumentLabel }))}>{selectedDocumentLabel === loadedDocumentLabel && prepared ? t('common.dispatchPrepared') : t('common.loadDispatchTasks')}</button>
              </div>
              <div className="sd-detail__document-content">
                <div className="sd-detail__todo-document-list"><ul>{documents.map((document) => <li key={document.sourceFileLabel}><button type="button" className="sd-detail__todo-document-tab" disabled={locked} aria-pressed={document.sourceFileLabel === selectedDocumentLabel} onClick={() => setSelectedDocuments((current) => ({ ...current, [category]: document.sourceFileLabel }))}>{document.sourceFileLabel}</button></li>)}</ul></div>
                <MarkdownAnalysisOutput markdown={selectedDocument.content} />
              </div>
            </> : <p>{t('progress.noPendingDocuments')}</p>}
          </div>
        </details>
      </details>
    )
  }

  const renderUnavailablePane = (category: 'frontend' | 'backend', progress: SideProgress) => progress.missingReason === `project.progress.${category}JobNotFound` ? renderEmptyPane(category) : (
    <div className="sd-detail__pane">
      <div className="sd-detail__pane-header">
        <span className={`sd-detail__cube sd-detail__cube--${category === 'frontend' ? 'fe' : 'be'}`} aria-hidden="true">◆</span>
        <div className="sd-detail__pane-progress-wrap">
          <ProgressMeter label={t(category === 'frontend' ? 'common.frontendProgress' : 'common.backendProgress')} progress={progress} />
        </div>
      </div>
      <div className="sd-detail__missing-card" role="status">
        <strong>{t(category === 'backend' ? 'common.backendTodosUnavailable' : 'common.frontendTodosUnavailable')}</strong>
        <p>{t(progress.missingReason ?? 'project.progress.defaultMissingReason')}</p>
      </div>
    </div>
  )

  const renderCompletedPane = (category: 'frontend' | 'backend', progress: SideProgress) => {
    const documents = getProgressDocuments(progress.todos)
    const completedDocuments = documents.filter(isProgressDocumentCompleted)
    const sourceSuffix = category === 'frontend' ? /(?:^|[_-])FE\.md$/i : /(?:^|[_-])BE\.md$/i
    const completedJobs = dispatchJobs.filter((record) => record.job.projectId === project.id && record.taskType === 'custom' && record.job.status === 'succeeded' && record.progressSourceFileLabel && sourceSuffix.test(record.progressSourceFileLabel))
    return <details className="sd-detail__pane sd-detail__completed-pane" open={completedDocuments.length > 0}>
      <summary className="sd-detail__todo-source-summary">
        <span className={`sd-detail__cube sd-detail__cube--${category === 'frontend' ? 'fe' : 'be'}`} aria-hidden="true">◆</span>
        <span>{t(category === 'frontend' ? 'progress.completedFrontend' : 'progress.completedBackend')} ({completedDocuments.length})</span>
      </summary>
      <div className="sd-detail__completed-content">
        <strong>{t('progress.completedJobs')}</strong>
        {completedJobs.length ? <ul className="sd-detail__todo-list">
          {completedJobs.map((record) => (
            <li className="sd-detail__todo-item sd-detail__completed-job" key={record.job.id}>
              <span>AI Job ID: {record.job.id}</span>
              <span>{t('progress.source')}: {record.progressSourceFileLabel}</span>
              <div className="sd-detail__completed-job-actions">
                <a className="sd-detail__mini-btn sd-detail__progress-job-link" href={aiJobHref(record.job.id)}>{t('agentProgress.openJob')}</a>
              </div>
            </li>
          ))}
        </ul> : <p>{t('progress.noCompletedJobs')}</p>}
        <strong>{t('progress.completedDocuments')}</strong>
        {completedDocuments.length ? completedDocuments.map((document) => <details className="sd-detail__todo-groups" key={document.sourceFileLabel}>
          <summary className="sd-detail__todo-source-summary">{document.sourceFileLabel} · {document.todos.length}/{document.todos.length} (100%)</summary>
          <ul className="sd-detail__todo-list">{document.todos.map((todo) => (
            <li key={todo.id} className="sd-detail__todo-item">
              <div className="sd-detail__todo-main">
                <span className="sd-agent-task-mark" role="img" aria-label={t('common.completed')}>✓</span>
                <span>{todo.title}</span>
              </div>
            </li>
          ))}</ul>
          <div className="sd-detail__todo-document"><MarkdownAnalysisOutput markdown={document.content} /></div>
        </details>) : <p>{t('progress.noCompletedDocuments')}</p>}
      </div>
    </details>
  }

  return (
    <section className="sd-detail__section sd-detail__progress-board" aria-label={t('common.frontendAndBackendTodoBoard')}>
      <header className="sd-detail__section-head">
        <div>
          <h2 className="sd-detail__section-title">{t('common.frontendAndBackendProgressBoard')}</h2>
          <p className="sd-detail__section-sub">{t('common.frontendAndBackendTodosAreShownTogetherCompletedAndPendingItemsAreDistinctCheckboxesCurrentlyUpdateBrowserMemoryOnly')}</p>
        </div>
        <div>
          <button type="button" className="sd-detail__mini-btn" onClick={() => void handleRefresh()} disabled={refreshing}>
            {refreshing ? t('common.loading') : t('common.refresh')}
          </button>
          {refreshError ? <p className="sd-detail__dispatch-error" role="alert">{refreshError}</p> : null}
        </div>
      </header>
      {jobsError ? <p className="sd-detail__dispatch-error" role="alert">{jobsError}</p> : null}
      {startError ? <p className="sd-detail__dispatch-error" role="alert">{startError}</p> : null}
      <div className="sd-detail__progress-grid">
        {project.frontendProgress.available
          ? renderPane('frontend', project.frontendProgress)
          : renderUnavailablePane('frontend', project.frontendProgress)}
        {project.backendProgress.available
          ? renderPane('backend', project.backendProgress)
          : renderUnavailablePane('backend', project.backendProgress)}
      </div>
      <section className="sd-detail__completed-section" aria-label={t('progress.completedTitle')}>
        <h2 className="sd-detail__section-title">{t('progress.completedTitle')}</h2>
        <div className="sd-detail__progress-grid">
          {renderCompletedPane('frontend', project.frontendProgress)}
          {renderCompletedPane('backend', project.backendProgress)}
        </div>
      </section>
    </section>
  )
}
