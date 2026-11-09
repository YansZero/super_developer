import { useCallback, useEffect, useRef, useState } from 'react'
import { createJiraClient } from './jiraClient'
import { jiraFailure } from './jiraContracts'
import type { JiraError, JiraOAuthClient, JiraProfile, JiraService } from './jiraContracts'
export const defaultJiraService = createJiraClient()
interface State { phase: 'loading' | 'unconfigured' | 'signedOut' | 'ready' | 'error'; user: JiraProfile | null; error: JiraError | null; missingSettings: string[]; clients: JiraOAuthClient[]; selectedClient: string }
export function useJiraWorkbench(service: JiraService) {
  const [state, setState] = useState<State>({ phase: 'loading', user: null, error: null, missingSettings: [], clients: [], selectedClient: '' })
  const active = useRef<AbortController | null>(null)
  const load = useCallback(async () => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller
    setState((previous) => ({ ...previous, phase: 'loading', user: null, error: null, missingSettings: [] }))
    try {
      const status = await service.status(controller.signal)
      const user = status.configured && status.authenticated ? await service.profile(controller.signal) : null
      if (!controller.signal.aborted) {
        const clients = status.clients ?? []
        setState((previous) => ({ ...previous, phase: !status.configured ? 'unconfigured' : user ? 'ready' : 'signedOut', user, error: null, missingSettings: status.missingSettings ?? [], clients, selectedClient: clients.some((client) => client.key === previous.selectedClient) ? previous.selectedClient : clients[0]?.key ?? '' }))
      }
    } catch (error) { if (!controller.signal.aborted) { const failure = jiraFailure(error); setState((previous) => ({ ...previous, phase: failure.code === 'AUTH_REQUIRED' ? 'signedOut' : 'error', user: null, error: failure, missingSettings: [] })) } }
  }, [service])
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (!disposed) void load() }); return () => { disposed = true; active.current?.abort() } }, [load])
  const logout = useCallback(async () => {
    active.current?.abort(); const controller = new AbortController(); active.current = controller
    setState((previous) => ({ ...previous, phase: 'loading', user: null, error: null, missingSettings: [] }))
    try { await service.logout(controller.signal); if (!controller.signal.aborted) setState((previous) => ({ ...previous, phase: 'signedOut', user: null, error: null, missingSettings: [] })) }
    catch (error) { if (!controller.signal.aborted) setState((previous) => ({ ...previous, phase: 'error', user: null, error: jiraFailure(error), missingSettings: [] })) }
  }, [service])
  return { state, reload: load, logout, selectClient: (selectedClient: string) => setState((previous) => ({ ...previous, selectedClient })) }
}
