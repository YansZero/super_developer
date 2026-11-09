import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  GitHubAgentState,
  GitHubIntegrationSnapshot,
  GitHubRepoMappingPayload,
} from '../../../../shared/types/domain'
import {
  FIXED_GITHUB_VERIFICATION_URI,
  GitHubApiError,
  createHttpGitHubServiceClient,
  createInitialDisconnectedGitHubSnapshot,
  type GitHubServiceContract,
} from './githubClient'

export interface GitHubFeedbackMessage {
  tone: 'ok' | 'warn' | 'err'
  text: string
}

export interface UseGitHubIntegrationOptions {
  service?: GitHubServiceContract
  openExternalVerificationUrl?: (url: 'https://github.com/login/device') => void
}

export interface UseGitHubIntegrationResult {
  github: GitHubIntegrationSnapshot
  agentState: GitHubAgentState
  agentError: string | null
  isBusy: boolean
  isPolling: boolean
  feedback: GitHubFeedbackMessage | null
  clearFeedback: () => void
  reloadGitHubStatus: () => Promise<boolean>
  saveClientId: (clientId: string) => Promise<boolean>
  startDeviceFlow: (clientId?: string) => Promise<boolean>
  openGitHubAndStartPolling: () => Promise<boolean>
  pollDeviceFlowOnce: () => Promise<boolean>
  cancelDeviceFlow: () => Promise<boolean>
  refreshPublicRepositories: () => Promise<boolean>
  mapProjectToRepository: (payload: GitHubRepoMappingPayload) => Promise<boolean>
  unmapProjectRepository: (projectId: string) => Promise<boolean>
  disconnectGitHub: () => Promise<boolean>
}

function defaultOpenVerificationUrl(url: 'https://github.com/login/device') {
  if (url !== FIXED_GITHUB_VERIFICATION_URI) {
    return
  }
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(FIXED_GITHUB_VERIFICATION_URI, '_blank', 'noopener,noreferrer')
  }
}

export function useGitHubIntegration(
  options: UseGitHubIntegrationOptions = {},
): UseGitHubIntegrationResult {
  const service = useMemo(
    () => options.service ?? createHttpGitHubServiceClient(),
    [options.service],
  )
  const openExternalUrl = useMemo(
    () => options.openExternalVerificationUrl ?? defaultOpenVerificationUrl,
    [options.openExternalVerificationUrl],
  )

  const [github, setGitHub] = useState<GitHubIntegrationSnapshot>(() =>
    createInitialDisconnectedGitHubSnapshot(),
  )
  const [agentState, setAgentState] = useState<GitHubAgentState>('checking')
  const [agentError, setAgentError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [feedback, setFeedback] = useState<GitHubFeedbackMessage | null>(null)

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearPollTimer()
    }
  }, [clearPollTimer])

  const handleFailure = useCallback((err: unknown, contextLabel: string) => {
    const isOffline =
      err instanceof GitHubApiError && err.errorCode === 'AGENT_OFFLINE'
    const message =
      err instanceof Error ? err.message : `${contextLabel}失敗，請稍後重試。`

    if (isOffline) {
      setAgentState('offline')
      setAgentError(message)
      setFeedback({
        tone: 'warn',
        text: `${contextLabel}：Local Agent 離線（${message}）`,
      })
      return
    }

    setFeedback({
      tone: 'err',
      text: `${contextLabel}：${message}`,
    })
  }, [])

  const reloadGitHubStatus = useCallback(async () => {
    setAgentState('checking')
    setIsBusy(true)
    try {
      const snap = await service.getGitHubStatus()
      if (!mountedRef.current) return false
      setGitHub(snap)
      setAgentState('online')
      setAgentError(null)
      return true
    } catch (err) {
      if (!mountedRef.current) return false
      const message =
        err instanceof Error
          ? err.message
          : '無法連接本機 GitHub OAuth 服務。'
      setAgentState('offline')
      setAgentError(message)
      setGitHub(createInitialDisconnectedGitHubSnapshot())
      return false
    } finally {
      if (mountedRef.current) {
        setIsBusy(false)
      }
    }
  }, [service])

  useEffect(() => {
    let active = true
    service
      .getGitHubStatus()
      .then((snap) => {
        if (!active) return
        setGitHub(snap)
        setAgentState('online')
        setAgentError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        const message =
          err instanceof Error
            ? err.message
            : '無法連接本機 GitHub OAuth 服務。'
        setAgentState('offline')
        setAgentError(message)
        setGitHub(createInitialDisconnectedGitHubSnapshot())
      })
    return () => {
      active = false
    }
  }, [service])

  const saveClientId = useCallback(
    async (clientId: string) => {
      setIsBusy(true)
      try {
        const snap = await service.saveGitHubClientId(clientId)
        if (!mountedRef.current) return false
        setGitHub(snap)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已保存 GitHub OAuth Client ID（${snap.clientId}）。`,
        })
        return true
      } catch (err) {
        if (mountedRef.current) {
          handleFailure(err, '儲存 Client ID 失敗')
        }
        return false
      } finally {
        if (mountedRef.current) {
          setIsBusy(false)
        }
      }
    },
    [service, handleFailure],
  )

  const startDeviceFlow = useCallback(
    async (clientId?: string) => {
      clearPollTimer()
      setIsBusy(true)
      try {
        const snap = await service.startDeviceFlow(clientId)
        if (!mountedRef.current) return false
        setGitHub(snap)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: '已取得一次性驗證碼，請複製 User Code 並點擊「開啟 GitHub 授權」以開啟驗證頁面並啟動輪詢。',
        })
        return true
      } catch (err) {
        if (mountedRef.current) {
          handleFailure(err, '啟動 GitHub Device Flow 失敗')
        }
        return false
      } finally {
        if (mountedRef.current) {
          setIsBusy(false)
        }
      }
    },
    [service, clearPollTimer, handleFailure],
  )

  const pollDeviceFlowOnce = useCallback(async () => {
    const activeSessionId = github.pendingSession?.sessionId
    if (!activeSessionId || !github.pendingSession?.pollingAuthorized) {
      return false
    }

    setIsPolling(true)
    try {
      const res = await service.pollDeviceFlow(activeSessionId)
      if (!mountedRef.current) return false
      setGitHub(res.github)
      setAgentState('online')
      setAgentError(null)

      if (res.pollOutcome === 'connected' && res.github.account) {
        clearPollTimer()
        setFeedback({
          tone: 'ok',
          text: `已透過 GET /user 驗證並連結 GitHub 帳號 @${res.github.account.login}（共載入 ${res.github.repositories.length} 個公開 Repository）。`,
        })
      } else if (res.pollOutcome === 'slow_down') {
        setFeedback({
          tone: 'warn',
          text: `GitHub 要求放慢輪詢頻率（slow_down），已自動調整輪詢間隔為 ${res.github.pendingSession?.intervalSeconds ?? res.intervalSeconds ?? 10} 秒。`,
        })
      } else if (res.pollOutcome === 'expired') {
        clearPollTimer()
        setFeedback({
          tone: 'warn',
          text: 'GitHub Device Flow 驗證碼已過期（expired），請重新發起授權。',
        })
      } else if (res.pollOutcome === 'denied') {
        clearPollTimer()
        setFeedback({
          tone: 'err',
          text: '使用者已拒絕 GitHub OAuth 授權（access_denied）。',
        })
      } else if (res.pollOutcome === 'pending') {
        setFeedback({
          tone: 'ok',
          text: '等待使用者於 GitHub 完成輸入驗證碼與授權（authorization_pending）...',
        })
      }
      return true
    } catch (err) {
      if (mountedRef.current) {
        clearPollTimer()
        handleFailure(err, '輪詢 GitHub 授權狀態失敗')
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsPolling(false)
      }
    }
  }, [github.pendingSession, service, clearPollTimer, handleFailure])

  const openGitHubAndStartPolling = useCallback(async () => {
    const activeSessionId = github.pendingSession?.sessionId
    if (!activeSessionId) {
      return false
    }
    setIsBusy(true)
    try {
      const res = await service.authorizeDeviceFlowPolling(activeSessionId)
      if (!mountedRef.current) return false
      openExternalUrl(FIXED_GITHUB_VERIFICATION_URI)
      setGitHub(res.github)
      setAgentState('online')
      setAgentError(null)

      // 立即執行第一次輪詢，後續依 intervalSeconds 排程
      setIsPolling(true)
      const pollRes = await service.pollDeviceFlow(activeSessionId)
      if (!mountedRef.current) return false
      setGitHub(pollRes.github)

      if (pollRes.pollOutcome === 'connected' && pollRes.github.account) {
        clearPollTimer()
        setFeedback({
          tone: 'ok',
          text: `已透過 GET /user 驗證並連結 GitHub 帳號 @${pollRes.github.account.login}（共載入 ${pollRes.github.repositories.length} 個公開 Repository）。`,
        })
      } else if (pollRes.pollOutcome === 'slow_down') {
        setFeedback({
          tone: 'warn',
          text: `已開啟 GitHub 授權頁面；伺服器要求放慢輪詢（slow_down），間隔已調整為 ${pollRes.github.pendingSession?.intervalSeconds ?? 10} 秒。`,
        })
      } else if (pollRes.pollOutcome === 'expired') {
        clearPollTimer()
        setFeedback({
          tone: 'warn',
          text: 'GitHub Device Flow 驗證碼已過期（expired），請重新發起授權。',
        })
      } else if (pollRes.pollOutcome === 'denied') {
        clearPollTimer()
        setFeedback({
          tone: 'err',
          text: '使用者已拒絕 GitHub OAuth 授權（access_denied）。',
        })
      } else {
        setFeedback({
          tone: 'ok',
          text: `已開啟 ${FIXED_GITHUB_VERIFICATION_URI} 並開始依 ${pollRes.github.pendingSession?.intervalSeconds ?? 5} 秒間隔輪詢授權狀態。`,
        })
      }
      return true
    } catch (err) {
      if (mountedRef.current) {
        clearPollTimer()
        handleFailure(err, '開啟 GitHub 授權與啟動輪詢失敗')
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsBusy(false)
        setIsPolling(false)
      }
    }
  }, [github.pendingSession, service, openExternalUrl, clearPollTimer, handleFailure])

  // 當處於 pending 且使用者已按「開啟 GitHub 授權」時，依伺服器回傳之 intervalSeconds 排程下一次輪詢
  useEffect(() => {
    clearPollTimer()
    if (
      github.flowState !== 'pending' ||
      !github.pendingSession ||
      !github.pendingSession.pollingAuthorized
    ) {
      return
    }

    const delayMs = Math.max(1, github.pendingSession.intervalSeconds) * 1000
    pollTimerRef.current = setTimeout(() => {
      void pollDeviceFlowOnce()
    }, delayMs)

    return () => {
      clearPollTimer()
    }
  }, [
    github.flowState,
    github.pendingSession,
    pollDeviceFlowOnce,
    clearPollTimer,
  ])

  const cancelDeviceFlow = useCallback(async () => {
    clearPollTimer()
    setIsBusy(true)
    try {
      const snap = await service.cancelDeviceFlow(github.pendingSession?.sessionId)
      if (!mountedRef.current) return false
      setGitHub(snap)
      setAgentState('online')
      setAgentError(null)
      setFeedback({
        tone: 'warn',
        text: '已取消 GitHub Device Flow 授權並清除暫存驗證碼。',
      })
      return true
    } catch (err) {
      if (mountedRef.current) {
        handleFailure(err, '取消 GitHub 授權流程失敗')
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsBusy(false)
      }
    }
  }, [service, github.pendingSession, clearPollTimer, handleFailure])

  const refreshPublicRepositories = useCallback(async () => {
    setIsBusy(true)
    try {
      const snap = await service.refreshPublicRepositories()
      if (!mountedRef.current) return false
      setGitHub(snap)
      setAgentState('online')
      setAgentError(null)
      setFeedback({
        tone: 'ok',
        text: `已重新整理公開 Repository 清單（共 ${snap.repositories.length} 個公開儲存庫）。`,
      })
      return true
    } catch (err) {
      if (mountedRef.current) {
        handleFailure(err, '重新整理公開 Repository 清單失敗')
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsBusy(false)
      }
    }
  }, [service, handleFailure])

  const mapProjectToRepository = useCallback(
    async (payload: GitHubRepoMappingPayload) => {
      setIsBusy(true)
      try {
        const res = await service.upsertProjectRepoMapping(payload)
        if (!mountedRef.current) return false
        setGitHub(res.github)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已將公開儲存庫「${res.mapping.repoFullName}」對應至本機專案「${res.mapping.projectName}」（不建立遠端 repo、不修改 Git 設定）。`,
        })
        return true
      } catch (err) {
        if (mountedRef.current) {
          handleFailure(err, '設定專案與公開 Repository 對應失敗')
        }
        return false
      } finally {
        if (mountedRef.current) {
          setIsBusy(false)
        }
      }
    },
    [service, handleFailure],
  )

  const unmapProjectRepository = useCallback(
    async (projectId: string) => {
      setIsBusy(true)
      try {
        const res = await service.removeProjectRepoMapping(projectId)
        if (!mountedRef.current) return false
        setGitHub(res.github)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已移除本機專案（${res.removedProjectId}）的 GitHub Repository 對應。`,
        })
        return true
      } catch (err) {
        if (mountedRef.current) {
          handleFailure(err, '移除專案對應失敗')
        }
        return false
      } finally {
        if (mountedRef.current) {
          setIsBusy(false)
        }
      }
    },
    [service, handleFailure],
  )

  const disconnectGitHub = useCallback(async () => {
    clearPollTimer()
    setIsBusy(true)
    try {
      const snap = await service.disconnectGitHub()
      if (!mountedRef.current) return false
      setGitHub(snap)
      setAgentState('online')
      setAgentError(null)
      setFeedback({
        tone: 'ok',
        text: '已解除 GitHub OAuth 連線：已刪除 OS Keyring 中的 access token 並清除帳號與儲存庫對應。',
      })
      return true
    } catch (err) {
      if (mountedRef.current) {
        handleFailure(err, '解除 GitHub 連線失敗')
      }
      return false
    } finally {
      if (mountedRef.current) {
        setIsBusy(false)
      }
    }
  }, [service, clearPollTimer, handleFailure])

  const clearFeedback = useCallback(() => {
    setFeedback(null)
  }, [])

  return {
    github,
    agentState,
    agentError,
    isBusy,
    isPolling,
    feedback,
    clearFeedback,
    reloadGitHubStatus,
    saveClientId,
    startDeviceFlow,
    openGitHubAndStartPolling,
    pollDeviceFlowOnce,
    cancelDeviceFlow,
    refreshPublicRepositories,
    mapProjectToRepository,
    unmapProjectRepository,
    disconnectGitHub,
  }
}
