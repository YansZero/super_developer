import { useEffect, useMemo, useState } from 'react'
import type { JiraSiteServiceContract } from '../settings/integrations/jira/jiraSiteContracts'
import { useJiraSites } from '../settings/integrations/jira/useJiraSites'
import { jiraSiteMessages } from '../settings/integrations/jira/jiraSiteState'
import { jiraMessages } from './jiraContracts'
import type { JiraProfile, JiraService, JiraTicket, TicketFilter } from './jiraContracts'
import { formatJiraDate } from './formatJiraDate'
import { jiraTicketGroup, jiraTicketPriorityTone, jiraTicketStatusTone, jiraTicketTypeTone } from './jiraTicketPresentation'
import { defaultJiraService, useJiraWorkbench } from './useJiraWorkbench'
import { useJiraTickets } from './useJiraTickets'
import { JiraTicketDetail } from './JiraTicketDetail'
import { jiraTicketValueKey } from './jiraTicketLabel'
import type { ProjectItem } from '../../shared/types/domain'
import { useI18n } from '../../shared/i18n'
import './JiraWorkbench.css'

const filters: Array<{ value: TicketFilter; label: string }> = [
  { value: 'assigned', label: 'jira.filter.assigned' },
  { value: 'inProgress', label: 'jira.filter.inProgress' },
  { value: 'pending', label: 'jira.filter.pending' },
  { value: 'done', label: 'jira.filter.done' },
  { value: 'reported', label: 'jira.filter.reported' },
]
const tableFilters = new Set<TicketFilter>(['assigned', 'inProgress', 'pending'])

type TicketGroup = 'inProgress' | 'pending' | 'done'
const EMPTY_TICKETS: JiraTicket[] = []
const groups: Array<{ key: TicketGroup; title: string; icon: string }> = [
  { key: 'inProgress', title: 'jira.group.inProgress', icon: '◉' },
  { key: 'pending', title: 'jira.group.pending', icon: '◷' },
  { key: 'done', title: 'jira.group.done', icon: '✓' },
]

function ticketGroup(ticket: JiraTicket): TicketGroup {
  return jiraTicketGroup(jiraTicketStatusTone(ticket.status))
}

function useWaiting(retryAt: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (retryAt <= now) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(retryAt - Date.now() + 1, 2147483647)))
    return () => clearTimeout(timer)
  }, [retryAt, now])
  return retryAt > now
}

function TicketCard({ ticket, onSelect, listView, projectName }: { ticket: JiraTicket; onSelect: () => void; listView: boolean; projectName?: string }) {
  const { t } = useI18n()
  const statusTone = jiraTicketStatusTone(ticket.status)
  const priorityTone = jiraTicketPriorityTone(ticket.priority)
  const typeTone = jiraTicketTypeTone(ticket.issueType)
  const type = typeTone === 'subtask' ? t('jira.type.subtask') : t(jiraTicketValueKey(ticket.issueType))
  const hasPriority = ticket.priority.trim().toLocaleLowerCase() !== 'none'
  const canAssign = ticketGroup(ticket) !== 'done'
  const priority = hasPriority ? <span className={`sd-jira-workbench__ticket-priority sd-jira-workbench__ticket-priority--${priorityTone}`}>{t(jiraTicketValueKey(ticket.priority))}</span> : null
  return <article className={`sd-jira-workbench__ticket-card sd-jira-workbench__ticket-card--priority-${priorityTone}${listView ? ' is-list' : ''}`} role="button" tabIndex={0} aria-label={`${ticket.key} ${ticket.summary}`} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect() } }}>
    <span className="sd-jira-workbench__ticket-topline">
      <span className="sd-jira-workbench__ticket-badges"><strong className="sd-jira-workbench__ticket-key">{ticket.key}</strong><span className={`sd-jira-workbench__ticket-type sd-jira-workbench__ticket-type--${typeTone}`}>{type}</span>{listView ? priority : null}</span>
      <span className="sd-jira-workbench__ticket-open" aria-hidden="true">↗</span>
    </span>
    <strong className="sd-jira-workbench__ticket-summary">{ticket.summary}</strong>
    <span className="sd-jira-workbench__ticket-bottomline">
      <span className={`sd-jira-workbench__ticket-status sd-jira-workbench__ticket-status--${statusTone}`}>{t(jiraTicketValueKey(ticket.status.name))}</span>
      {!listView ? priority : null}
      {!listView ? <span className="sd-jira-workbench__ticket-person">♙ {ticket.assignee?.displayName ?? t('common.unassigned')}</span> : null}
      {!listView ? <time className="sd-jira-workbench__ticket-updated" dateTime={ticket.updated}>◷ {formatJiraDate(ticket.updated)}</time> : null}
    </span>
    {listView ? <span className="sd-jira-workbench__ticket-assignment">
      {canAssign ? projectName ? <span className="sd-jira-workbench__ticket-assignment-name">{projectName}</span> : <button type="button" className="sd-jira-workbench__ticket-assignment-action" onClick={(event) => { event.stopPropagation(); onSelect() }}>{t('common.dispatchMe')}</button> : null}
    </span> : null}
    {listView ? <button type="button" className="sd-jira-workbench__ticket-detail" aria-label={`${t('common.open')} ${ticket.key} ${t('common.taskDetailsAlt')}`} title={t('common.taskDetailsAlt')} onClick={(event) => { event.stopPropagation(); onSelect() }}>
      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2.5h6l4 4v7H3v-11Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M9 2.5v4h4M5.5 9h5M5.5 11h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span>{t('common.taskDetailsAlt')}</span>
    </button> : null}
  </article>
}

type TicketSortKey = 'key' | 'type' | 'priority' | 'summary' | 'status'
type TicketSortState = { key: TicketSortKey; direction: 'asc' | 'desc' } | null

function ticketSortValue(ticket: JiraTicket, key: TicketSortKey): string | number {
  if (key === 'key') return ticket.key
  if (key === 'type') return ticket.issueType.toLocaleLowerCase().includes('sub') ? 'Subtask' : ticket.issueType
  if (key === 'priority') {
    const tone = jiraTicketPriorityTone(ticket.priority)
    return tone === 'high' ? 3 : tone === 'medium' ? 2 : 1
  }
  if (key === 'summary') return ticket.summary
  return ticket.status.name
}

function TicketTable({ tickets, projectNamesByTicket, onSelect }: { tickets: JiraTicket[]; projectNamesByTicket?: ReadonlyMap<string, string>; onSelect: (ticket: JiraTicket) => void }) {
  const { t } = useI18n()
  const [sort, setSort] = useState<TicketSortState>(null)
  const sortedTickets = useMemo(() => {
    if (!sort) return tickets
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    return [...tickets].sort((left, right) => {
      const leftValue = ticketSortValue(left, sort.key)
      const rightValue = ticketSortValue(right, sort.key)
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number' ? leftValue - rightValue : collator.compare(String(leftValue), String(rightValue))
      return sort.direction === 'asc' ? comparison : -comparison
    })
  }, [sort, tickets])
  const toggleSort = (key: TicketSortKey) => setSort((current) => current?.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' })
  const sortableHeader = (key: TicketSortKey, label: string) => {
    const active = sort?.key === key
    const direction = active && sort.direction === 'desc' ? 'descending' : 'ascending'
    return <th scope="col" aria-sort={active ? direction : 'none'}><button type="button" className="sd-jira-workbench__ticket-table-sort-button" onClick={() => toggleSort(key)}>{t(label)}<span aria-hidden="true">{active ? sort.direction === 'asc' ? ' ↑' : ' ↓' : ' ↕'}</span></button></th>
  }
  return <div className="sd-jira-workbench__ticket-table-wrap">
    <table className="sd-jira-workbench__ticket-table">
      <thead><tr>{sortableHeader('key', 'jira.table.key')}{sortableHeader('type', 'jira.table.type')}{sortableHeader('priority', 'jira.table.priority')}{sortableHeader('summary', 'jira.table.summary')}{sortableHeader('status', 'jira.table.status')}<th scope="col">{t('jira.table.assignment')}</th><th scope="col">{t('jira.table.actions')}</th></tr></thead>
      <tbody>{sortedTickets.map((ticket) => {
        const statusTone = jiraTicketStatusTone(ticket.status)
        const priorityTone = jiraTicketPriorityTone(ticket.priority)
        const typeTone = jiraTicketTypeTone(ticket.issueType)
        const type = typeTone === 'subtask' ? t('jira.type.subtask') : t(jiraTicketValueKey(ticket.issueType))
        const projectName = projectNamesByTicket?.get(ticket.key)
        return <tr key={ticket.id}>
          <th scope="row"><span className="sd-jira-workbench__ticket-key">{ticket.key}</span></th>
          <td><span className={`sd-jira-workbench__ticket-type sd-jira-workbench__ticket-type--${typeTone}`}>{type}</span></td>
          <td>{ticket.priority.trim().toLocaleLowerCase() === 'none' ? <span>—</span> : <span className={`sd-jira-workbench__ticket-priority sd-jira-workbench__ticket-priority--${priorityTone}`}>{t(jiraTicketValueKey(ticket.priority))}</span>}</td>
          <td><strong className="sd-jira-workbench__ticket-table-summary">{ticket.summary}</strong></td>
          <td><span className={`sd-jira-workbench__ticket-status sd-jira-workbench__ticket-status--${statusTone}`}>{t(jiraTicketValueKey(ticket.status.name))}</span></td>
          <td><span className="sd-jira-workbench__ticket-assignment">
            {projectName ? <span className="sd-jira-workbench__ticket-assignment-name">{projectName}</span> : <button type="button" className="sd-jira-workbench__ticket-assignment-action" onClick={() => onSelect(ticket)}>{t('common.dispatchMe')}</button>}
          </span></td>
          <td><button type="button" className="sd-jira-workbench__ticket-detail" aria-label={`${t('common.open')} ${ticket.key} ${t('common.taskDetailsAlt')}`} title={t('common.taskDetailsAlt')} onClick={() => onSelect(ticket)}>
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2.5h6l4 4v7H3v-11Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M9 2.5v4h4M5.5 9h5M5.5 11h3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span>{t('common.taskDetailsAlt')}</span>
          </button></td>
        </tr>
      })}</tbody>
    </table>
  </div>
}

function Tickets({ service, userId, cloudId, filter, onFilterChange, projectNamesByTicket, projects, projectsByTicket, onAssignJiraTicket, onOpenAssignmentPage }: { service: JiraService; userId: string; cloudId: string; filter: TicketFilter; onFilterChange: (filter: TicketFilter) => void; projectNamesByTicket?: ReadonlyMap<string, string>; projects?: ProjectItem[]; projectsByTicket?: ReadonlyMap<string, ProjectItem>; onAssignJiraTicket?: (projectId: string, ticket: JiraTicket | null, ticketKey?: string) => Promise<ProjectItem>; onOpenAssignmentPage?: () => void }) {
  const { t } = useI18n()
  const data = useJiraTickets(service, userId, cloudId, filter)
  const [detail, setDetail] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [autoClassify, setAutoClassify] = useState(true)
  const [listView, setListView] = useState(true)
  const waiting = useWaiting(data.error?.retryAt ?? 0)
  const tickets = useMemo(() => data.page?.tickets ?? EMPTY_TICKETS, [data.page?.tickets])
  const visibleTickets = useMemo(() => {
    if (filter === 'assigned') return tickets.filter((ticket) => ticketGroup(ticket) !== 'done')
    if (filter === 'pending') return tickets.filter((ticket) => ticketGroup(ticket) === 'pending')
    return tickets
  }, [filter, tickets])
  const filteredTickets = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    if (!search) return visibleTickets
    return visibleTickets.filter((ticket) => `${ticket.key} ${ticket.summary} ${ticket.assignee?.displayName ?? ''} ${ticket.issueType}`.toLocaleLowerCase().includes(search))
  }, [query, visibleTickets])
  const counts = useMemo(() => ({
    total: visibleTickets.length,
    inProgress: visibleTickets.filter((ticket) => ticketGroup(ticket) === 'inProgress').length,
    pending: visibleTickets.filter((ticket) => ticketGroup(ticket) === 'pending').length,
    done: visibleTickets.filter((ticket) => ticketGroup(ticket) === 'done').length,
  }), [visibleTickets])
  const completeRate = counts.total ? Math.round((counts.done / counts.total) * 100) : 0
  const usesTicketTable = tableFilters.has(filter)
  const renderTicket = (ticket: JiraTicket) => <TicketCard key={ticket.id} ticket={ticket} listView={listView} onSelect={() => setDetail(ticket.key)} projectName={projectNamesByTicket?.get(ticket.key)} />
  const renderAssignedTable = () => <TicketTable tickets={filteredTickets} projectNamesByTicket={projectNamesByTicket} onSelect={(ticket) => setDetail(ticket.key)} />
  if (detail) return <JiraTicketDetail key={detail} service={service} userId={userId} cloudId={cloudId} ticketKey={detail} onBack={() => setDetail(null)} projects={projects} assignedProject={projectsByTicket?.get(detail)} onAssignTicket={onAssignJiraTicket} onOpenAssignmentPage={onOpenAssignmentPage} />
  return <section className="sd-jira-workbench__board" aria-label={t('jira.board.title')} aria-busy={data.loading}>
    <header className="sd-jira-workbench__board-header">
      <div><h2>{t('jira.board.tickets')} <span className="sd-jira-workbench__live-pill">✦ {t('jira.board.liveWorkspace')}</span></h2><p>{t('jira.board.loadedForFilter')}</p></div>
      <div className="sd-jira-workbench__board-actions">
        {!usesTicketTable ? <>
          <button type="button" className={autoClassify ? 'is-active' : ''} aria-pressed={autoClassify} onClick={() => setAutoClassify((value) => !value)}>▱ {t('common.autoClassify')}</button>
          <button type="button" className={listView ? 'is-active' : ''} aria-pressed={listView} onClick={() => setListView((value) => !value)}>
            {listView ? <svg className="sd-jira-workbench__view-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4.5h8.5v9H4v-9Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M6 4.5V3h4v1.5M5.5 7.5l1 1 1.6-1.7M9 7.8h2M5.5 10.5l1 1 1.6-1.7M9 10.8h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg> : <svg className="sd-jira-workbench__view-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" /><rect x="9" y="2.5" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" /><rect x="2.5" y="9" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" /><rect x="9" y="9" width="4.5" height="4.5" stroke="currentColor" strokeWidth="1.2" /></svg>}
            {listView ? t('common.list') : t('common.board')}
          </button>
        </> : null}
        <button type="button" onClick={data.refresh} disabled={data.loading || waiting}>⟳ {t('common.refresh')}</button>
      </div>
    </header>
    <div className="sd-jira-workbench__stats" aria-label={t('common.taskStatistics')}>
      <article className="sd-jira-workbench__stat-card sd-jira-workbench__stat-card--total"><span>{t('common.totalTasks')}</span><strong>{counts.total}</strong><small>{t('common.loadedTasks')}</small><i aria-hidden="true">▱</i></article>
      <article className="sd-jira-workbench__stat-card sd-jira-workbench__stat-card--progress"><span>{t('common.inProgressTasks')}</span><strong>{counts.inProgress}</strong><small>{t('common.currentlyActiveTasks')}</small><i aria-hidden="true">▷</i></article>
      <article className="sd-jira-workbench__stat-card sd-jira-workbench__stat-card--pending"><span>{t('common.pendingTasks')}</span><strong>{counts.pending}</strong><small>{t('common.currentToDoTasks')}</small><i aria-hidden="true">◷</i></article>
      <article className="sd-jira-workbench__stat-card sd-jira-workbench__stat-card--done"><span>{t('common.closedAndDiscarded')}</span><strong>{counts.done}<small className="sd-jira-workbench__complete-rate">↗ {completeRate}% {t('common.completionRate')}</small></strong><progress value={counts.done} max={counts.total || 1} aria-label={`${t('common.completionRate')} ${completeRate}%`} /></article>
    </div>
    <div className="sd-jira-workbench__body">
      <div className="sd-jira-workbench__controls">
        <div className="sd-jira-workbench__filters" role="group" aria-label={t('common.taskFilters')}>{filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} className={filter === item.value ? 'is-active' : ''} onClick={() => onFilterChange(item.value)}>{t(item.label)}</button>)}</div>
        <label className="sd-jira-workbench__search"><span aria-hidden="true">⌕</span><span className="sd-jira-workbench__sr-only">{t('common.searchJiraTasks')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('common.searchByKeySummaryOrAssignee')} /></label>
      </div>
      {data.loading && <p role="status">{t('common.loadMyTasks')}</p>}
      {data.error && <p className="sd-jira-workbench__error" role="alert">{data.error.code === 'AUTH_REQUIRED' ? t('common.jiraSignInExpiredGoToSettingsJiraConnectionToSignInAgainAndCheckTheApiStatus') : t(jiraMessages[data.error.code])}</p>}
      {data.page && <>
        {filteredTickets.length === 0 ? <p className="sd-jira-workbench__empty">{visibleTickets.length === 0 ? t('common.noTasksMatchThisFilter') : t('common.noMatchingTasks')}</p> : usesTicketTable ? renderAssignedTable() : autoClassify ? groups.map((group) => {
          const items = filteredTickets.filter((ticket) => ticketGroup(ticket) === group.key)
          if (!items.length) return null
          return <section className={`sd-jira-workbench__group sd-jira-workbench__group--${group.key}`} key={group.key} aria-label={t(group.title)}>
            <header><h3><span aria-hidden="true">{group.icon}</span>{t(group.title)}</h3><span>{items.length} {t('common.tasks')}</span></header>
            <div className={`sd-jira-workbench__ticket-grid${listView ? ' is-list' : ''}`}>{items.map(renderTicket)}</div>
          </section>
        }) : <section className="sd-jira-workbench__group" aria-label={t('common.searchResults')}><header><h3>{t('common.searchResults')}</h3><span>{filteredTickets.length} {t('common.tasks')}</span></header><div className={`sd-jira-workbench__ticket-grid${listView ? ' is-list' : ''}`}>{filteredTickets.map(renderTicket)}</div></section>}
        <nav className="sd-jira-workbench__pagination" aria-label={t('common.jiraTaskPagination')}><button type="button" onClick={data.previous} disabled={data.pageNumber === 1 || data.loading}>{t('common.previous')}</button><span>{t('common.page')}{data.pageNumber} {t('common.textV3mh8')}</span><button type="button" onClick={data.next} disabled={data.loading || data.page.pagination.isLast || !data.page.pagination.nextPageToken}>{t('common.next')}</button></nav>
      </>}
    </div>
  </section>
}

export interface JiraWorkbenchContext {
  siteName: string
  siteUrl: string
  userName: string
  logout: () => void
}

function AuthenticatedJira({ service, siteService, user, initialFilter, onContextChange, onLogout, projectNamesByTicket, projects, projectsByTicket, onAssignJiraTicket, onOpenAssignmentPage }: { service: JiraService; siteService?: JiraSiteServiceContract; user: JiraProfile; initialFilter: TicketFilter; onContextChange?: (context: JiraWorkbenchContext | null) => void; onLogout: () => Promise<void>; projectNamesByTicket?: ReadonlyMap<string, string>; projects?: ProjectItem[]; projectsByTicket?: ReadonlyMap<string, ProjectItem>; onAssignJiraTicket?: (projectId: string, ticket: JiraTicket | null, ticketKey?: string) => Promise<ProjectItem>; onOpenAssignmentPage?: () => void }) {
  const { t } = useI18n()
  const sites = useJiraSites(siteService)
  const [filter, setFilter] = useState<TicketFilter>(initialFilter)
  const snapshot = sites.state.snapshot
  const current = snapshot?.sites.find((site) => site.cloudId === snapshot.selectedCloudId)
  const confirmed = snapshot?.userKey === user.id && sites.state.phase === 'ready' ? current : undefined
  useEffect(() => {
    onContextChange?.(confirmed ? {
      siteName: confirmed.name,
      siteUrl: confirmed.url,
      userName: user.name,
      logout: () => { void onLogout() },
    } : null)
  }, [confirmed, onContextChange, onLogout, user.id, user.name])
  return <>
    <section className="sd-jira-workbench__site-context" aria-label={t('common.workbenchJiraSite')} aria-busy={sites.view.busy}>
      {sites.state.error && <p role="alert">{t(jiraSiteMessages[sites.state.error.code])} {t('common.goToSettingsJiraConnectionToVerifySignInAndTheSite')}</p>}
      {snapshot && snapshot.userKey !== user.id && <p role="alert">{t('common.theSignedInAccountChangedGoToSettingsJiraConnectionAndCheckTheJiraApiAgain')}</p>}
      {sites.state.phase === 'loading' && <p role="status">{t('common.loadingJiraSites')}</p>}
      {snapshot?.sites.length === 0 && <p>{t('common.noJiraSitesAvailable')}</p>}
      {snapshot?.selectedCloudId && !current && <p role="status">{t('common.theSavedSiteIsUnavailableChooseAnotherSiteInSettings')}</p>}
      {snapshot && !snapshot.selectedCloudId && <p role="status">{t('common.goToSettingsJiraConnectionToChooseAndSaveAJiraSiteFirst')}</p>}
    </section>
    {confirmed ? <Tickets key={`${user.id}:${confirmed.cloudId}:${filter}`} service={service} userId={user.id} cloudId={confirmed.cloudId} filter={filter} onFilterChange={setFilter} projectNamesByTicket={projectNamesByTicket} projects={projects} projectsByTicket={projectsByTicket} onAssignJiraTicket={onAssignJiraTicket} onOpenAssignmentPage={onOpenAssignmentPage} /> : <p>{t('common.signInAndSaveAJiraSiteInSettingsToLoadYourTasks')}</p>}
  </>
}

export function JiraWorkbench({ service = defaultJiraService, siteService, initialFilter = 'assigned', onContextChange, projectNamesByTicket, projects, projectsByTicket, onAssignJiraTicket, onOpenAssignmentPage }: { service?: JiraService; siteService?: JiraSiteServiceContract; initialFilter?: TicketFilter; onContextChange?: (context: JiraWorkbenchContext | null) => void; projectNamesByTicket?: ReadonlyMap<string, string>; projects?: ProjectItem[]; projectsByTicket?: ReadonlyMap<string, ProjectItem>; onAssignJiraTicket?: (projectId: string, ticket: JiraTicket | null, ticketKey?: string) => Promise<ProjectItem>; onOpenAssignmentPage?: () => void }) {
  const { t } = useI18n()
  const { state, logout } = useJiraWorkbench(service)
  useEffect(() => {
    if (!state.user) onContextChange?.(null)
  }, [onContextChange, state.user])
  const error = new URLSearchParams(window.location.search).get('error')
  const callbackMessages: Record<string, string> = { invalid_state: 'jira.callback.invalidState', cancelled: 'jira.callback.cancelled', missing_code: 'jira.callback.missingCode', authentication_failed: 'jira.callback.authenticationFailed', unconfigured: 'jira.callback.unconfigured' }
  return <div className="sd-jira-workbench" aria-label={t('common.myJiraTasksWorkbench')}>
    {error && callbackMessages[error] && <p role="status">{t(callbackMessages[error])}</p>}
    {state.phase === 'loading' && <p role="status">{t('common.loadingJiraSession')}</p>}
    {state.phase === 'unconfigured' && <>
      <p role="status">{t(jiraMessages.UNCONFIGURED)}</p>
      {state.missingSettings.length > 0 && <p role="alert">{t('common.missingOrInvalidConfiguration')}{state.missingSettings.join('、')}</p>}
    </>}
    {state.error && <p role="alert">{t(jiraMessages[state.error.code])} {t('common.goToSettingsJiraConnectionToCheckTheSignInStatusAgain')}</p>}
    {state.phase === 'signedOut' && <p role="status">{t('common.goToSettingsJiraConnectionToSignInAndCheckTheJiraApiConnection')}</p>}
    {state.user && <>
      {!onContextChange ? <header className="sd-jira-workbench__session"><strong>{state.user.name}</strong><button type="button" onClick={() => void logout()}>{t('common.logOutOfJira')}</button></header> : null}
      <AuthenticatedJira key={state.user.id} service={service} siteService={siteService} user={state.user} initialFilter={initialFilter} onContextChange={onContextChange} onLogout={logout} projectNamesByTicket={projectNamesByTicket} projects={projects} projectsByTicket={projectsByTicket} onAssignJiraTicket={onAssignJiraTicket} onOpenAssignmentPage={onOpenAssignmentPage} />
    </>}
  </div>
}
