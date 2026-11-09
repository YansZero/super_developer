import { Fragment, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { PromptImageAttachments, handlePromptImagePaste } from '../../../shared/components/PromptImageAttachments'
import type { JiraTicketSummary, ProjectItem, ProviderId, ProviderSummary, SettingsTabId } from '../../../shared/types/domain'
import type { DispatchJob, ImageAttachment } from './dispatchClient'
import type { ProviderModelOption } from './providerModelClient'
import type { ProviderModelSelection } from './hooks/useProviderModelSelection'
import { useI18n } from '../../../shared/i18n'
import { getProviderStatusKey } from '../../../shared/providers/providerPresentation'
import { defaultJiraPromptTemplate, fillJiraPromptTemplate } from './jiraPromptTemplate'

type JiraFilter = 'ALL' | JiraTicketSummary['status']

function jiraStatusLabel(ticket: JiraTicketSummary) {
  if (ticket.statusName?.trim()) return ticket.statusName
  if (ticket.status === 'TODO') return '待處理'
  if (ticket.status === 'IN_PROGRESS') return 'In progress'
  return '已完成'
}

function jiraStatusClass(ticket: JiraTicketSummary) {
  const status = jiraStatusLabel(ticket).trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (status === 'qa') return 'qa'
  if (status === 'inprogress') return 'in-progress'
  if (status === 'done' || status === 'completed') return 'done'
  if (status === 'todo' || status === 'pending') return 'pending'
  return ticket.status === 'DONE' ? 'done' : ticket.status === 'IN_PROGRESS' ? 'in-progress' : 'default'
}

function jiraPriorityLabel(priority: JiraTicketSummary['priority']) {
  return priority === 'HIGH' ? 'High' : priority === 'MEDIUM' ? 'Medium' : 'Low'
}

interface Props {
  project: ProjectItem
  providers: ProviderSummary[]
  jiraFilter: JiraFilter
  setJiraFilter: (filter: JiraFilter) => void
  jiraKeyword: string
  setJiraKeyword: (keyword: string) => void
  visibleTickets: JiraTicketSummary[]
  todoCount: number
  inProgressCount: number
  doneCount: number
  analyzingTicketKey: string | null
  prepareTicketAnalysis: (ticket: JiraTicketSummary, templateFile?: string) => void
  jiraTaskSourceLabel: string
  jiraTaskTicketKey: string | null
  jiraTaskTicketTitle: string
  jiraTaskTicketDescription: string
  failedTicketKey: string | null
  jiraAnalysisError: string | null
  jiraModelSelection: ProviderModelSelection
  jiraCatalogCurrent: boolean
  jiraEffortOptions: string[]
  jiraPromptText: string
  setJiraPromptText: (prompt: string) => void
  imageAttachments?: ImageAttachment[]
  setImageAttachments?: (attachments: ImageAttachment[]) => void
  onAttachmentError?: (message: string | null) => void
  jiraDispatchError: string | null
  jiraDispatchJob: DispatchJob | null
  stopDispatch: (jobId: string, taskType: 'jira' | 'architecture') => Promise<void>
  jiraProviderSupportsDispatch: boolean
  jiraDispatchStarting: boolean
  jiraDispatchRunning: boolean
  onRequestDispatch: () => void
  onOpenSettingsTab: (tab: SettingsTabId) => void
}

export function ProjectDetailJiraWorkbench({
  project, providers, jiraFilter, setJiraFilter, jiraKeyword, setJiraKeyword, visibleTickets,
  todoCount, inProgressCount, doneCount, analyzingTicketKey, prepareTicketAnalysis,
  jiraTaskSourceLabel, jiraTaskTicketKey, jiraTaskTicketTitle, jiraTaskTicketDescription, failedTicketKey, jiraAnalysisError, jiraModelSelection, jiraCatalogCurrent,
  jiraEffortOptions, jiraPromptText, setJiraPromptText, imageAttachments = [], setImageAttachments, onAttachmentError, jiraDispatchError, jiraDispatchJob,
  stopDispatch, jiraProviderSupportsDispatch, jiraDispatchStarting, jiraDispatchRunning,
  onRequestDispatch, onOpenSettingsTab,
}: Props) {
  const { t, locale } = useI18n()
  const handlePromptPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!setImageAttachments) return
    handlePromptImagePaste(event, {
      current: imageAttachments,
      onChange: (next) => {
        onAttachmentError?.(null)
        setImageAttachments(next)
      },
      onError: (msg) => onAttachmentError?.(msg),
      messages: {
        tooLarge: t('aiWork.imageAttachmentTooLarge'),
        maxCount: t('aiWork.imageAttachmentMaxCount'),
      },
    })
  }
  const [expandedTicketKey, setExpandedTicketKey] = useState<string | null>(() => new URL(window.location.href).searchParams.get('code')?.trim().toUpperCase() || null)
  const [promptTemplates, setPromptTemplates] = useState<string[]>([])
  const [templateSelection, setTemplateSelection] = useState({ locale, file: defaultJiraPromptTemplate(locale) })
  const selectedPromptTemplate = templateSelection.locale === locale ? templateSelection.file : defaultJiraPromptTemplate(locale)
  const [promptTemplateLoading, setPromptTemplateLoading] = useState(false)
  const [promptTemplateError, setPromptTemplateError] = useState<string | null>(null)
  const [hiddenJobId, setHiddenJobId] = useState<string | null>(null)
  const autoLoadedTicketRef = useRef<string | null>(null)

  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get('code')?.trim().toUpperCase() || null
    if (!code || autoLoadedTicketRef.current === `${project.id}:${code}`) return
    const ticket = project.jira.tickets.find((item) => item.key.toUpperCase() === code)
    if (!ticket) return
    autoLoadedTicketRef.current = `${project.id}:${code}`
    void prepareTicketAnalysis(ticket)
  }, [project.id, project.jira.tickets, prepareTicketAnalysis])

  const updateTicketRoute = (ticketKey: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('code', ticketKey)
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }

  const toggleTicket = (ticket: JiraTicketSummary) => {
    const nextKey = expandedTicketKey === ticket.key ? null : ticket.key
    setExpandedTicketKey(nextKey)
    if (!nextKey) return
    updateTicketRoute(ticket.key)
    setHiddenJobId(jiraDispatchJob?.id ?? null)
    void prepareTicketAnalysis(ticket, selectedPromptTemplate)
  }

  const loadTicket = (ticket: JiraTicketSummary) => {
    setExpandedTicketKey(ticket.key)
    updateTicketRoute(ticket.key)
    setHiddenJobId(jiraDispatchJob?.id ?? null)
    void prepareTicketAnalysis(ticket, selectedPromptTemplate)
  }

  useEffect(() => {
    let active = true
    const loadTemplates = async () => {
      setPromptTemplateLoading(true)
      try {
      const response = await fetch('/api/prompts')
      const data = await response.json() as { ok?: boolean; files?: unknown; message?: string }
      if (!response.ok || !data.ok || !Array.isArray(data.files)) throw new Error(data.message || t('common.promptTemplateLoadFailed'))
      if (active) setPromptTemplates(data.files.filter((file): file is string => typeof file === 'string'))
    } catch (error) {
      if (active) setPromptTemplateError(error instanceof SyntaxError ? t('common.promptTemplateLoadFailed') : error instanceof Error ? error.message : t('common.promptTemplateLoadFailed'))
    } finally {
      if (active) setPromptTemplateLoading(false)
    }
    }
    void loadTemplates()
    return () => { active = false }
  }, [locale]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyPromptTemplate = async (file: string) => {
    if (!file) return
    setPromptTemplateLoading(true)
    setPromptTemplateError(null)
    try {
      const response = await fetch(`/api/prompts/${encodeURIComponent(file)}`)
      const data = await response.json() as { ok?: boolean; content?: unknown; message?: string }
      if (!response.ok || !data.ok || typeof data.content !== 'string') throw new Error(data.message || t('common.promptTemplateLoadFailed'))
      const content = jiraTaskTicketKey && jiraTaskTicketDescription ? `${jiraTaskTicketKey} - ${jiraTaskTicketTitle}\n\n${jiraTaskTicketDescription}` : ''
      setJiraPromptText(fillJiraPromptTemplate(data.content, content))
      setHiddenJobId(jiraDispatchJob?.id ?? null)
    } catch (error) {
      setPromptTemplateError(error instanceof SyntaxError ? t('common.promptTemplateLoadFailed') : error instanceof Error ? error.message : t('common.promptTemplateLoadFailed'))
    } finally {
      setPromptTemplateLoading(false)
    }
  }

  return (
<section className="sd-detail__section" aria-label={t('common.jiraTasksAndAiDispatch')}>
          <header className="sd-detail__section-head">
            <div>
              <h2 className="sd-detail__section-title">{t('common.jiraTasksAndAiAgentDispatch')}</h2>
              <p className="sd-detail__section-sub">{t('common.onlyJiraTicketsAssignedToThisProjectAreShownSelectATaskToLoadItsLatestDescriptionReviewThePromptAndChooseAProviderModelAndEffortBeforeDispatching')}</p>
            </div>
            <button type="button" className="sd-detail__mini-btn sd-detail__jira-settings-btn" onClick={() => onOpenSettingsTab('jira')}>Jira {t('common.settings')}</button>
          </header>

          <div className="sd-detail__analysis-workspace sd-detail__jira-analysis-workspace">
            <section className="sd-detail__pane sd-detail__pane--jira" aria-labelledby="sd-jira-select-task-title">
              <header className="sd-detail__jira-pane-head">
                <div className="sd-detail__jira-pane-title">
                  <span className="sd-detail__jira-step-number" aria-hidden="true">1</span>
                  <h3 id="sd-jira-select-task-title" className="sd-detail__subhead">{t('common.chooseATaskToDispatch')}</h3>
                </div>
                <p className="sd-detail__section-sub">{t('common.selectAJiraTaskToLoadItsDetailsAndPrepareAnAiAgentDispatch')}</p>
              </header>
              <div className="sd-detail__jira-toolbar">
                <div className="sd-detail__jira-pills" role="group" aria-label={t('common.jiraStatusQuickFilter')}>
                  {([
                    ['ALL', `${t('common.all')} (${project.jira.tickets.length})`],
                    ['TODO', `${t('common.toDoAlt')} (${todoCount})`],
                    ['IN_PROGRESS', `${t('common.inProgress')} (${inProgressCount})`],
                    ['DONE', `${t('common.complete')} (${doneCount})`],
                  ] as const).map(([filter, label]) => (
                    <button key={filter} type="button" className={`sd-detail__filter-pill ${jiraFilter === filter ? 'sd-detail__filter-pill--active' : ''}`} onClick={() => setJiraFilter(filter)}>{label}</button>
                  ))}
                </div>
                <input type="search" className="sd-detail__search-input" placeholder={t('common.searchJiraTasksAlt')} value={jiraKeyword} onChange={(event) => setJiraKeyword(event.target.value)} aria-label={t('common.searchJiraTasks')} />
              </div>

              {project.jira.tickets.length > 0 ? (
                <div className="sd-detail__table-wrap">
                  <table className="sd-detail__jira-table">
                    <thead><tr><th>{t('common.taskKey')}</th><th>{t('common.taskType')}</th><th>{t('common.priority')}</th><th>{t('common.taskName')}</th><th>{t('common.currentStatus')}</th><th>{t('common.actions')}</th></tr></thead>
                    <tbody>
                      {visibleTickets.map((ticket) => {
                        const isExpanded = expandedTicketKey === ticket.key
                        const hasLoadedDescription = jiraTaskTicketKey === ticket.key && jiraTaskTicketDescription.trim().length > 0
                        return (
                          <Fragment key={ticket.key}>
                            <tr className={isExpanded ? 'sd-detail__jira-row--expanded' : undefined}>
                              <td className="sd-detail__td-key"><button type="button" className="sd-detail__issue-key-button" onClick={() => toggleTicket(ticket)} aria-expanded={isExpanded}>{ticket.key}</button></td>
                              <td><span className={`sd-detail__ticket-type sd-detail__ticket-type--${(ticket.issueType || 'Task').toLowerCase()}`}>{ticket.issueType || 'Task'}</span></td>
                              <td><span className={`sd-detail__priority sd-detail__priority--${ticket.priority.toLowerCase()}`}>{jiraPriorityLabel(ticket.priority)}</span></td>
                              <td><strong className="sd-detail__ticket-title">{ticket.title}</strong></td>
                              <td><span className={`sd-detail__ticket-status sd-detail__ticket-status--${jiraStatusClass(ticket)}`}>{jiraStatusLabel(ticket)}</span></td>
                              <td>
                                <div className="sd-detail__jira-actions">
                                  <button type="button" className="sd-detail__jira-detail-btn" aria-expanded={isExpanded} onClick={() => toggleTicket(ticket)}>{t('common.taskDetailsAlt')}</button>
                                  <button type="button" className="sd-detail__dispatch-btn" disabled={analyzingTicketKey !== null} onClick={() => loadTicket(ticket)}>{analyzingTicketKey === ticket.key ? t('common.loadTicket') : jiraTaskSourceLabel === `Jira Ticket ${ticket.key}` ? t('common.thisTicketIsLoaded') : t('common.loadAndPrepareAiDispatch')}</button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="sd-detail__jira-detail-row">
                                <td colSpan={6}>
                                  <div className="sd-detail__jira-detail">
                                    <strong>{t('common.taskDetails')}</strong>
                                    {analyzingTicketKey === ticket.key ? <p role="status">{t('common.loadingJiraDescription')}</p> : null}
                                    {hasLoadedDescription ? <p className="sd-detail__jira-description">{jiraTaskTicketDescription}</p> : null}
                                    {jiraAnalysisError && failedTicketKey === ticket.key ? <p className="sd-detail__jira-card-error" role="alert">{jiraAnalysisError}</p> : null}
                                    {!analyzingTicketKey && !hasLoadedDescription && !(jiraAnalysisError && failedTicketKey === ticket.key) ? <p className="sd-detail__jira-description">{t('common.jiraDescriptionIsNotLoadedClickLoadAndPrepareAiDispatch')}</p> : null}
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })}
                      {visibleTickets.length === 0 ? <tr><td colSpan={6} className="sd-detail__jira-empty">{t('common.noMatchingJiraTicketsAreAssignedToThisProject')}</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sd-detail__missing-card">
                  <strong>{t('common.noJiraTasksAssigned')}</strong>
                  <p>{t('common.assignTicketsInJiraWorkCenter')}</p>
                </div>
              )}
            </section>

            <section className="sd-detail__pane" aria-labelledby="sd-jira-dispatch-title">
              <header className="sd-detail__jira-pane-head">
                <div className="sd-detail__jira-pane-title">
                  <span className="sd-detail__jira-step-number" aria-hidden="true">2</span>
                <h3 id="sd-jira-dispatch-title" className="sd-detail__subhead">{t('common.runAiAgentDispatch')}</h3>
                </div>
                <p className="sd-detail__section-sub">{t('common.configureTheProviderModelAndEffortThenConfirmToStartDispatch')}</p>
              </header>
              <p className="sd-detail__section-sub">{jiraTaskSourceLabel.startsWith('Jira Ticket') ? `${t('common.loaded')}${jiraTaskSourceLabel}` : t('common.selectAJiraTicketOnTheLeftOrEditTheTaskContentManually')}</p>
              <div className="sd-detail__dispatch-form">
                <label className="sd-detail__field-label" htmlFor="sd-jira-provider">AI Provider：</label>
                <select id="sd-jira-provider" className="sd-detail__select" value={jiraModelSelection.selectedProviderId} onChange={(event) => { jiraModelSelection.setSelectedProviderId(event.target.value as ProviderId); jiraModelSelection.setSelectedModelId('default'); jiraModelSelection.setSelectedEffort('default'); jiraModelSelection.setProviderModelLoading(true) }}>
                  {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} — {getProviderStatusKey(provider) ? t(getProviderStatusKey(provider)!, { version: provider.version ?? '' }) : t(provider.statusText)}</option>)}
                </select>
                <div className="sd-detail__model-controls">
                  <label className="sd-detail__field-label" htmlFor="sd-jira-model">Model：
                    <select id="sd-jira-model" className="sd-detail__select" value={jiraModelSelection.selectedModelId} disabled={jiraModelSelection.providerModelLoading || !jiraCatalogCurrent} onChange={(event) => { const model = jiraModelSelection.providerModelCatalog.models.find((item) => item.id === event.target.value); jiraModelSelection.setSelectedModelId(event.target.value); jiraModelSelection.setSelectedEffort(model?.efforts.includes('medium') ? 'medium' : model?.efforts[0] ?? 'default') }}>
                      {jiraModelSelection.providerModelCatalog.models.map((model: ProviderModelOption) => <option key={model.id} value={model.id}>{t(model.label)}</option>)}
                    </select>
                  </label>
                  <label className="sd-detail__field-label" htmlFor="sd-jira-effort">Effort：
                    <select id="sd-jira-effort" className="sd-detail__select" value={jiraModelSelection.selectedEffort} disabled={jiraModelSelection.selectedModelId === 'default' || jiraEffortOptions.length === 0} onChange={(event) => jiraModelSelection.setSelectedEffort(event.target.value)}>
                      {jiraModelSelection.selectedModelId === 'default' || jiraEffortOptions.length === 0 ? <option value="default">{t('common.cliDefault')}</option> : jiraEffortOptions.map((effort) => <option key={effort} value={effort}>{effort}</option>)}
                    </select>
                  </label>
                </div>
                <p className="sd-detail__model-note" role="status">{jiraModelSelection.providerModelLoading || !jiraCatalogCurrent ? t('common.loadingAvailableModelsForThisProvider') : jiraModelSelection.providerModelError ?? jiraModelSelection.providerModelCatalog.message}</p>
                <div className="sd-detail__prompt-template-bar">
                  <button type="button" className="sd-detail__mini-btn sd-detail__jira-action-btn" onClick={() => void applyPromptTemplate(selectedPromptTemplate)} disabled={promptTemplateLoading || !promptTemplates.includes(selectedPromptTemplate)}>{t('common.applyTemplate')}</button>
                  <select className="sd-detail__select" aria-label={t('common.promptTemplate')} value={selectedPromptTemplate} disabled={promptTemplateLoading || promptTemplates.length === 0} onChange={(event) => setTemplateSelection({ locale, file: event.target.value })}>
                    <option value="">{promptTemplateLoading ? t('common.loading') : promptTemplates.length === 0 ? t('common.noPromptTemplates') : t('common.selectPromptTemplate')}</option>
                    {promptTemplates.map((file) => <option key={file} value={file}>{file}</option>)}
                  </select>
                  {promptTemplateError ? <span className="sd-detail__prompt-template-status" role="alert">{promptTemplateError}</span> : null}
                </div>
                <label className="sd-detail__field-label" htmlFor="sd-jira-prompt">{t('common.dispatchTaskContent')}</label>
                <textarea id="sd-jira-prompt" className="sd-detail__textarea" rows={8} value={jiraPromptText} onChange={(event) => setJiraPromptText(event.target.value)} onPaste={handlePromptPaste} placeholder={t('common.selectAJiraTicketOnTheLeftToLoadItsDescriptionOrEnterDispatchContent')} />
                <PromptImageAttachments
                  attachments={imageAttachments}
                  onRemove={(index) => setImageAttachments?.(imageAttachments.filter((_, i) => i !== index))}
                  disabled={jiraDispatchStarting || jiraDispatchRunning}
                />
              </div>
              {jiraDispatchError ? <div className="sd-detail__dispatch-error" role="alert">{jiraDispatchError}</div> : null}
              {jiraDispatchJob && jiraDispatchJob.id !== hiddenJobId ? <section className="sd-detail__dispatch-job" aria-label={t('common.aiDispatchExecutionStatus')}><div className="sd-detail__dispatch-job-head"><strong>{t('common.dispatchStatus')}{t(({ queued: 'common.queued', running: 'common.runningAlt', succeeded: 'common.completed', failed: 'common.failed', cancelled: 'common.cancelled', timed_out: 'common.timedOut' } as Record<string, string>)[jiraDispatchJob.status] ?? jiraDispatchJob.status)}</strong><div>{['queued', 'running'].includes(jiraDispatchJob.status) ? <button type="button" className="sd-detail__mini-btn" onClick={() => void stopDispatch(jiraDispatchJob.id, 'jira')}>{t('common.cancelDispatch')}</button> : null}<button type="button" className="sd-detail__mini-btn" onClick={() => setHiddenJobId(jiraDispatchJob.id)}>{t('common.clearLog')}</button></div></div>{jiraDispatchJob.error ? <p className="sd-detail__dispatch-error">{jiraDispatchJob.error}</p> : null}{jiraDispatchJob.artifactPath ? <p className="sd-detail__spec-saved-path" role="status">{t('common.analysisResultSavedTo')}{jiraDispatchJob.artifactPath}{t('common.specViewerUpdated')}</p> : null}<pre className="sd-detail__dispatch-output">{jiraDispatchJob.output || t('common.waitingForDispatchResults')}</pre></section> : null}
              <div className="sd-detail__preview-actions">
                <button type="button" className="sd-detail__mini-btn sd-detail__jira-action-btn" disabled={!jiraPromptText.trim() || !project.folderPath || !jiraProviderSupportsDispatch || jiraDispatchStarting || jiraDispatchRunning || jiraModelSelection.providerModelLoading || !jiraCatalogCurrent} onClick={onRequestDispatch}>{t('common.confirmAndStartAiDispatch')}</button>
                {!jiraProviderSupportsDispatch ? <span className="sd-detail__model-note">{t('common.thisProviderDoesNotProvideASupportedFixedCliExecutionMethod')}</span> : null}
              </div>
            </section>
          </div>
        </section>
  )
}
