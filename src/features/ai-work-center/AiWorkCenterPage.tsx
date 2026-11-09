import { AgentProgressPanel } from '../projects/detail/AgentProgressPanel'
import { progressBoardHref } from '../projects/detail/projectDetailHelpers'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ClipboardEvent } from 'react'
import type { ProjectArchitectureAnalysis, ProjectItem, ProviderId, ProviderSummary } from '../../shared/types/domain'
import { PromptImageAttachments, handlePromptImagePaste } from '../../shared/components/PromptImageAttachments'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { useI18n } from '../../shared/i18n'
import { getProviderStatusKey } from '../../shared/providers/providerPresentation'
import { useProviderModelSelection } from '../../shared/providers/useProviderModelSelection'
import { deleteAiJobsByDateRange, resolveDispatchErrorMessage } from '../projects/detail/dispatchClient'
import type { ImageAttachment, StartDispatchInput } from '../projects/detail/dispatchClient'
import { cancelTrackedDispatch, getDispatchJobsSnapshot, loadTrackedDispatchJobs, removeTrackedDispatchJob, removeTrackedDispatchJobsByDateRange, startTrackedDispatch, subscribeDispatchJobs } from '../projects/detail/dispatchJobStore'
import type { TrackedDispatchJob } from '../projects/detail/dispatchJobStore'
import './AiWorkCenterPage.css'
import './AiWorkCenterPage.scss'
import './running-indicator.scss'

interface AiWorkCenterPageProps {
  providers: ProviderSummary[]
  projects: ProjectItem[]
  onSaveArchitectureAnalysis?: (projectId: string, analysis: ProjectArchitectureAnalysis) => Promise<void>
}
type WorkFilter = 'all' | 'active' | 'history'
type JobOutcome = 'running' | 'success' | 'failed' | 'unknown'
const JOBS_PER_PAGE = 10

function isActive(record: TrackedDispatchJob) { return record.job.status === 'queued' || record.job.status === 'running' }
function outcome(record: TrackedDispatchJob): JobOutcome {
  if (isActive(record)) return 'running'
  if (record.job.status === 'succeeded') return 'success'
  return record.aiJob.status === 'UNKNOWN ERROR' || record.job.status === 'cancelled' || record.job.status === 'timed_out' ? 'unknown' : 'failed'
}
function tone(value: JobOutcome) { return ({ success: 'ok', failed: 'err', unknown: 'err', running: 'accent' } as const)[value] }
function dateText(value: string, locale: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale) }
function elapsed(startedAt: string, updatedAt: string) { const ms = Math.max(0, Date.parse(updatedAt) - Date.parse(startedAt)); if (!Number.isFinite(ms)) return '—'; const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}m ${seconds % 60}s` }
function shortText(value: string, max = 150) { const text = value.trim(); return text.length > max ? `${text.slice(0, max - 1)}…` : text }
function statusKey(value: JobOutcome) { return `aiWork.status.${value}` }

function JobRow({ record, providers, focused, busy, onCancel, onDelete, onRetry }: { record: TrackedDispatchJob; focused: boolean; providers: ProviderSummary[]; busy: boolean; onCancel: (record: TrackedDispatchJob) => void; onDelete: (record: TrackedDispatchJob) => void; onRetry: (record: TrackedDispatchJob) => void }) {
  const { t, locale } = useI18n()
  const [expanded, setExpanded] = useState(() => isActive(record))
  const boardHref = progressBoardHref(record.job.projectName, record.progressSourceFileLabel)
  useEffect(() => { if (focused) document.getElementById(`agent-job-${record.job.id}`)?.scrollIntoView?.({ block: 'center' }) }, [focused, record.job.id])
  const currentOutcome = outcome(record)
  const provider = providers.find((item) => item.id === record.job.providerId)?.name ?? record.job.providerId
  const model = record.modelId === 'default' ? t('common.cliDefault') : record.modelId
  const effort = record.effort === 'default' ? t('common.cliDefault') : record.effort
  const error = record.job.error ?? record.aiJob.errorReason
  const output = record.job.resultOutput || record.aiJob.outputMarkdown
  const canRetry = record.taskType === 'custom' || record.taskType === 'jira' || record.taskType === 'architecture'
  const taskLabel = record.job.projectId === 'library-prompt'
    ? t('prompts.translationJob')
    : record.taskType === 'custom'
    ? t('common.aiWorkDispatch')
    : record.taskType === 'jira'
    ? t('common.jiraDispatch')
    : record.taskType === 'architecture'
      ? t('common.architectureAnalysis')
      : record.taskType === 'library-skill'
        ? t('common.skillAiDraft')
        : t('common.mcpAiDraft')
  return <article id={`agent-job-${record.job.id}`} className={`sd-ai-work__job sd-ai-work__job--${currentOutcome}${focused ? ' sd-ai-work__job--target' : ''}`}>
    <div className="sd-ai-work__job-main">
      <div className="sd-ai-work__job-title"><span className="sd-ai-work__job-id">{record.job.id}</span><h3>{record.aiJob.summary || record.job.summary || record.job.projectName}</h3><span className="sd-ai-work__task-type">{taskLabel}</span></div>
      <p>{record.jiraTicketKey ? `${record.jiraTicketKey} · ${record.jiraTicketTitle || record.aiJob.summary}` : record.job.projectName}</p>
      <button className="sd-ai-work__detail-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? t('aiWork.hideDetails') : t('aiWork.viewFullLog')}</button>
      {record.job.projectId && !record.job.projectId.startsWith('library-') ? <div>
        <a className="sd-ai-work__detail-toggle sd-ai-work__board-link" href={boardHref}>{t('agentProgress.backToBoard')}</a>
      </div> : null}
    </div>
    <div className="sd-ai-work__job-cell"><span>{t('aiWork.providerModelEffort')}</span><strong>{provider} / {model} / {effort}</strong></div>
    <div className="sd-ai-work__job-cell"><span>{isActive(record) ? t('aiWork.startedElapsed') : t('aiWork.finishedDuration')}</span><strong>{dateText(record.job.startedAt, locale)}<br />{elapsed(record.job.startedAt, record.job.updatedAt)}</strong></div>
    <div className={`sd-ai-work__job-status${record.job.status === 'running' ? ' sd-ai-work__job-status--running' : ''}`}><StatusBadge label={t(statusKey(currentOutcome))} tone={tone(currentOutcome)} mono /></div>
    <div className="sd-ai-work__job-actions">{isActive(record) ? <button type="button" className="is-danger" disabled={busy} onClick={() => onCancel(record)}>{busy ? t('common.cancelling') : t('common.cancelWork')}</button> : <><button type="button" className="is-danger" disabled={busy} onClick={() => onDelete(record)}>{t('aiWork.deleteRecord')}</button>{canRetry ? <button type="button" disabled={busy} onClick={() => onRetry(record)}>{t('aiWork.retryJob')}</button> : null}</>}</div>
    {expanded ? <div className="sd-ai-work__details">{record.job.tasks?.length ? <AgentProgressPanel record={record} /> : null}<div className="sd-ai-work__summary"><h4>{t('aiWork.jobSummary')}</h4><p>{shortText(record.aiJob.summary || record.job.projectName)}</p></div><div className="sd-ai-work__detail-panels"><div><h4>{t('aiWork.jobInput')}</h4><pre>{record.aiJob.inputMarkdown || t('aiWork.noInput')}</pre></div><div><h4>{t('aiWork.executionOutput')}</h4><pre>{record.job.executionOutput || t('aiWork.noOutput')}</pre></div><div><h4>{t('aiWork.resultSummary')}</h4><pre>{shortText(output || (error ? t('aiWork.executionFailed') : t('aiWork.noOutput')))}</pre></div></div>{error ? <div className="sd-ai-work__error"><h4>{t('aiWork.errorReason')}</h4><p>{error}</p></div> : null}</div> : null}
  </article>
}

function SelectFilter({ label, value, options, onChange }: { label: string; value: string; options: ReadonlyArray<{ value: string; label: string }>; onChange: (value: string) => void }) { return <label className="sd-ai-work__select"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label> }

interface DispatchJobDialogProps {
  providers: ProviderSummary[]
  projects: ProjectItem[]
  initialProjectId?: string
  initialPrompt?: string
  onClose: () => void
  onStart: (input: StartDispatchInput) => Promise<void>
}

function DispatchJobDialog({ providers, projects, initialProjectId, initialPrompt, onClose, onStart }: DispatchJobDialogProps) {
  const { t } = useI18n()
  const availableProviders = providers.filter((provider) => provider.isBuiltin)
  const dispatchProviders = availableProviders.length > 0 ? availableProviders : providers
  const modelSelection = useProviderModelSelection(dispatchProviders[0]?.id ?? 'antigravity')
  const [projectId, setProjectId] = useState((initialProjectId || projects.find((project) => project.folderPath)?.id) ?? '')
  const [prompt, setPrompt] = useState(initialPrompt ?? '')
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([])
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catalogCurrent = modelSelection.providerModelCatalog.providerId === modelSelection.selectedProviderId
  const selectedModel = modelSelection.providerModelCatalog.models.find((model) => model.id === modelSelection.selectedModelId)
  const effortOptions = selectedModel?.efforts ?? []
  const selectedProject = projects.find((project) => project.id === projectId)

  const handlePromptPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    handlePromptImagePaste(event, {
      current: imageAttachments,
      onChange: (next) => {
        setError(null)
        setImageAttachments(next)
      },
      onError: setError,
      messages: {
        tooLarge: t('aiWork.imageAttachmentTooLarge'),
        maxCount: t('aiWork.imageAttachmentMaxCount'),
      },
    })
  }

  const handleStart = async () => {
    if (!selectedProject?.folderPath || !prompt.trim()) {
      setError(t('aiWork.dispatchRequiredFields'))
      return
    }
    setStarting(true)
    setError(null)
    try {
      await onStart({
        taskType: 'custom',
        projectId: selectedProject.id,
        projectPath: selectedProject.folderPath,
        projectName: selectedProject.name,
        branchName: selectedProject.git.branchName,
        providerId: modelSelection.selectedProviderId,
        modelId: modelSelection.selectedModelId,
        effort: modelSelection.selectedEffort,
        prompt: prompt.trim(),
        ...(imageAttachments.length > 0 ? { imageAttachment: imageAttachments[0], imageAttachments } : {}),
        jiraTicketTitle: prompt.trim().split('\n')[0].slice(0, 300),
      })
    } catch (nextError) {
      setError(resolveDispatchErrorMessage(nextError, t))
    } finally {
      setStarting(false)
    }
  }

  return <div className="sd-ai-work__dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !starting) onClose() }}>
    <section className="sd-ai-work__dialog sd-ai-work__dispatch-dialog" role="dialog" aria-modal="true" aria-labelledby="ai-work-dispatch-dialog-title">
      <div className="sd-ai-work__dialog-head"><div><p className="sd-ai-work__dialog-kicker">{t('aiWork.dispatchNewJob')}</p><h2 id="ai-work-dispatch-dialog-title">{t('aiWork.dispatchDialogTitle')}</h2></div><button type="button" className="sd-ai-work__dialog-close" onClick={onClose} disabled={starting} aria-label={t('common.close')}>×</button></div>
      <div className="sd-ai-work__dialog-body">
        <div className="sd-ai-work__dispatch-fields">
          <label className="sd-ai-work__select"><span>{t('aiWork.providerLabel')}</span><select aria-label={t('aiWork.providerLabel')} value={modelSelection.selectedProviderId} disabled={starting || dispatchProviders.length === 0} onChange={(event) => { modelSelection.setSelectedProviderId(event.target.value as ProviderId); modelSelection.setSelectedModelId('default'); modelSelection.setSelectedEffort('default'); modelSelection.setProviderModelLoading(true) }}>{dispatchProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} — {getProviderStatusKey(provider) ? t(getProviderStatusKey(provider)!, { version: provider.version ?? '' }) : t(provider.statusText)}</option>)}</select></label>
          <label className="sd-ai-work__select"><span>{t('aiWork.modelLabel')}</span><select aria-label={t('aiWork.modelLabel')} value={modelSelection.selectedModelId} disabled={starting || modelSelection.providerModelLoading || !catalogCurrent} onChange={(event) => { const model = modelSelection.providerModelCatalog.models.find((item) => item.id === event.target.value); modelSelection.setSelectedModelId(event.target.value); modelSelection.setSelectedEffort(model?.efforts.includes('medium') ? 'medium' : model?.efforts[0] ?? 'default') }}>{modelSelection.providerModelCatalog.models.map((model) => <option key={model.id} value={model.id}>{t(model.label)}</option>)}</select></label>
          <label className="sd-ai-work__select"><span>{t('aiWork.effortLabel')}</span><select aria-label={t('aiWork.effortLabel')} value={modelSelection.selectedEffort} disabled={starting || modelSelection.selectedModelId === 'default' || effortOptions.length === 0} onChange={(event) => modelSelection.setSelectedEffort(event.target.value)}>{modelSelection.selectedModelId === 'default' || effortOptions.length === 0 ? <option value="default">{t('common.cliDefault')}</option> : effortOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
          <label className="sd-ai-work__select"><span>{t('aiWork.projectLabel')}</span><select aria-label={t('aiWork.projectLabel')} value={projectId} disabled={starting} onChange={(event) => setProjectId(event.target.value)}><option value="">{t('aiWork.chooseProject')}</option>{projects.map((project) => <option key={project.id} value={project.id} disabled={!project.folderPath}>{project.name}{project.folderPath ? '' : ` — ${t('aiWork.projectPathUnavailable')}`}</option>)}</select></label>
        </div>
        <p className="sd-ai-work__model-note" role="status">{modelSelection.providerModelLoading || !catalogCurrent ? t('common.loadingAvailableModelsForThisProvider') : modelSelection.providerModelError ?? t(modelSelection.providerModelCatalog.message)}</p>
        <label className="sd-ai-work__prompt-field"><span>{t('aiWork.taskPromptLabel')}</span><textarea aria-label={t('aiWork.taskPromptLabel')} rows={7} value={prompt} onChange={(event) => setPrompt(event.target.value)} onPaste={handlePromptPaste} placeholder={t('aiWork.taskPromptPlaceholder')} /></label>
        <PromptImageAttachments
          attachments={imageAttachments}
          onRemove={(index) => setImageAttachments((prev) => prev.filter((_, i) => i !== index))}
          disabled={starting}
        />
        {error ? <p className="sd-ai-work__dialog-error" role="alert">{error}</p> : null}
        <div className="sd-ai-work__dialog-actions"><button type="button" onClick={onClose} disabled={starting}>{t('common.cancel')}</button><button type="button" className="is-primary" onClick={() => void handleStart()} disabled={starting || !selectedProject?.folderPath || !prompt.trim() || modelSelection.providerModelLoading || !catalogCurrent}>{starting ? t('common.starting') : t('aiWork.startDispatch')}</button></div>
      </div>
    </section>
  </div>
}

export function AiWorkCenterPage({ providers, projects, onSaveArchitectureAnalysis }: AiWorkCenterPageProps) {
  const { t } = useI18n()
  const initialDispatchDraft = useMemo(() => {
    const searchParams = new URL(window.location.href).searchParams
    return {
      projectId: searchParams.get('project')?.trim() ?? '',
      prompt: searchParams.get('prompt')?.trim() ?? '',
    }
  }, [])
  const jobs = useSyncExternalStore(subscribeDispatchJobs, getDispatchJobsSnapshot, getDispatchJobsSnapshot)
  const [focusedJobId] = useState(() => new URL(window.location.href).searchParams.get('jobId'))
  const [filter, setFilter] = useState<WorkFilter>('all')
  const [activePage, setActivePage] = useState<number | null>(null)
  const [historyPage, setHistoryPage] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [effortFilter, setEffortFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draftProviderFilter, setDraftProviderFilter] = useState('all')
  const [draftModelFilter, setDraftModelFilter] = useState('all')
  const [draftEffortFilter, setDraftEffortFilter] = useState('all')
  const [draftStatusFilter, setDraftStatusFilter] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteWarning, setDeleteWarning] = useState<{ kind: 'range' } | { kind: 'record'; record: TrackedDispatchJob } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [busyJobId, setBusyJobId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(Boolean(initialDispatchDraft.prompt))

  useEffect(() => { void loadTrackedDispatchJobs().catch((error) => setMessage(error instanceof Error ? error.message : t('aiWork.loadFailed'))) }, [t])
  useEffect(() => {
    if (!initialDispatchDraft.prompt) return
    const url = new URL(window.location.href)
    url.searchParams.delete('project')
    url.searchParams.delete('prompt')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [initialDispatchDraft.prompt])
  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => Date.parse(b.aiJob.createdAt || b.job.startedAt) - Date.parse(a.aiJob.createdAt || a.job.startedAt)), [jobs])
  const activeJobs = sortedJobs.filter(isActive)
  const historyJobs = sortedJobs.filter((record) => !isActive(record))
  const completedToday = historyJobs.filter((record) => { const date = new Date(record.aiJob.createdAt || record.job.startedAt); return date.toDateString() === new Date().toDateString() && outcome(record) === 'success' }).length
  const failedCount = historyJobs.filter((record) => outcome(record) === 'failed' || outcome(record) === 'unknown').length
  const providerOptions = ['all', ...new Set(sortedJobs.map((record) => providers.find((item) => item.id === record.job.providerId)?.name ?? record.job.providerId))]
  const modelOptions = ['all', ...new Set(sortedJobs.map((record) => record.modelId))]
  const effortOptions = ['all', ...new Set(sortedJobs.map((record) => record.effort))]
  const statusOptions = ['all', 'running', 'success', 'failed', 'unknown']
  const visibleJobs = sortedJobs.filter((record) => {
    const value = `${record.job.id} ${record.aiJob.summary} ${record.job.projectName} ${record.jiraTicketKey ?? ''}`.toLocaleLowerCase()
    return (filter === 'all' || (filter === 'active' && isActive(record)) || (filter === 'history' && !isActive(record))) && (!query.trim() || value.includes(query.trim().toLocaleLowerCase())) && (providerFilter === 'all' || (providers.find((item) => item.id === record.job.providerId)?.name ?? record.job.providerId) === providerFilter) && (modelFilter === 'all' || record.modelId === modelFilter) && (effortFilter === 'all' || record.effort === effortFilter) && (statusFilter === 'all' || outcome(record) === statusFilter)
  })
  const visibleActiveJobs = visibleJobs.filter(isActive)
  const visibleHistoryJobs = visibleJobs.filter((record) => !isActive(record))
  const activePages = Math.max(1, Math.ceil(visibleActiveJobs.length / JOBS_PER_PAGE))
  const historyPages = Math.max(1, Math.ceil(visibleHistoryJobs.length / JOBS_PER_PAGE))
  const targetActivePage = Math.floor(visibleActiveJobs.findIndex((record) => record.job.id === focusedJobId) / JOBS_PER_PAGE) + 1
  const targetHistoryPage = Math.floor(visibleHistoryJobs.findIndex((record) => record.job.id === focusedJobId) / JOBS_PER_PAGE) + 1
  const currentActivePage = Math.min(activePage ?? Math.max(1, targetActivePage), activePages)
  const currentHistoryPage = Math.min(historyPage ?? Math.max(1, targetHistoryPage), historyPages)
  const resetPages = () => { setActivePage(1); setHistoryPage(1) }
  const deleteRange = () => {
    if (!from || !to || from > to) return
    setDeleteDialogOpen(false)
    setDeleteWarning({ kind: 'range' })
  }
  const confirmDeleteRange = async () => {
    setDeleting(true)
    setMessage(null)
    try {
      const deleted = await deleteAiJobsByDateRange(from, to)
      removeTrackedDispatchJobsByDateRange(from, to)
      setMessage(t('aiWork.deletedJobs', { count: deleted }))
    } catch (error) { setMessage(error instanceof Error ? error.message : t('aiWork.deleteFailed')) } finally { setDeleting(false) }
  }
  const deleteJob = (record: TrackedDispatchJob) => setDeleteWarning({ kind: 'record', record })
  const confirmDeleteJob = async (record: TrackedDispatchJob) => {
    setBusyJobId(record.job.id)
    setMessage(null)
    try {
      await removeTrackedDispatchJob(record.job.id)
      setMessage(t('aiWork.deletedRecord'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('aiWork.deleteFailed'))
    } finally { setBusyJobId(null) }
  }
  const cancelDeleteWarning = () => setDeleteWarning(null)
  const cancelJob = async (record: TrackedDispatchJob) => {
    setBusyJobId(record.job.id)
    setMessage(null)
    try {
      await cancelTrackedDispatch(record.job.id)
      setMessage(t('common.cancelled'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('common.failedToCancelWork'))
    } finally { setBusyJobId(null) }
  }
  const confirmDeleteWarning = async () => { const pending = deleteWarning; setDeleteWarning(null); if (pending?.kind === 'range') await confirmDeleteRange(); else if (pending) await confirmDeleteJob(pending.record) }
  const retryJob = async (record: TrackedDispatchJob) => {
    const project = projects.find((item) => item.id === record.job.projectId)
    if (!project?.folderPath) { setMessage(t('aiWork.retryMissingProject')); return }
    setBusyJobId(record.job.id)
    setMessage(null)
    try {
      await startTrackedDispatch({
        taskType: record.taskType,
        projectId: record.job.projectId,
        providerId: record.job.providerId,
        modelId: record.modelId,
        effort: record.effort,
        projectPath: project.folderPath,
        projectName: record.job.projectName,
        branchName: record.branchName,
        prompt: record.aiJob.inputMarkdown,
        progressSourceFileLabel: record.progressSourceFileLabel,
        progressTodoId: record.progressTodoId,
        ...(record.jiraTicketKey ? { jiraTicketKey: record.jiraTicketKey, jiraTicketTitle: record.jiraTicketTitle } : {}),
      }, record.taskType === 'architecture' ? onSaveArchitectureAnalysis : undefined)
      setMessage(t('aiWork.retriedJob'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('aiWork.retryFailed'))
    } finally { setBusyJobId(null) }
  }
  const startNewJob = async (input: StartDispatchInput) => {
    await startTrackedDispatch(input)
    setDispatchDialogOpen(false)
    setMessage(t('aiWork.jobCreated'))
  }
  const metrics = [[t('aiWork.totalRuns'), sortedJobs.length], [t('aiWork.activeJobs'), activeJobs.length], [t('aiWork.queued'), activeJobs.filter((record) => record.job.status === 'queued').length], [t('aiWork.completedToday'), completedToday], [t('aiWork.failedCancelled'), failedCount]] as const
  const renderJobs = (records: TrackedDispatchJob[]) => records.length ? <div className="sd-ai-work__job-table">{records.map((record) => <JobRow key={record.job.id} record={record} focused={record.job.id === focusedJobId} providers={providers} busy={busyJobId === record.job.id} onCancel={(item) => void cancelJob(item)} onDelete={(item) => void deleteJob(item)} onRetry={(item) => void retryJob(item)} />)}</div> : <div className="sd-ai-work__empty"><h3>{t('aiWork.noJobs')}</h3><p>{t('aiWork.noJobsDescription')}</p></div>
  const filterOptions = (options: string[], allKey: string) => options.map((value) => ({ value, label: value === 'all' ? t(allKey) : value }))
  const statusFilterOptions = statusOptions.map((value) => ({ value, label: value === 'all' ? t('aiWork.allStatuses') : t(statusKey(value as JobOutcome)) }))
  const openFilterPanel = () => { setDraftProviderFilter(providerFilter); setDraftModelFilter(modelFilter); setDraftEffortFilter(effortFilter); setDraftStatusFilter(statusFilter); setFiltersOpen((value) => !value) }
  const applyFilters = () => { setProviderFilter(draftProviderFilter); setModelFilter(draftModelFilter); setEffortFilter(draftEffortFilter); setStatusFilter(draftStatusFilter); setFiltersOpen(false); resetPages() }
  const clearFilters = () => { setDraftProviderFilter('all'); setDraftModelFilter('all'); setDraftEffortFilter('all'); setDraftStatusFilter('all'); setProviderFilter('all'); setModelFilter('all'); setEffortFilter('all'); setStatusFilter('all'); resetPages() }
  const pagination = (section: string, page: number, pages: number, setPage: (page: number) => void) => pages > 1 ? <nav className="sd-ai-work__pagination" aria-label={t('aiWork.pagination', { section })}><button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>{t('common.previous')}</button><span>{t('aiWork.pageOf', { page, pages })}</span><button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>{t('common.next')}</button></nav> : null

  return <main className="sd-ai-work">
    <header className="sd-ai-work__page-head"><div><p className="sd-ai-work__eyebrow">{t('aiWork.eyebrow')} <span>• {t('aiWork.orchestratorPool')}</span></p><h1>{t('aiWork.title')}</h1><p>{t('aiWork.description')}</p></div><div className="sd-ai-work__top-status"><span>{t('aiWork.scheduler')}</span><StatusBadge label={t('aiWork.online')} tone="ok" /></div></header>
    <section className="sd-ai-work__stats" aria-label={t('aiWork.metrics')}>{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className="sd-ai-work__workspace" aria-label={t('aiWork.jobHistory')}>
      <div className="sd-ai-work__filter-bar"><input aria-label={t('aiWork.search')} value={query} onChange={(event) => { setQuery(event.target.value); resetPages() }} placeholder={t('aiWork.searchPlaceholder')} /><button type="button" className="sd-ai-work__filter-toggle" aria-expanded={filtersOpen} aria-controls="ai-work-filter-panel" onClick={openFilterPanel}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.25 7.1v5.15l-3.5 1.75V12.1L4 5Z" /></svg><span>{filtersOpen ? t('aiWork.closeFilters') : t('aiWork.openFilters')}</span></button></div>
      {filtersOpen ? <div id="ai-work-filter-panel" className="sd-ai-work__filter-panel" role="region" aria-label={t('aiWork.filterPanel')}><SelectFilter label={t('aiWork.providerFilter')} value={draftProviderFilter} options={filterOptions(providerOptions, 'aiWork.allProviders')} onChange={setDraftProviderFilter} /><SelectFilter label={t('aiWork.modelFilter')} value={draftModelFilter} options={filterOptions(modelOptions, 'aiWork.allModels')} onChange={setDraftModelFilter} /><SelectFilter label={t('aiWork.effortFilter')} value={draftEffortFilter} options={filterOptions(effortOptions, 'aiWork.allEfforts')} onChange={setDraftEffortFilter} /><SelectFilter label={t('aiWork.statusFilter')} value={draftStatusFilter} options={statusFilterOptions} onChange={setDraftStatusFilter} /><div className="sd-ai-work__filter-actions"><button type="button" onClick={clearFilters}>{t('aiWork.clearFilters')}</button><button type="button" className="is-primary" onClick={applyFilters}>{t('aiWork.applyFilters')}</button></div></div> : null}
      <div className="sd-ai-work__toolbar"><div className="sd-ai-work__filters" role="group" aria-label={t('aiWork.filters')}>{([['all', t('aiWork.allJobs')], ['active', t('aiWork.activeJobs')], ['history', t('aiWork.history')]] as const).map(([value, label]) => <button key={value} type="button" className={filter === value ? 'is-active' : ''} onClick={() => { setFilter(value); resetPages() }}>{label} <span>{value === 'all' ? sortedJobs.length : value === 'active' ? activeJobs.length : historyJobs.length}</span></button>)}</div><div className="sd-ai-work__toolbar-actions"><button type="button" className="sd-ai-work__delete-log" onClick={() => setDeleteDialogOpen(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14m-9 0V5h4v2m-7 0 1 13h8l1-13M10 11v5m4-5v5" /></svg><span>{t('aiWork.deleteHistory')}</span></button><button type="button" className="sd-ai-work__dispatch-button" onClick={() => setDispatchDialogOpen(true)}>{t('aiWork.dispatchNewJob')}</button></div></div>
      {deleteDialogOpen ? <div className="sd-ai-work__dialog-backdrop"><section className="sd-ai-work__dialog" role="dialog" aria-modal="true" aria-labelledby="ai-work-delete-dialog-title"><div className="sd-ai-work__dialog-head"><h2 id="ai-work-delete-dialog-title">{t('aiWork.deleteHistory')}</h2><p>{t('aiWork.deleteRangeDescription')}</p></div><div className="sd-ai-work__dialog-body"><div className="sd-ai-work__dialog-fields"><label>{t('aiWork.from')}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>{t('aiWork.to')}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label></div><div className="sd-ai-work__dialog-actions"><button type="button" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>{t('common.cancel')}</button><button type="button" className="is-danger" disabled={deleting || !from || !to || from > to} onClick={deleteRange}>{deleting ? t('common.saving') : t('aiWork.confirmDeleteRange')}</button></div></div></section></div> : null}
      {deleteWarning ? <div className="sd-ai-work__dialog-backdrop"><section className="sd-ai-work__dialog" role="alertdialog" aria-modal="true" aria-labelledby="ai-work-delete-warning-title"><div className="sd-ai-work__dialog-head"><h2 id="ai-work-delete-warning-title">{t('aiWork.deleteHistory')}</h2><p>{deleteWarning.kind === 'range' ? t('aiWork.deleteRangeWarning') : t('aiWork.confirmDeleteRecord')}</p></div><div className="sd-ai-work__dialog-body"><div className="sd-ai-work__dialog-actions"><button type="button" onClick={cancelDeleteWarning} disabled={deleting || busyJobId !== null}>{t('common.cancel')}</button><button type="button" className="is-danger" onClick={() => void confirmDeleteWarning()} disabled={deleting || busyJobId !== null}>{t('aiWork.confirmDeleteRange')}</button></div></div></section></div> : null}
      {dispatchDialogOpen ? <DispatchJobDialog providers={providers} projects={projects} initialProjectId={initialDispatchDraft.projectId} initialPrompt={initialDispatchDraft.prompt} onClose={() => setDispatchDialogOpen(false)} onStart={startNewJob} /> : null}
      {message ? <p className="sd-ai-work__message" role="status">{message}</p> : null}
      <details className="sd-ai-work__section" open><summary className="sd-ai-work__section-title"><h2>{t('aiWork.activeRunningJobs')} <span>{activeJobs.length}</span></h2></summary>{filter !== 'history' ? <div className="sd-ai-work__section-body"><div className="sd-ai-work__table-head"><span>{t('aiWork.taskExecutionName')}</span><span>{t('aiWork.providerModelEffort')}</span><span>{t('aiWork.startedElapsed')}</span><span>{t('aiWork.statusOutcome')}</span><span>{t('aiWork.actions')}</span></div>{renderJobs(visibleActiveJobs.slice((currentActivePage - 1) * JOBS_PER_PAGE, currentActivePage * JOBS_PER_PAGE))}{pagination(t('aiWork.activeRunningJobs'), currentActivePage, activePages, setActivePage)}</div> : null}</details>
      <details className="sd-ai-work__section" open><summary className="sd-ai-work__section-title"><h2>{t('aiWork.completedHistoricalJobs')} <span>{historyJobs.length}</span></h2></summary>{filter !== 'active' ? <div className="sd-ai-work__section-body"><div className="sd-ai-work__table-head"><span>{t('aiWork.taskExecutionName')}</span><span>{t('aiWork.providerModelEffort')}</span><span>{t('aiWork.finishedDuration')}</span><span>{t('aiWork.statusOutcome')}</span><span>{t('aiWork.actions')}</span></div>{renderJobs(visibleHistoryJobs.slice((currentHistoryPage - 1) * JOBS_PER_PAGE, currentHistoryPage * JOBS_PER_PAGE))}{pagination(t('aiWork.completedHistoricalJobs'), currentHistoryPage, historyPages, setHistoryPage)}</div> : null}</details>
    </section>
  </main>
}
