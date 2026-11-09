import { useMemo, useState } from 'react'
import type { JiraTicket } from '../../../jira/jiraContracts'
import { defaultJiraService } from '../../../jira/useJiraWorkbench'
import type { JiraTicketSummary, ProjectItem } from '../../../../shared/types/domain'
import { jiraTicketToSummary, jiraTicketTypeTone } from '../../../jira/jiraTicketPresentation'
import { createJiraSiteClient } from './jiraSiteClient'
import type { JiraSiteServiceContract } from './jiraSiteContracts'
import type { JiraService } from '../../../jira/jiraContracts'
import './JiraProjectTaskPicker.css'
import { useI18n } from '../../../../shared/i18n'

const defaultSiteService = createJiraSiteClient()

interface JiraProjectTaskPickerProps {
  project: ProjectItem
  jiraService?: JiraService
  siteService?: JiraSiteServiceContract
  onSave: (projectId: string, tickets: JiraTicketSummary[]) => Promise<ProjectItem>
}

function ticketsForFilter(tickets: JiraTicket[], filter: 'toDo' | 'inProgress') {
  if (filter === 'inProgress') return tickets
  return tickets.filter((ticket) => {
    const category = ticket.status.category.toLocaleUpperCase()
    const name = ticket.status.name.toLocaleLowerCase()
    return category === 'NEW' || category === 'TODO' || /to do|待辦|待處理|open/.test(name)
  })
}

function jiraFilter(filter: 'toDo' | 'inProgress') {
  return filter === 'toDo' ? 'pending' : 'inProgress'
}

function projectProgressPercentage(project: ProjectItem): number | null {
  const progress = [project.frontendProgress, project.backendProgress].filter((item) => item.available)
  const total = progress.reduce((sum, item) => sum + item.todos.length, 0)
  if (total === 0) return null
  const completed = progress.reduce((sum, item) => sum + item.todos.filter((todo) => todo.completed).length, 0)
  return Math.round((completed / total) * 100)
}

function assignedStatusLabel(ticket: JiraTicketSummary) {
  return ticket.statusName?.trim() || (ticket.status === 'IN_PROGRESS' ? '進行中' : ticket.status === 'DONE' ? '已完成' : '待處理')
}

function assignedStatusTone(ticket: JiraTicketSummary) {
  const name = ticket.statusName?.trim().toLocaleLowerCase() ?? ''
  if (/\bqa\b|quality assurance|測試|驗收/.test(name)) return 'qa'
  if (ticket.status === 'DONE') return 'done'
  if (ticket.status === 'IN_PROGRESS') return 'inProgress'
  return 'pending'
}

export function JiraProjectTaskPicker({ project, jiraService = defaultJiraService, siteService = defaultSiteService, onSave }: JiraProjectTaskPickerProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [available, setAvailable] = useState<JiraTicket[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<'toDo' | 'inProgress'>('toDo')
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [hasNextPage, setHasNextPage] = useState(false)
  const assigned = project.jira.tickets
  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase()
    if (!value) return available
    return available.filter((ticket) => `${ticket.key} ${ticket.summary} ${ticket.assignee?.displayName ?? ''}`.toLocaleLowerCase().includes(value))
  }, [available, search])
  const projectProgress = projectProgressPercentage(project)

  async function openPicker() {
    setOpen(true)
    setLoading(true)
    setError('')
    setMessage('')
    setSearch('')
    setSelected(new Set(assigned.map((ticket) => ticket.key)))
    try {
      const snapshot = await siteService.getSnapshot()
      const cloudId = snapshot.selectedCloudId
      if (!cloudId || !snapshot.sites.some((site) => site.cloudId === cloudId)) throw new Error('請先在 Jira 連結設定選擇並保存 Jira Site。')
      const before = await jiraService.profile()
      if (before.id !== snapshot.userKey || before.selectedCloudId !== cloudId) throw new Error('Jira 登入狀態已變更，請重新檢查連線。')
      const page = await jiraService.tickets(cloudId, jiraFilter(filter), null)
      const after = await jiraService.profile()
      if (after.id !== before.id || after.selectedCloudId !== cloudId) throw new Error('Jira 登入帳號或 Site 已變更，請重新載入。')
      setAvailable(ticketsForFilter(page.tickets, filter))
      setNextPageToken(page.pagination.nextPageToken)
      setHasNextPage(!page.pagination.isLast && Boolean(page.pagination.nextPageToken))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '讀取 Jira 任務失敗。')
    } finally {
      setLoading(false)
    }
  }

  async function loadFilter(nextFilter: 'toDo' | 'inProgress') {
    if (loading || nextFilter === filter) return
    setFilter(nextFilter)
    setLoading(true)
    setError('')
    setSearch('')
    try {
      const snapshot = await siteService.getSnapshot()
      const cloudId = snapshot.selectedCloudId
      if (!cloudId || !snapshot.sites.some((site) => site.cloudId === cloudId)) throw new Error('請先在 Jira 連結設定選擇並保存 Jira Site。')
      const before = await jiraService.profile()
      if (before.id !== snapshot.userKey || before.selectedCloudId !== cloudId) throw new Error('Jira 登入狀態已變更，請重新檢查連線。')
      const page = await jiraService.tickets(cloudId, jiraFilter(nextFilter), null)
      const after = await jiraService.profile()
      if (after.id !== before.id || after.selectedCloudId !== cloudId) throw new Error('Jira 登入帳號或 Site 已變更，請重新載入。')
      setAvailable(ticketsForFilter(page.tickets, nextFilter))
      setNextPageToken(page.pagination.nextPageToken)
      setHasNextPage(!page.pagination.isLast && Boolean(page.pagination.nextPageToken))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '讀取 Jira 任務失敗。')
      setAvailable([])
      setNextPageToken(null)
      setHasNextPage(false)
    } finally {
      setLoading(false)
    }
  }

  async function loadNextPage() {
    if (!nextPageToken || loading) return
    setLoading(true)
    setError('')
    try {
      const snapshot = await siteService.getSnapshot()
      const cloudId = snapshot.selectedCloudId
      if (!cloudId || !snapshot.sites.some((site) => site.cloudId === cloudId)) throw new Error('請先在 Jira 連結設定選擇並保存 Jira Site。')
      const before = await jiraService.profile()
      if (before.id !== snapshot.userKey || before.selectedCloudId !== cloudId) throw new Error('Jira 登入狀態已變更，請重新檢查連線。')
      const page = await jiraService.tickets(cloudId, jiraFilter(filter), nextPageToken)
      const after = await jiraService.profile()
      if (after.id !== before.id || after.selectedCloudId !== cloudId) throw new Error('Jira 登入帳號或 Site 已變更，請重新載入。')
      const nextTickets = ticketsForFilter(page.tickets, filter)
      setAvailable((previous) => [...previous, ...nextTickets.filter((ticket) => !previous.some((current) => current.key === ticket.key))])
      setNextPageToken(page.pagination.nextPageToken)
      setHasNextPage(!page.pagination.isLast && Boolean(page.pagination.nextPageToken))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '讀取下一頁 Jira 任務失敗。')
    } finally {
      setLoading(false)
    }
  }

  async function saveSelection() {
    setSaving(true)
    setError('')
    try {
      const assignedByKey = new Map(assigned.map((ticket) => [ticket.key, ticket]))
      const availableByKey = new Map(available.map((ticket) => [ticket.key, jiraTicketToSummary(ticket)]))
      const next = Array.from(selected).flatMap((key) => {
        const ticket = availableByKey.get(key) ?? assignedByKey.get(key)
        return ticket ? [ticket] : []
      })
      await onSave(project.id, next)
      setOpen(false)
      setMessage(`已保存 ${next.length} 筆 Jira 任務指派。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存 Jira 任務指派失敗。')
    } finally {
      setSaving(false)
    }
  }

  async function removeTicket(key: string) {
    setSaving(true)
    setMessage('')
    try {
      await onSave(project.id, assigned.filter((ticket) => ticket.key !== key))
      setMessage(`已移除 ${key} 指派。`)
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '移除 Jira 任務指派失敗。')
    } finally {
      setSaving(false)
    }
  }

  return <section className="sd-jira-task-picker" aria-label={`${project.name} ${t('common.jiraTaskAssignment')}`}>
    <div className="sd-jira-task-picker__toolbar">
      <span>{assigned.length ? `${t('common.assigned')}${assigned.length} ${t('common.jiraTasks')}` : t('common.noJiraTasksAssigned')}</span>
      <button type="button" className="sd-integrations__btn" onClick={() => void openPicker()} disabled={saving || loading}>
        {assigned.length ? t('common.editTicketAssignment') : t('common.chooseTodoInProgressTickets')}
      </button>
    </div>
    {assigned.length > 0 && <div className="sd-jira-task-picker__assigned-table-wrap">
      <table className="sd-jira-task-picker__assigned-table">
        <thead><tr><th scope="col">{t('common.taskKey')}</th><th scope="col">{t('common.taskName')}</th><th scope="col">{t('common.taskType')}</th><th scope="col">{t('common.priority')}</th><th scope="col">{t('common.currentStatusAlt')}</th><th scope="col">{t('common.projectProgress')}</th><th scope="col">{t('common.actions')}</th></tr></thead>
        <tbody>{assigned.map((ticket) => <tr key={ticket.key}>
          <th scope="row"><span className="sd-jira-task-picker__ticket-key">{ticket.key}</span></th>
          <td><strong>{ticket.title}</strong></td>
          <td><span className={`sd-jira-task-picker__issue-type sd-jira-task-picker__issue-type--${jiraTicketTypeTone(ticket.issueType ?? '')}`}>{ticket.issueType ?? '—'}</span></td>
          <td><span className={`sd-jira-task-picker__priority sd-jira-task-picker__priority--${ticket.priority.toLocaleLowerCase()}`}>{ticket.priority}</span></td>
          <td><span className={`sd-jira-task-picker__status sd-jira-task-picker__status--${assignedStatusTone(ticket)}`}>{assignedStatusLabel(ticket)}</span></td>
          <td>{projectProgress === null ? '—' : `${projectProgress}%`}</td>
          <td><button type="button" className="sd-jira-task-picker__delete" onClick={() => void removeTicket(ticket.key)} disabled={saving} aria-label={`${t('common.delete')} ${ticket.key} ${t('common.assignment')}`} title={`${t('common.delete')} ${ticket.key} ${t('common.assignment')}`}>
            <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
              <path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m2.5 3v4m5-4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {message && <p className="sd-jira-task-picker__message" role="status">{message}</p>}
    {open && <div className="sd-jira-task-picker__backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false) }}>
      <section className="sd-jira-task-picker__dialog" role="dialog" aria-modal="true" aria-labelledby={`sd-jira-task-picker-title-${project.id}`}>
        <header><div><h3 id={`sd-jira-task-picker-title-${project.id}`}>{t('common.chooseJiraTicket')}</h3><p>{project.name} · {t('common.selectedTicketsAreAssignedToThisLocalProject')}</p></div><button type="button" aria-label={t('common.closeTaskSelector')} onClick={() => setOpen(false)} disabled={saving}>×</button></header>
        <div className="sd-jira-task-picker__filters" role="group" aria-label={t('common.ticketStatusFilter')}>
          <button type="button" aria-pressed={filter === 'toDo'} onClick={() => void loadFilter('toDo')} disabled={loading}>{t('common.toDoAlt')}</button>
          <button type="button" aria-pressed={filter === 'inProgress'} onClick={() => void loadFilter('inProgress')} disabled={loading}>{t('common.inProgress')}</button>
        </div>
        <label className="sd-jira-task-picker__search">{t('common.searchTasks')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('common.enterTicketKeyOrSummary')} /></label>
        {error && <p className="sd-jira-task-picker__error" role="alert">{error}</p>}
        {loading ? <p className="sd-jira-task-picker__empty" role="status">{t('common.loadingJiraTasks')}</p> : <div className="sd-jira-task-picker__list" aria-label={t('common.jiraTaskList')}>
          {filtered.map((ticket) => <label key={ticket.key} className="sd-jira-task-picker__option">
            <input type="checkbox" checked={selected.has(ticket.key)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(ticket.key); else next.delete(ticket.key); return next })} />
            <span><strong>{ticket.key}</strong><span>{ticket.summary}</span><small>{ticket.status.name} · {ticket.priority} · {ticket.assignee?.displayName ?? '未指派'}</small></span>
          </label>)}
          {filtered.length === 0 && <p className="sd-jira-task-picker__empty">{search.trim() ? t('common.noMatchingTasks') : filter === 'toDo' ? t('common.noTodoItems') : t('common.noInProgressJiraTickets')}</p>}
        </div>}
        {!loading && hasNextPage && <button type="button" className="sd-jira-task-picker__load-more" onClick={() => void loadNextPage()}>{t('common.loadMoreJiraTickets')}</button>}
        <footer><span>{t('common.selected')}{selected.size} {t('common.items')}</span><div><button type="button" onClick={() => setOpen(false)} disabled={saving}>{t('common.cancel')}</button><button type="button" className="sd-integrations__btn sd-integrations__btn--cta" onClick={() => void saveSelection()} disabled={loading || saving || Boolean(error)}>{saving ? t('common.saving') : t('common.saveTaskAssignments')}</button></div></footer>
      </section>
    </div>}
  </section>
}
