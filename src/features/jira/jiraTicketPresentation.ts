import type { JiraTicket } from './jiraContracts'
import type { JiraTicketSummary } from '../../shared/types/domain'

export type JiraTicketStatusTone = 'qa' | 'inProgress' | 'done' | 'discard' | 'pending'
export type JiraTicketTypeTone = 'story' | 'task' | 'subtask' | 'bug' | 'other'
export type JiraTicketPriorityTone = 'high' | 'medium' | 'other'

export function jiraTicketProjectKeys(tickets: JiraTicketSummary[]): string[] {
  return [...new Set(tickets.flatMap(({ key }) => {
    const match = key.trim().match(/^([a-z][a-z0-9_-]*)-\d+$/i)
    return match ? [match[1].toUpperCase()] : []
  }))]
}

export function jiraTicketToSummary(ticket: JiraTicket): JiraTicketSummary {
  const status = ticket.status.category.trim().toLocaleUpperCase()
  const priority = ticket.priority.trim().toLocaleLowerCase()
  return {
    key: ticket.key,
    title: ticket.summary,
    issueType: ticket.issueType,
    statusName: ticket.status.name,
    status: status === 'DONE' || status === 'COMPLETE' ? 'DONE' : status.includes('PROGRESS') || status === 'INDETERMINATE' ? 'IN_PROGRESS' : 'TODO',
    priority: /highest|high|critical|blocker/.test(priority) ? 'HIGH' : /medium|normal|major/.test(priority) ? 'MEDIUM' : 'LOW',
    assignee: ticket.assignee?.displayName ?? '未指派',
    updatedAt: ticket.updated,
    summaryText: ticket.summary,
  }
}

export function jiraTicketStatusTone(status: JiraTicket['status']): JiraTicketStatusTone {
  const name = status.name.trim().toLocaleLowerCase()
  if (/\bqa\b|quality assurance|測試|驗收/.test(name)) return 'qa'
  if (/discard|cancel|捨棄|取消/.test(name)) return 'discard'
  const category = status.category.trim().toLocaleUpperCase()
  if (category === 'DONE' || category === 'COMPLETE' || /done|complete|resolved|closed/.test(name)) return 'done'
  if (category === 'IN_PROGRESS' || category === 'IN PROGRESS' || category === 'INDETERMINATE') return 'inProgress'
  return 'pending'
}

export function jiraTicketTypeTone(issueType: string): JiraTicketTypeTone {
  const type = issueType.trim().toLocaleLowerCase()
  if (type.includes('sub-task') || type.includes('subtask')) return 'subtask'
  if (type.includes('story')) return 'story'
  if (type.includes('task')) return 'task'
  if (type.includes('bug')) return 'bug'
  return 'other'
}

export function jiraTicketPriorityTone(priority: string): JiraTicketPriorityTone {
  const value = priority.trim().toLocaleLowerCase()
  if (/highest|high|critical|blocker/.test(value)) return 'high'
  if (/medium|normal|major/.test(value)) return 'medium'
  return 'other'
}

export function jiraTicketGroup(statusTone: JiraTicketStatusTone): 'inProgress' | 'pending' | 'done' {
  if (statusTone === 'done' || statusTone === 'discard') return 'done'
  if (statusTone === 'qa' || statusTone === 'inProgress') return 'inProgress'
  return 'pending'
}
