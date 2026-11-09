import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ExternalMcpServerEntry,
  McpServerDocument,
  ProviderId,
  TargetDescriptor,
} from '../../shared/types/domain'
import { createMcpClient, type McpServiceContract, type McpUpsertPayload } from './mcpClient'
import type { DispatchJob } from '../projects/detail/dispatchClient'

export interface McpFeedback {
  tone: 'ok' | 'warn' | 'error'
  text: string
}

export function useMcpServers(customClient?: McpServiceContract) {
  const client = useMemo(() => customClient ?? createMcpClient(), [customClient])
  const [servers, setServers] = useState<McpServerDocument[]>([])
  const [externalServers, setExternalServers] = useState<ExternalMcpServerEntry[]>([])
  const [targets, setTargets] = useState<TargetDescriptor[]>([])
  const [libraryPath, setLibraryPath] = useState<string>('super_developer/library/mcps')
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [feedback, setFeedback] = useState<McpFeedback | null>(null)
  const [activeCheckJob, setActiveCheckJob] = useState<{ serverName: string; job: DispatchJob } | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await client.listMcpServers()
      setServers(res.servers)
      setExternalServers(res.externalServers)
      setTargets(res.targets)
      if (res.libraryPath) setLibraryPath(res.libraryPath)
      return true
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : '無法載入 MCP 清單。',
      })
      return false
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const upsertServerInState = useCallback((updated: McpServerDocument, oldName?: string) => {
    setServers((prev) => {
      const filtered = oldName ? prev.filter((item) => item.name !== oldName) : prev
      const exists = filtered.some((item) => item.name === updated.name)
      const next = exists
        ? filtered.map((item) => (item.name === updated.name ? updated : item))
        : [...filtered, updated]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [])

  useEffect(() => {
    if (!activeCheckJob || !['queued', 'running'].includes(activeCheckJob.job.status)) return
    let cancelled = false
    const timer = setInterval(() => {
      client
        .pollCheckJob(activeCheckJob.serverName, activeCheckJob.job.id)
        .then((res) => {
          if (cancelled) return
          if (res.server) upsertServerInState(res.server)
          if (res.job) {
            setActiveCheckJob(
              ['queued', 'running'].includes(res.job.status)
                ? { serverName: activeCheckJob.serverName, job: res.job }
                : null,
            )
          }
        })
        .catch(() => {
          // ignore transient poll error
        })
    }, 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [activeCheckJob, client, upsertServerInState])

  const createServer = useCallback(
    async (payload: McpUpsertPayload) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const created = await client.createMcpServer(payload)
        upsertServerInState(created)
        setFeedback({ tone: 'ok', text: `已建立 MCP Server「${created.name}」。` })
        return created
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '建立 MCP Server 失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertServerInState],
  )

  const updateServer = useCallback(
    async (name: string, payload: McpUpsertPayload) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const updated = await client.updateMcpServer(name, payload)
        upsertServerInState(updated, name)
        setFeedback({ tone: 'ok', text: `已儲存並同步 MCP Server「${updated.name}」。` })
        return updated
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '更新 MCP Server 失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertServerInState],
  )

  const deleteServer = useCallback(
    async (name: string) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const deleted = await client.deleteMcpServer(name)
        setServers((prev) => prev.filter((item) => item.name !== deleted))
        setFeedback({ tone: 'ok', text: `已刪除 MCP Server「${deleted}」並移除各 CLI 設定。` })
        return true
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '刪除 MCP Server 失敗。',
        })
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [client],
  )

  const toggleTarget = useCallback(
    async (name: string, targetId: string, install: boolean) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const updated = install
          ? await client.installToTarget(name, targetId)
          : await client.uninstallFromTarget(name, targetId)
        upsertServerInState(updated)
        return updated
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '切換安裝狀態失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertServerInState],
  )

  const runCheckAndAutoInstall = useCallback(
    async (
      name: string,
      options: { providerId?: ProviderId; modelId?: string; effort?: string },
    ) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const res = await client.checkAndAutoInstall(name, { ...options, autoInstall: true })
        upsertServerInState(res.server)
        if (res.job && ['queued', 'running'].includes(res.job.status)) {
          setActiveCheckJob({ serverName: name, job: res.job })
        }
        setFeedback({
          tone: res.report.overallStatus === 'error' ? 'error' : 'ok',
          text: res.report.blockedByPreflight
            ? `預檢發現缺漏項目，請修正後再試。`
            : `已完成「${name}」掃描與跨 Provider 自動補齊安裝！`,
        })
        return res
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '執行檢查安裝失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertServerInState],
  )

  return {
    client,
    servers,
    externalServers,
    targets,
    libraryPath,
    isLoading,
    isBusy,
    feedback,
    activeCheckJob,
    clearFeedback: () => setFeedback(null),
    reload,
    createServer,
    updateServer,
    deleteServer,
    toggleTarget,
    runCheckAndAutoInstall,
  }
}
