import { useState } from 'react'
import type { ProjectItem } from '../../../shared/types/domain'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { jiraTicketProjectKeys, jiraTicketTypeTone } from '../../jira/jiraTicketPresentation'
import { useI18n } from '../../../shared/i18n'
import { SidebarNavIcon } from '../../../app/SidebarNavIcon'
import { createHttpProjectScanService } from '../overview/projectScanClient'
import './ProjectDetailOverviewPanel.css'

interface Props {
  project: ProjectItem
  onOpenJiraTicket?: (ticketKey: string) => void
  onOpenFolder?: (folderPath: string) => Promise<void>
}

function jiraStatusLabel(ticket: ProjectItem['jira']['tickets'][number]) {
  if (ticket.statusName?.trim()) return ticket.statusName
  if (ticket.status === 'TODO') return 'common.statusToDo'
  if (ticket.status === 'IN_PROGRESS') return 'common.statusInProgress'
  return 'common.statusDone'
}

function jiraStatusTone(ticket: ProjectItem['jira']['tickets'][number]) {
  const label = ticket.statusName?.trim().toLocaleLowerCase() ?? ''
  if (/qa|測試|驗收/.test(label)) return 'ok' as const
  if (ticket.status === 'TODO') return 'warn' as const
  if (ticket.status === 'IN_PROGRESS') return 'accent' as const
  return 'ok' as const
}

export function ProjectDetailOverviewPanel({ project, onOpenJiraTicket, onOpenFolder }: Props) {
  const { t } = useI18n()
  const [isOpeningFolder, setIsOpeningFolder] = useState(false)
  const [openFolderNotice, setOpenFolderNotice] = useState<string | null>(null)
  const fullPath = project.folderPath || project.folderDisplayName
  const jiraProjectKeys = jiraTicketProjectKeys(project.jira.tickets)
  const totalTodos = project.frontendProgress.todos.length + project.backendProgress.todos.length
  const completedTodos = [...project.frontendProgress.todos, ...project.backendProgress.todos]
    .filter((todo) => todo.completed).length

  const handleOpenFolder = async (path: string) => {
    if (isOpeningFolder) return
    setIsOpeningFolder(true)
    setOpenFolderNotice(null)
    try {
      if (onOpenFolder) {
        await onOpenFolder(path)
      } else {
        await createHttpProjectScanService().openFolder(path)
      }
      setOpenFolderNotice(t('project.openFolderSuccess'))
      setTimeout(() => setOpenFolderNotice(null), 3000)
    } catch (error) {
      setOpenFolderNotice(error instanceof Error ? error.message : t('common.openFolderFailed'))
    } finally {
      setIsOpeningFolder(false)
    }
  }

  return (
    <div className="sd-project-overview-panel">
      <section className="sd-project-overview-panel__details" aria-label={t('common.projectDetails')}>
        <header className="sd-project-overview-panel__section-head">
          <div><span className="sd-project-overview-panel__eyebrow">{t('project.workspaceOverview')}</span><h2>{t('common.projectDetails')}</h2></div>
          <StatusBadge label={project.isDemoFixture ? t('common.demoData') : project.git.status === 'no-git' ? t('common.noGit') : project.git.status === 'unanalysed' ? t('common.notAnalyzed') : t('common.analyzed')} tone={project.git.status === 'no-git' ? 'err' : project.git.status === 'unanalysed' ? 'neutral' : 'ok'} />
        </header>
        <p className="sd-project-overview-panel__summary">{project.summary ? t(project.summary) : t('common.noProjectSummaryYet')}</p>
        <dl className="sd-project-overview-panel__facts">
          <div className="sd-project-overview-panel__fact-folder">
            <dt>{t('common.projectFolderAlt')}</dt>
            <dd className="sd-project-overview-panel__folder-dd">
              <span className="sd-project-overview-panel__folder-path" title={fullPath}>{fullPath}</span>
              <button
                type="button"
                className="sd-project-overview-panel__open-folder-btn"
                onClick={() => void handleOpenFolder(fullPath)}
                disabled={isOpeningFolder}
                title={t('project.openFolderTitle')}
              >
                <SidebarNavIcon kind="overview" />
                <span>{isOpeningFolder ? t('common.opening') : t('project.openFolder')}</span>
              </button>
              {openFolderNotice ? <span className="sd-project-overview-panel__folder-notice" role="status">{openFolderNotice}</span> : null}
            </dd>
          </div>
          <div><dt>{t('git.branch')}</dt><dd>{project.git.branchName ?? t('common.notDetected')}</dd></div>
          <div><dt>{t('common.recentCommit')}</dt><dd>{project.git.lastCommitHash ? `${project.git.lastCommitHash} · ${project.git.lastCommitMessage ?? ''}` : t('common.noCommitInformation')}</dd></div>
          <div><dt>{t('common.lastUpdated')}</dt><dd>{t(project.updatedAtLabel)}</dd></div>
          <div><dt>{t('common.todoProgress')}</dt><dd>{totalTodos ? `${completedTodos} / ${totalTodos} ${t('common.completed')}` : t('common.todosHaveNotBeenScanned')}</dd></div>
          <div><dt>{t('common.jiraTicketProjects')}</dt><dd>{jiraProjectKeys.join(', ') || t('common.noJiraProjectCodes')}</dd></div>
        </dl>
        <div className="sd-project-overview-panel__stack">
          <h3>{t('common.technologyStack')}</h3>
          {project.techStack.length ? <ul>{project.techStack.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('common.technologyStackNotDetected')}</p>}
        </div>
      </section>

      <section className="sd-project-overview-panel__tickets" aria-label={t('common.jiraTickets')}>
        <header className="sd-project-overview-panel__section-head">
          <div><span className="sd-project-overview-panel__eyebrow">{t('project.workItems')}</span><h2>{t('common.jiraTickets')}</h2></div>
          <StatusBadge label={t('common.ticketCount', { count: project.jira.tickets.length })} tone="accent" mono />
        </header>
        {project.jira.tickets.length ? (
          <div className="sd-project-overview-panel__ticket-table-wrap">
            <table className="sd-project-overview-panel__ticket-table">
              <thead>
                <tr><th scope="col">{t('common.taskKey')}</th><th scope="col">{t('common.taskType')}</th><th scope="col">{t('common.priority')}</th><th scope="col">{t('common.taskName')}</th><th scope="col">{t('common.currentStatus')}</th><th scope="col">{t('common.actions')}</th></tr>
              </thead>
              <tbody>
                {project.jira.tickets.map((ticket) => (
                  <tr key={ticket.key}>
                    <td><code>{ticket.key}</code></td>
                    <td><span className={`sd-project-overview-panel__ticket-type sd-project-overview-panel__ticket-type--${jiraTicketTypeTone(ticket.issueType || 'Task')}`}>{ticket.issueType || 'Task'}</span></td>
                    <td><StatusBadge label={ticket.priority} tone={ticket.priority === 'HIGH' ? 'err' : ticket.priority === 'MEDIUM' ? 'warn' : 'neutral'} /></td>
                    <td><strong className="sd-project-overview-panel__ticket-summary">{ticket.title}</strong></td>
                    <td><StatusBadge label={ticket.statusName?.trim() ?? t(jiraStatusLabel(ticket))} tone={jiraStatusTone(ticket)} /></td>
                    <td><button type="button" className="sd-project-overview-panel__ticket-detail" onClick={() => onOpenJiraTicket?.(ticket.key)}>{t('common.ticketDetailsAlt')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sd-project-overview-panel__empty-tickets" role="status">
            <strong>{t('common.noJiraTickets')}</strong>
            <p>{t('common.noJiraTicketsAreAssignedToThisProject')}</p>
          </div>
        )}
      </section>
    </div>
  )
}
