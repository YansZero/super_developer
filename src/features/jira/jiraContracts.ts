export type TicketFilter = 'assigned' | 'reported' | 'inProgress' | 'pending' | 'done'
export interface JiraProfile { id: string; name: string; selectedCloudId: string | null }
export interface JiraOAuthClient { key: string; label: string; clientId?: string }
export interface JiraStatus { configured: boolean; authenticated: boolean; missingSettings?: string[]; clients?: JiraOAuthClient[] }
export interface JiraComment { id: string; author: string; created: string; body: string }
export interface JiraAttachment { id: string; filename: string; mimeType: string; size: number }
export interface JiraTicket {
  id: string; key: string; summary: string
  status: { name: string; category: string }; priority: string; issueType: string
  assignee: { accountId: string; displayName: string } | null
  reporter?: { accountId: string; displayName: string } | null
  created?: string
  updated: string; url: string; description?: string | null; comments?: JiraComment[]; attachments?: JiraAttachment[]
}
export interface TicketPage { tickets: JiraTicket[]; pagination: { nextPageToken: string | null; isLast: boolean } }
export interface JiraService {
  status(signal?: AbortSignal): Promise<JiraStatus>
  profile(signal?: AbortSignal): Promise<JiraProfile>
  logout(signal?: AbortSignal): Promise<void>
  tickets(cloudId: string, filter: TicketFilter, token: string | null, signal?: AbortSignal): Promise<TicketPage>
  projectTickets(cloudId: string, projectKey: string, signal?: AbortSignal): Promise<JiraTicket[]>
  detail(cloudId: string, key: string, signal?: AbortSignal): Promise<JiraTicket>
}
export type JiraErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN' | 'NOT_FOUND' | 'RATE_LIMITED' | 'UNCONFIGURED' | 'UNAVAILABLE' | 'INVALID_REQUEST' | 'INVALID_RESPONSE' | 'OFFLINE'
export class JiraError extends Error {
  constructor(public readonly code: JiraErrorCode, public readonly retryAt = 0) { super(code); this.name = 'JiraError' }
}
export const jiraMessages: Record<JiraErrorCode, string> = {
  AUTH_REQUIRED: 'jira.error.authRequired', FORBIDDEN: 'jira.error.forbidden',
  NOT_FOUND: 'jira.error.notFound', RATE_LIMITED: 'jira.error.rateLimited',
  UNCONFIGURED: 'jira.error.unconfigured', UNAVAILABLE: 'jira.error.unavailable',
  INVALID_REQUEST: 'jira.error.invalidRequest', INVALID_RESPONSE: 'jira.error.invalidResponse',
  OFFLINE: 'jira.error.offline',
}
export function jiraFailure(error: unknown): JiraError { return error instanceof JiraError ? error : new JiraError('UNAVAILABLE') }
