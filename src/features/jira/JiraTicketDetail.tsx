import { useEffect, useMemo, useState } from 'react'
import { JiraError, jiraFailure, jiraMessages } from './jiraContracts'
import type { JiraService, JiraTicket } from './jiraContracts'
import { formatJiraDate } from './formatJiraDate'
import { jiraTicketPriorityTone, jiraTicketStatusTone, jiraTicketTypeTone } from './jiraTicketPresentation'
import { jiraTicketValueKey } from './jiraTicketLabel'
import type { ProjectItem } from '../../shared/types/domain'
import { useI18n } from '../../shared/i18n'

function initials(name: string | undefined) {
  if (!name) return '—'
  return name.trim().slice(0, 1).toLocaleUpperCase()
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type TicketAssignment = Pick<ProjectItem, 'id' | 'name'>

interface JiraTicketDetailProps {
  service: JiraService
  userId: string
  cloudId: string
  ticketKey: string
  onBack: () => void
  projects?: ProjectItem[]
  assignedProject?: TicketAssignment
  onAssignTicket?: (projectId: string, ticket: JiraTicket | null, ticketKey?: string) => Promise<ProjectItem>
  onOpenAssignmentPage?: () => void
}

export function JiraTicketDetail({ service, userId, cloudId, ticketKey, onBack, projects = [], assignedProject, onAssignTicket, onOpenAssignmentPage }: JiraTicketDetailProps) {
  const { t } = useI18n()
  const [result, setResult] = useState<{ ticket: JiraTicket | null; error: JiraError | null }>({ ticket: null, error: null })
  const [assignmentOverride, setAssignmentOverride] = useState<TicketAssignment | null | undefined>(undefined)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [assignmentSearch, setAssignmentSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const before = await service.profile(controller.signal)
        if (before.id !== userId || before.selectedCloudId !== cloudId) throw new JiraError('AUTH_REQUIRED')
        const ticket = await service.detail(cloudId, ticketKey, controller.signal)
        const after = await service.profile(controller.signal)
        if (after.id !== userId || after.selectedCloudId !== cloudId) throw new JiraError('AUTH_REQUIRED')
        if (!controller.signal.aborted) setResult({ ticket, error: null })
      } catch (error) { if (!controller.signal.aborted) setResult({ ticket: null, error: jiraFailure(error) }) }
    }
    void load(); return () => controller.abort()
  }, [service, userId, cloudId, ticketKey])
  const ticket = result.ticket
  const currentAssignment = assignmentOverride === undefined ? assignedProject : assignmentOverride
  const filteredProjects = useMemo(() => {
    const search = assignmentSearch.trim().toLocaleLowerCase()
    if (!search) return projects
    return projects.filter((project) => `${project.name} ${project.folderDisplayName}`.toLocaleLowerCase().includes(search))
  }, [assignmentSearch, projects])
  const statusTone = ticket ? jiraTicketStatusTone(ticket.status) : 'pending'
  const priorityTone = ticket ? jiraTicketPriorityTone(ticket.priority) : 'other'
  const typeTone = ticket ? jiraTicketTypeTone(ticket.issueType) : 'other'
  const assignmentLocked = statusTone === 'done' || statusTone === 'discard'
  function openAssignmentPicker() {
    setAssignmentSearch('')
    setSelectedProjectId(currentAssignment?.id ?? '')
    setAssignmentError('')
    setAssignmentOpen(true)
  }
  async function saveAssignment() {
    if (!ticket || !onAssignTicket) return
    const project = projects.find((item) => item.id === selectedProjectId)
    if (!project) {
      setAssignmentError(t('common.selectAProject'))
      return
    }
    setAssignmentSaving(true)
    setAssignmentError('')
    try {
      await onAssignTicket(project.id, ticket)
      setAssignmentOverride({ id: project.id, name: project.name })
      setAssignmentOpen(false)
    } catch (cause) {
      setAssignmentError(cause instanceof Error ? cause.message : t('common.failedToSaveDispatch'))
    } finally {
      setAssignmentSaving(false)
    }
  }
  async function removeAssignment() {
    if (!ticket || !currentAssignment || !onAssignTicket) return
    setAssignmentSaving(true)
    setAssignmentError('')
    try {
      await onAssignTicket(currentAssignment.id, null, ticket.key)
      setAssignmentOverride(null)
    } catch (cause) {
      setAssignmentError(cause instanceof Error ? cause.message : t('common.failedToRemoveDispatch'))
    } finally {
      setAssignmentSaving(false)
    }
  }
  return <section className="sd-jira-workbench__detail" aria-label={t('common.jiraTaskDetails')}>
    {result.error ? <p role="alert">{t(jiraMessages[result.error.code])}</p> : !ticket ? <p role="status">{t('common.loadingTaskDetails')}</p> : <>
      <section className="sd-jira-workbench__detail-board">
        <nav className="sd-jira-workbench__detail-toolbar" aria-label={t('common.taskNavigation')}>
          <div className="sd-jira-workbench__detail-heading"><h2>{t('common.taskDetails2')}</h2><p>{t('common.reviewJiraTaskContentCurrentStatusAndLocalProjectDispatch')}</p></div>
          <button type="button" className="sd-jira-workbench__back" onClick={onBack}>← {t('common.backToTaskList')}</button>
        </nav>
        <div className="sd-jira-workbench__detail-body">
      <div className="sd-jira-workbench__detail-hero">
        <header className="sd-jira-workbench__detail-hero-main">
          <div className="sd-jira-workbench__detail-tags"><strong>{ticket.key}</strong></div>
          <div className="sd-jira-workbench__detail-hero-divider" />
          <div className="sd-jira-workbench__detail-field-grid">
            <div className="sd-jira-workbench__detail-field"><span>{t('common.taskType')}</span><strong><span className={`sd-jira-workbench__ticket-type sd-jira-workbench__ticket-type--${typeTone}`}>{t(jiraTicketValueKey(ticket.issueType))}</span></strong></div>
            <div className="sd-jira-workbench__detail-field"><span>{t('common.priority')}</span><strong><span className={`sd-jira-workbench__ticket-priority sd-jira-workbench__ticket-priority--${priorityTone}`}>{t(jiraTicketValueKey(ticket.priority))}</span></strong></div>
            <div className="sd-jira-workbench__detail-field"><span>{t('common.currentStatus')}</span><strong><span className={`sd-jira-workbench__ticket-status sd-jira-workbench__ticket-status--${statusTone}`}>{t(jiraTicketValueKey(ticket.status.name))}</span></strong></div>
            <div className="sd-jira-workbench__detail-field sd-jira-workbench__detail-field--title"><span>{t('common.taskTitle')}</span><h2>{ticket.summary}</h2></div>
          </div>
        </header>
        <aside className="sd-jira-workbench__detail-assignment" aria-label={t('common.dispatchProjectDetails')}>
          <h3>{t('common.dispatchProjectDetails')}</h3>
          <div className="sd-jira-workbench__detail-assignment-project"><span>{t('common.projectName')}</span><strong>{currentAssignment?.name ?? t('common.notDispatched')}</strong></div>
          <div className="sd-jira-workbench__detail-assignment-operations">
            <span>{t('common.actions')}</span>
            <div className="sd-jira-workbench__detail-assignment-actions">
              {assignmentLocked ? <p className="sd-jira-workbench__detail-assignment-locked">{t('common.completedOrCancelledTasksDoNotNeedDispatch')}</p> : <>
                {onAssignTicket ? currentAssignment ? <>
                  <button type="button" onClick={openAssignmentPicker} disabled={assignmentSaving}>{t('common.editDispatch')}</button>
                  <button type="button" className="sd-jira-workbench__detail-assignment-remove" onClick={() => void removeAssignment()} disabled={assignmentSaving}>{t('common.removeDispatch')}</button>
                </> : <button type="button" className="sd-jira-workbench__ticket-assignment-action" onClick={openAssignmentPicker} disabled={assignmentSaving}>{t('common.dispatchMe')}</button> : null}
                {currentAssignment && onOpenAssignmentPage ? <button type="button" onClick={onOpenAssignmentPage}>{t('common.viewDispatchDetails')}</button> : null}
              </>}
            </div>
          </div>
          {assignmentError && !assignmentOpen ? <span className="sd-jira-workbench__detail-assignment-error" role="alert">{assignmentError}</span> : null}
        </aside>
      </div>
      <div className="sd-jira-workbench__detail-layout">
        <div className="sd-jira-workbench__detail-main">
          <section className="sd-jira-workbench__detail-section" aria-label={t('common.taskDescription')}>
            <h3><span aria-hidden="true">▤</span> {t('common.description')} (DESCRIPTION)</h3>
            <div className="sd-jira-workbench__description"><p>{ticket.description || t('common.noDescription')}</p></div>
          </section>
          <section className="sd-jira-workbench__detail-section" aria-label={t('common.attachmentsAndImages')}>
            <h3><span aria-hidden="true">♧</span> {t('common.attachmentsAndImages')} (ATTACHMENTS &amp; IMAGES)</h3>
            {ticket.attachments?.length ? <ul className="sd-jira-workbench__attachments">{ticket.attachments.map((attachment) => <li key={attachment.id}><span aria-hidden="true">▧</span><span><strong>{attachment.filename}</strong><small>{attachment.mimeType || t('common.attachment')} · {fileSize(attachment.size)}</small></span></li>)}</ul> : <p className="sd-jira-workbench__placeholder">{t('common.noAttachmentsOrImages')}</p>}
          </section>
          <section className="sd-jira-workbench__detail-section sd-jira-workbench__comments" aria-label={t('common.latestComments')}>
            <h3><span aria-hidden="true">▱</span> {t('common.commentHistory')} (COMMENTS)</h3>
            {ticket.comments?.length ? <ol>{ticket.comments.slice(0, 3).map((comment) => <li key={comment.id}>
              <header><span className="sd-jira-workbench__avatar">{initials(comment.author)}</span><span><strong>{comment.author}</strong><time dateTime={comment.created}>{formatJiraDate(comment.created)}</time></span></header>
              <p>{comment.body || t('common.noText')}</p>
            </li>)}</ol> : <p className="sd-jira-workbench__placeholder">{t('common.noCommentsYet')}</p>}
          </section>
        </div>
        <aside className="sd-jira-workbench__detail-aside" aria-label={t('common.properties')}>
          <h3>{t('common.properties')}</h3>
          <div className="sd-jira-workbench__person-property"><span>{t('common.assigneeAlt')}</span><div><span className="sd-jira-workbench__avatar">{initials(ticket.assignee?.displayName)}</span><span><strong>{ticket.assignee?.displayName ?? t('common.unassigned')}</strong><small>{t('common.assignee')}</small></span></div></div>
          <div className="sd-jira-workbench__person-property"><span>{t('common.reporter')}</span><div><span className="sd-jira-workbench__avatar is-muted">{initials(ticket.reporter?.displayName)}</span><span><strong>{ticket.reporter?.displayName ?? '—'}</strong><small>{t('common.reporterAlt')}</small></span></div></div>
          <dl className="sd-jira-workbench__dates"><div><dt>▦ {t('common.created')}</dt><dd>{ticket.created ? formatJiraDate(ticket.created) : '—'}</dd></div><div><dt>◷ {t('common.lastUpdated')}</dt><dd>{formatJiraDate(ticket.updated)}</dd></div></dl>
          <a className="sd-jira-workbench__jira-link" href={ticket.url} target="_blank" rel="noopener noreferrer">↗ {t('common.openInAtlassianJira')}</a>
        </aside>
        </div>
        </div>
      </section>
      {assignmentOpen ? <div className="sd-jira-workbench__assignment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssignmentOpen(false) }}>
        <section className="sd-jira-workbench__assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="jira-assignment-title">
          <header>
            <div><h3 id="jira-assignment-title">{t('common.selectDispatchProject')}</h3><p>{t('common.aTicketCanBeAssignedToOnlyOneProjectAlt')}</p></div>
            <button type="button" onClick={() => setAssignmentOpen(false)} aria-label={t('common.closeProjectDispatchDialog')}>×</button>
          </header>
          <label className="sd-jira-workbench__assignment-search"><span>{t('common.searchProjects')}</span><input type="search" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder={t('common.searchProjectNameOrFolder')} /></label>
          <div className="sd-jira-workbench__assignment-list">
            {filteredProjects.length ? filteredProjects.map((project) => <label className="sd-jira-workbench__assignment-option" key={project.id}>
              <input type="radio" name={`jira-ticket-project-${ticket.key}`} value={project.id} checked={selectedProjectId === project.id} onChange={() => setSelectedProjectId(project.id)} />
              <span><strong>{project.name}</strong><small>{project.folderDisplayName}</small></span>
            </label>) : <p className="sd-jira-workbench__assignment-empty">{t('common.noMatchingLocalProjects')}</p>}
          </div>
          {assignmentError ? <p className="sd-jira-workbench__assignment-error" role="alert">{assignmentError}</p> : null}
          <footer><button type="button" onClick={() => setAssignmentOpen(false)} disabled={assignmentSaving}>{t('common.cancel')}</button><button type="button" className="is-primary" onClick={() => void saveAssignment()} disabled={assignmentSaving || !selectedProjectId}>{assignmentSaving ? t('common.saving') : t('common.saveDispatch')}</button></footer>
        </section>
      </div> : null}
    </>}
  </section>
}
