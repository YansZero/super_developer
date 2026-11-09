import { useEffect, useState } from 'react'
import { JiraError, jiraFailure } from './jiraContracts'
import type { JiraService, TicketFilter, TicketPage } from './jiraContracts'
export function useJiraTickets(service: JiraService, userId: string, cloudId: string, filter: TicketFilter) {
  const [tokens, setTokens] = useState<Array<string | null>>([null])
  const [revision, setRevision] = useState(0)
  const queryKey = `${tokens.length}:${tokens[tokens.length - 1]}:${revision}`
  const [result, setResult] = useState<{ page: TicketPage | null; error: JiraError | null; loading: boolean; queryKey: string }>({ page: null, error: null, loading: true, queryKey: '' })
  const token = tokens[tokens.length - 1]
  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      setResult({ queryKey, page: null, error: null, loading: true })
      try {
        const before = await service.profile(controller.signal)
        if (before.id !== userId || before.selectedCloudId !== cloudId) throw new JiraError('AUTH_REQUIRED')
        const page = await service.tickets(cloudId, filter, token, controller.signal)
        const after = await service.profile(controller.signal)
        if (after.id !== userId || after.selectedCloudId !== cloudId) throw new JiraError('AUTH_REQUIRED')
        if (!controller.signal.aborted) setResult({ queryKey, page, error: null, loading: false })
      } catch (error) { if (!controller.signal.aborted) setResult({ queryKey, page: null, error: jiraFailure(error), loading: false }) }
    }
    void load()
    return () => controller.abort()
  }, [service, userId, cloudId, filter, token, revision, queryKey])
  const visible = result.queryKey === queryKey ? result : { page: null, error: null, loading: true }
  return { ...visible, pageNumber: tokens.length,
    previous: () => setTokens((prev) => prev.length > 1 ? prev.slice(0, -1) : prev),
    next: () => { const next = result.page?.pagination.nextPageToken; if (next && !result.page?.pagination.isLast) setTokens((prev) => [...prev, next]) },
    refresh: () => { setTokens([null]); setRevision((prev) => prev + 1) },
  }
}
