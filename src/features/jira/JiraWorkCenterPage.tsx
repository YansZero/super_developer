import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JiraService, JiraTicket } from './jiraContracts'
import { defaultJiraService } from './useJiraWorkbench'
import { JiraWorkbench, type JiraWorkbenchContext } from './JiraWorkbench'
import { JiraProjectTaskPicker } from '../settings/integrations/jira/JiraProjectTaskPicker'
import { createJiraSiteClient } from '../settings/integrations/jira/jiraSiteClient'
import type { JiraSiteServiceContract } from '../settings/integrations/jira/jiraSiteContracts'
import type { JiraTicketSummary, ProjectItem } from '../../shared/types/domain'
import { jiraTicketToSummary } from './jiraTicketPresentation'
import { useI18n } from '../../shared/i18n'
import './JiraWorkCenterPage.css'

type JiraWorkCenterTab = 'assigned' | 'projects'
const defaultSiteService = createJiraSiteClient()

function tabFromLocation(): JiraWorkCenterTab {
  return new URL(window.location.href).searchParams.get('type') === 'project_list' ? 'projects' : 'assigned'
}

interface JiraWorkCenterPageProps {
  projects: ProjectItem[]
  jiraService?: JiraService
  jiraSiteService?: JiraSiteServiceContract
  onAssignJiraTickets: (projectId: string, tickets: JiraTicketSummary[]) => Promise<ProjectItem>
  onOpenProjectDetail?: (projectId: string) => void
  onNavigateToJiraSettings?: () => void
}

export function JiraWorkCenterPage({ projects, jiraService = defaultJiraService, jiraSiteService = defaultSiteService, onAssignJiraTickets, onOpenProjectDetail, onNavigateToJiraSettings }: JiraWorkCenterPageProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<JiraWorkCenterTab>(() => tabFromLocation())
  const [jiraContext, setJiraContext] = useState<JiraWorkbenchContext | null>(null)
  const hydratedTicketKeys = useRef(new Set<string>())
  const handleJiraContextChange = useCallback((context: JiraWorkbenchContext | null) => setJiraContext(context), [])
  const assignedProjects = useMemo(() => projects.filter((project) => project.jira.tickets.length > 0), [projects])
  const missingTicketMetadata = useMemo(() => projects.flatMap((project) => project.jira.tickets
    .filter((ticket) => !ticket.issueType?.trim() || !ticket.statusName?.trim())
    .map((ticket) => ({ projectId: project.id, key: ticket.key }))), [projects])
  const projectNamesByTicket = useMemo(() => new Map(projects.flatMap((project) => project.jira.tickets.map((ticket) => [ticket.key, project.name] as const))), [projects])
  const projectsByTicket = useMemo(() => new Map(projects.flatMap((project) => project.jira.tickets.map((ticket) => [ticket.key, project] as const))), [projects])
  useEffect(() => {
    if (activeTab !== 'projects') return
    const pending = missingTicketMetadata.filter(({ projectId, key }) => !hydratedTicketKeys.current.has(`${projectId}:${key}`))
    if (pending.length === 0) return
    const pendingIds = pending.map(({ projectId, key }) => `${projectId}:${key}`)
    pendingIds.forEach((id) => hydratedTicketKeys.current.add(id))
    void (async () => {
      try {
        const snapshot = await jiraSiteService.getSnapshot()
        const cloudId = snapshot.selectedCloudId
        if (!cloudId || !snapshot.sites.some((site) => site.cloudId === cloudId)) throw new Error('Jira Site unavailable')
        const before = await jiraService.profile()
        if (before.id !== snapshot.userKey || before.selectedCloudId !== cloudId) throw new Error('Jira identity changed')
        const page = await jiraService.tickets(cloudId, 'assigned', null)
        const liveByKey = new Map(page.tickets.map((ticket) => [ticket.key, ticket] as const))
        const missingLiveKeys = pending.filter(({ key }) => !liveByKey.has(key)).map(({ key }) => key)
        if (missingLiveKeys.length > 0) {
          const details = await Promise.all(missingLiveKeys.map(async (key) => {
            try { return await jiraService.detail(cloudId, key) } catch { return null }
          }))
          details.forEach((ticket) => { if (ticket) liveByKey.set(ticket.key, ticket) })
        }
        const after = await jiraService.profile()
        if (after.id !== before.id || after.selectedCloudId !== cloudId) throw new Error('Jira identity changed')
        for (const project of projects) {
          const nextTickets = project.jira.tickets.map((summary) => {
            const live = liveByKey.get(summary.key)
            if (!live) return summary
            return {
              ...summary,
              issueType: summary.issueType?.trim() ? summary.issueType : live.issueType,
              statusName: summary.statusName?.trim() ? summary.statusName : live.status.name,
            }
          })
          if (nextTickets.some((ticket, index) => ticket !== project.jira.tickets[index])) await onAssignJiraTickets(project.id, nextTickets)
        }
      } catch {
        pendingIds.forEach((id) => hydratedTicketKeys.current.delete(id))
      }
    })()
  }, [activeTab, jiraService, jiraSiteService, missingTicketMetadata, onAssignJiraTickets, projects])
  const handleTabChange = useCallback((tab: JiraWorkCenterTab) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.pathname = '/jira-work-center'
    url.searchParams.set('type', tab === 'assigned' ? 'job_list' : 'project_list')
    window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    if (tab === 'projects') setJiraContext(null)
  }, [])
  useEffect(() => {
    const syncTab = () => setActiveTab(tabFromLocation())
    window.addEventListener('popstate', syncTab)
    return () => window.removeEventListener('popstate', syncTab)
  }, [])
  const handleAssignJiraTicket = useCallback(async (projectId: string, ticket: JiraTicket | null, ticketKey?: string) => {
    const project = projects.find((item) => item.id === projectId)
    if (!project) throw new Error('找不到要指派 Jira Ticket 的本機專案。')
    const key = ticket?.key ?? ticketKey
    if (!key) throw new Error('找不到要處理的 Jira Ticket。')
    const nextTickets = ticket
      ? [...project.jira.tickets.filter((item) => item.key !== key), jiraTicketToSummary(ticket)]
      : project.jira.tickets.filter((item) => item.key !== key)
    return onAssignJiraTickets(projectId, nextTickets)
  }, [onAssignJiraTickets, projects])
  const handleGoToJiraSettings = useCallback(() => {
    if (onNavigateToJiraSettings) {
      onNavigateToJiraSettings()
      return
    }
    const url = new URL(window.location.href)
    url.pathname = '/settings'
    url.searchParams.delete('project')
    url.searchParams.delete('type')
    url.searchParams.delete('tab')
    url.searchParams.delete('code')
    url.searchParams.delete('jira')
    url.searchParams.set('settings', 'jira')
    url.searchParams.set('jiraTab', 'connection')
    window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [onNavigateToJiraSettings])
  const assignedCount = new Set(projects.flatMap((project) => project.jira.tickets.map((ticket) => ticket.key))).size
  return (
    <section className="sd-jira-work-center" aria-label={t('jira.workCenter')}>
      <header className="sd-jira-work-center__header">
        <div className="sd-jira-work-center__title-row">
          <div>
            <h1>{t('jira.workCenter')}</h1>
            <p>{t('jira.description')}</p>
          </div>
          <div className="sd-jira-work-center__actions">
            <button
              type="button"
              className="sd-jira-work-center__settings-button"
              onClick={handleGoToJiraSettings}
            >
              {t('jira.goToSettings')}
            </button>
            <select
              className="sd-jira-work-center__context-select"
              aria-label={t('common.jiraSiteAndUser')}
              value="context"
              onChange={(event) => {
                if (event.target.value === 'logout') {
                  jiraContext?.logout()
                  setJiraContext(null)
                }
              }}
            >
              <option value="context">
                {jiraContext ? `${jiraContext.siteName} — ${jiraContext.userName}` : t('common.jiraSiteUser')}
              </option>
              {jiraContext ? <option value="logout">{t('common.logOutOfJira')}</option> : null}
            </select>
          </div>
        </div>
      <span className="sd-jira-work-center__constraint">{t('jira.assignmentConstraint')}</span>
      </header>
      <nav className="sd-jira-work-center__tabs" aria-label={t('jira.workCenterTabs')}>
        <button type="button" className={activeTab === 'assigned' ? 'is-active' : ''} aria-current={activeTab === 'assigned' ? 'page' : undefined} onClick={() => handleTabChange('assigned')}>
          <span className="sd-jira-work-center__tab-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.4" /><path d="m5.4 8 1.8 1.8 3.5-3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
          {t('jira.myAssignedTickets')} <span>{assignedCount}</span>
        </button>
        <button type="button" className={activeTab === 'projects' ? 'is-active' : ''} aria-current={activeTab === 'projects' ? 'page' : undefined} onClick={() => handleTabChange('projects')}>
          <span className="sd-jira-work-center__tab-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none"><path d="m6 8 4-2.5M6 8l4 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="4" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.3" /><circle cx="11.5" cy="4.5" r="1.8" stroke="currentColor" strokeWidth="1.3" /><circle cx="11.5" cy="11.5" r="1.8" stroke="currentColor" strokeWidth="1.3" /></svg></span>
          {t('jira.ticketAssignment')}
        </button>
      </nav>
      {activeTab === 'assigned' ? (
        <JiraWorkbench service={jiraService} siteService={jiraSiteService} initialFilter="assigned" onContextChange={handleJiraContextChange} projectNamesByTicket={projectNamesByTicket} projects={projects} projectsByTicket={projectsByTicket} onAssignJiraTicket={handleAssignJiraTicket} onOpenAssignmentPage={() => handleTabChange('projects')} />
      ) : (
        <section className="sd-jira-work-center__assignments" aria-label={t('common.projectAssignment')}>
          <header>
            <h2>{t('jira.ticketAssignment')}</h2>
            <p>{t('jira.assignmentDescription')}</p>
          </header>
          {assignedProjects.length === 0 ? <p className="sd-jira-work-center__empty">{t('common.noLocalProjectsHaveAssignedTickets')}</p> : assignedProjects.map((project) => (
            <article className="sd-jira-work-center__project" key={project.id}>
              <div className="sd-jira-work-center__project-heading">
                <h3>{t('common.projectNameAlt')}{project.name}</h3>
                {onOpenProjectDetail ? <button type="button" className="sd-jira-work-center__project-detail-button" onClick={() => onOpenProjectDetail(project.id)}>{t('common.projectDetails')}</button> : null}
              </div>
              <JiraProjectTaskPicker project={project} jiraService={jiraService} siteService={jiraSiteService} onSave={onAssignJiraTickets} />
            </article>
          ))}
        </section>
      )}
    </section>
  )
}
