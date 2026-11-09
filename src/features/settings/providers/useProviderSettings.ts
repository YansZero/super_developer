import { getProviderPresentation } from '../../../shared/providers/providerPresentation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CustomProviderCreatePayload,
  ProviderAgentState,
  ProviderConfigUpdatePayload,
  ProviderId,
  ProviderLoginOutcome,
  ProviderSummary,
} from '../../../shared/types/domain'
import { INITIAL_BUILTIN_PROVIDERS } from '../../../shared/data/fixtures'
import {
  ProviderApiError,
  createHttpProviderServiceClient,
  markProvidersAgentOffline,
  type ProviderServiceContract,
} from './providerClient'

export interface ProviderFeedbackMessage {
  tone: 'ok' | 'warn' | 'err' | 'info'
  text: string
}

export interface UseProviderSettingsResult {
  providers: ProviderSummary[]
  agentState: ProviderAgentState
  agentError: string | null
  busyProviderIds: Record<string, boolean>
  isProbingAll: boolean
  focusedProviderId: ProviderId | null
  feedback: ProviderFeedbackMessage | null
  setFocusedProviderId: (providerId: ProviderId | null) => void
  clearFeedback: () => void
  reloadProviders: () => Promise<void>
  probeSingleProvider: (providerId: ProviderId) => Promise<void>
  probeAllProviders: () => Promise<void>
  saveProviderConfig: (
    providerId: ProviderId,
    payload: ProviderConfigUpdatePayload,
  ) => Promise<boolean>
  createCustomProvider: (payload: CustomProviderCreatePayload) => Promise<boolean>
  deleteCustomProvider: (providerId: ProviderId) => Promise<boolean>
  triggerProviderLogin: (
    providerId: ProviderId,
  ) => Promise<ProviderLoginOutcome | null>
}

export function useProviderSettings(
  customService?: ProviderServiceContract,
): UseProviderSettingsResult {
  const service = useMemo(
    () => customService ?? createHttpProviderServiceClient(),
    [customService],
  )

  const [providers, setProviders] = useState<ProviderSummary[]>(
    () => INITIAL_BUILTIN_PROVIDERS,
  )
  const [agentState, setAgentState] = useState<ProviderAgentState>('checking')
  const [agentError, setAgentError] = useState<string | null>(null)
  const [busyProviderIds, setBusyProviderIds] = useState<Record<string, boolean>>({})
  const [isProbingAll, setIsProbingAll] = useState(false)
  const [focusedProviderId, setFocusedProviderId] = useState<ProviderId | null>(null)
  const [feedback, setFeedback] = useState<ProviderFeedbackMessage | null>(null)

  const setProviderBusy = useCallback((providerId: string, busy: boolean) => {
    setBusyProviderIds((prev) => ({
      ...prev,
      [providerId]: busy,
    }))
  }, [])

  const handleAgentFailure = useCallback((err: unknown, contextLabel: string) => {
    const isOffline =
      err instanceof ProviderApiError && err.errorCode === 'AGENT_OFFLINE'
    const message =
      err instanceof Error ? err.message : `${contextLabel}失敗，請稍後重試。`

    if (isOffline) {
      setAgentState('offline')
      setAgentError(message)
      setProviders((prev) => markProvidersAgentOffline(prev))
      setFeedback({
        tone: 'warn',
        text: `${contextLabel}：${message}`,
      })
      return
    }

    setFeedback({
      tone: 'err',
      text: `${contextLabel}：${message}`,
    })
  }, [])

  const reloadProviders = useCallback(async () => {
    setAgentState('checking')
    try {
      const list = await service.listProviders()
      setProviders(list)
      setAgentState('online')
      setAgentError(null)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '無法連接本機 Provider 服務，目前顯示未檢查狀態。'
      setAgentState('offline')
      setAgentError(message)
      setProviders((prev) => markProvidersAgentOffline(prev))
    }
  }, [service])

  useEffect(() => {
    let active = true
    service
      .listProviders()
      .then((list) => {
        if (!active) return
        setProviders(list)
        setAgentState('online')
        setAgentError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        const message =
          err instanceof Error
            ? err.message
            : '無法連接本機 Provider 服務，目前顯示未檢查狀態。'
        setAgentState('offline')
        setAgentError(message)
        setProviders((prev) => markProvidersAgentOffline(prev))
      })
    return () => {
      active = false
    }
  }, [service])

  const probeSingleProvider = useCallback(
    async (providerId: ProviderId) => {
      setProviderBusy(providerId, true)
      try {
        const res = await service.probeProvider(providerId)
        setProviders(res.providers)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: res.provider.statusKind === 'normal' ? 'ok'
            : getProviderPresentation(res.provider).isAuthUnconfirmed ? 'info' : 'warn',
          text: `[${res.provider.name}] 檢查完成：${getProviderPresentation(res.provider).statusText}`,
        })
      } catch (err) {
        handleAgentFailure(err, '測試連線 / 檢查失敗')
      } finally {
        setProviderBusy(providerId, false)
      }
    },
    [service, setProviderBusy, handleAgentFailure],
  )

  const probeAllProviders = useCallback(async () => {
    setIsProbingAll(true)
    try {
      const res = await service.probeAllProviders()
      setProviders(res.providers)
      setAgentState('online')
      setAgentError(null)
      setFeedback({
        tone: 'ok',
        text: `已完成全部 ${res.providers.length} 個 Provider 的本機探針檢查。`,
      })
    } catch (err) {
      handleAgentFailure(err, '批次檢查所有 Provider 失敗')
    } finally {
      setIsProbingAll(false)
    }
  }, [service, handleAgentFailure])

  const saveProviderConfig = useCallback(
    async (providerId: ProviderId, payload: ProviderConfigUpdatePayload) => {
      setProviderBusy(providerId, true)
      try {
        const res = await service.updateProviderConfig(providerId, payload)
        setProviders(res.providers)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `[${res.provider.name}] 已儲存本機設定（路徑：${res.provider.cliPath}）。`,
        })
        return true
      } catch (err) {
        handleAgentFailure(err, '儲存 Provider 設定失敗')
        return false
      } finally {
        setProviderBusy(providerId, false)
      }
    },
    [service, setProviderBusy, handleAgentFailure],
  )

  const createCustomProvider = useCallback(
    async (payload: CustomProviderCreatePayload) => {
      try {
        const res = await service.addCustomProvider(payload)
        setProviders(res.providers)
        setAgentState('online')
        setAgentError(null)
        setFocusedProviderId(res.provider.id)
        setFeedback({
          tone: 'ok',
          text: `已新增自訂 CLI Provider「${res.provider.name}」。`,
        })
        return true
      } catch (err) {
        handleAgentFailure(err, '新增自訂 Provider 失敗')
        return false
      }
    },
    [service, handleAgentFailure],
  )

  const deleteCustomProvider = useCallback(
    async (providerId: ProviderId) => {
      setProviderBusy(providerId, true)
      try {
        const res = await service.removeCustomProvider(providerId)
        setProviders(res.providers)
        setAgentState('online')
        setAgentError(null)
        if (focusedProviderId === providerId) {
          setFocusedProviderId(null)
        }
        setFeedback({
          tone: 'ok',
          text: `已移除自訂 Provider（${res.removedId}）。`,
        })
        return true
      } catch (err) {
        handleAgentFailure(err, '移除自訂 Provider 失敗')
        return false
      } finally {
        setProviderBusy(providerId, false)
      }
    },
    [service, focusedProviderId, setProviderBusy, handleAgentFailure],
  )

  const triggerProviderLogin = useCallback(
    async (providerId: ProviderId) => {
      setProviderBusy(providerId, true)
      try {
        const res = await service.initiateProviderLogin(providerId)
        setProviders(res.providers)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone:
            res.login.outcome === 'authenticated_after_login' ? 'ok' : 'warn',
          text: `[${res.provider.name}] ${res.login.message}`,
        })
        return res.login
      } catch (err) {
        handleAgentFailure(err, '啟動 Provider 登入流程失敗')
        return null
      } finally {
        setProviderBusy(providerId, false)
      }
    },
    [service, setProviderBusy, handleAgentFailure],
  )

  const clearFeedback = useCallback(() => {
    setFeedback(null)
  }, [])

  return {
    providers,
    agentState,
    agentError,
    busyProviderIds,
    isProbingAll,
    focusedProviderId,
    feedback,
    setFocusedProviderId,
    clearFeedback,
    reloadProviders,
    probeSingleProvider,
    probeAllProviders,
    saveProviderConfig,
    createCustomProvider,
    deleteCustomProvider,
    triggerProviderLogin,
  }
}
