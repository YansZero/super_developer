import type { JiraTicketSummary, ProjectItem } from '../../shared/types/domain'

/** Keep a Jira ticket owned by at most one local project. */
export function uniqueJiraAssignments(projects: ProjectItem[], projectId: string, tickets: JiraTicketSummary[]) {
  const owners = new Map<string, string>()
  for (const project of projects) {
    if (project.id === projectId) continue
    for (const ticket of project.jira.tickets) owners.set(ticket.key, project.name)
  }
  const conflicts = [...new Set(tickets.map((ticket) => ticket.key))].filter((key) => owners.has(key))
  if (conflicts.length > 0) {
    const projectsByName = [...new Set(conflicts.map((key) => owners.get(key)))].join('、')
    throw new Error(`${conflicts.join('、')} 已指派給專案「${projectsByName}」，一張 Ticket 只能指派給一個專案。`)
  }
  return [...new Map(tickets.map((ticket) => [ticket.key, ticket])).values()]
}
