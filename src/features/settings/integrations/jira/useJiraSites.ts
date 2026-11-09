import { useCallback, useEffect, useRef, useState } from 'react'
import { createJiraSiteClient } from './jiraSiteClient'
import type { JiraSiteServiceContract } from './jiraSiteContracts'
import { JiraSiteError } from './jiraSiteContracts'
import { deriveJiraSiteView, initialJiraSitesState, siteError } from './jiraSiteState'
import type { JiraSitesState } from './jiraSiteState'

const defaultService = createJiraSiteClient()

export function useJiraSites(service: JiraSiteServiceContract = defaultService) {
  const [state, setState] = useState<JiraSitesState>(initialJiraSitesState)
  const [now, setNow] = useState(Date.now)
  const stateRef = useRef(state)
  const generation = useRef(0)
  const active = useRef<AbortController | null>(null)
  const saving = useRef(false)
  const update = useCallback((next: JiraSitesState) => {
    stateRef.current = next
    setState(next)
    setNow(Date.now())
  }, [])
  const cancel = useCallback(() => {
    generation.current += 1
    active.current?.abort()
  }, [])

  const load = useCallback(async (identityRetry = true) => {
    if (saving.current || (stateRef.current.error?.retryAt ?? 0) > Date.now()) return
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const token = ++generation.current
    update({ ...initialJiraSitesState })
    try {
      let snapshot
      try { snapshot = await service.getSnapshot(controller.signal) }
      catch (error) {
        if (!identityRetry || siteError(error).code !== 'IDENTITY_CHANGED' || controller.signal.aborted) throw error
        snapshot = await service.getSnapshot(controller.signal)
      }
      if (token !== generation.current || controller.signal.aborted) return
      update({ snapshot, draft: snapshot.selectedCloudId ?? '', phase: 'ready', error: null, saved: false })
    } catch (error) {
      if (token !== generation.current || controller.signal.aborted) return
      update({ ...initialJiraSitesState, phase: 'error', error: siteError(error) })
    }
  }, [service, update])

  useEffect(() => {
    saving.current = false
    stateRef.current = initialJiraSitesState
    let disposed = false
    queueMicrotask(() => { if (!disposed) void load() })
    return () => { disposed = true; cancel() }
  }, [load, cancel])

  const retryAt = state.error?.retryAt ?? 0
  useEffect(() => {
    if (retryAt <= Date.now()) return
    const timer = setTimeout(() => setNow(Date.now()), Math.min(retryAt - Date.now() + 1, 2147483647))
    return () => clearTimeout(timer)
  }, [retryAt, now])

  async function save() {
    const original = stateRef.current
    if (saving.current || !deriveJiraSiteView(original, Date.now()).canSave || !original.snapshot) return
    saving.current = true
    active.current?.abort()
    const controller = new AbortController()
    active.current = controller
    const token = ++generation.current
    update({ ...original, phase: 'saving', error: null, saved: false })
    let posted = false
    let reloadIdentity = false
    try {
      await service.selectSite(original.draft, controller.signal)
      posted = true
      const snapshot = await service.getSnapshot(controller.signal)
      if (token !== generation.current || controller.signal.aborted) return
      if (snapshot.userKey !== original.snapshot.userKey) throw new JiraSiteError('IDENTITY_CHANGED')
      if (snapshot.selectedCloudId !== original.draft) throw new JiraSiteError('INVALID_RESPONSE')
      update({ snapshot, draft: snapshot.selectedCloudId ?? '', phase: 'ready', error: null, saved: true })
    } catch (error) {
      if (token !== generation.current || controller.signal.aborted) return
      const failure = siteError(error)
      if (failure.code === 'AUTH_REQUIRED' || failure.code === 'IDENTITY_CHANGED') {
        update({ ...initialJiraSitesState, phase: 'error', error: failure })
        reloadIdentity = failure.code === 'IDENTITY_CHANGED'
      } else {
        update({ ...original, phase: posted ? 'uncertain' : 'ready', error: failure, saved: false })
      }
    } finally {
      if (token === generation.current) saving.current = false
    }
    if (reloadIdentity) void load(false)
  }

  function choose(draft: string) {
    const current = stateRef.current
    if (current.phase !== 'ready' || !current.snapshot?.sites.some((site) => site.cloudId === draft)) return
    update({ ...current, draft, saved: false })
  }

  return { state, view: deriveJiraSiteView(state, now), choose, save, reload: () => load() }
}
