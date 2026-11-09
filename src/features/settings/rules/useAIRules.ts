import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ProviderId,
  RuleApplicationAction,
  RuleApplicationStatus,
  RuleAgentState,
  RuleCreatePayload,
  RuleDocument,
  RuleUpdatePayload,
} from '../../../shared/types/domain'
import {
  RuleApiError,
  createHttpRuleServiceClient,
  type RuleServiceContract,
} from './ruleClient'

export interface RuleFeedbackMessage {
  tone: 'ok' | 'warn' | 'err'
  text: string
}

export interface UseAIRulesResult {
  rules: RuleDocument[]
  agentState: RuleAgentState
  agentError: string | null
  isBusy: boolean
  feedback: RuleFeedbackMessage | null
  setFeedback: (msg: RuleFeedbackMessage | null) => void
  clearFeedback: () => void
  reloadRules: () => Promise<boolean>
  reloadSingleRule: (ruleId: string) => Promise<RuleDocument | null>
  addRuleToAgent: (payload: RuleCreatePayload) => Promise<RuleDocument | null>
  updateRuleFile: (ruleId: string, payload: RuleUpdatePayload) => Promise<RuleDocument | null>
  toggleRuleEnabled: (ruleId: string, nextEnabled: boolean) => Promise<boolean>
  moveRuleOrder: (ruleId: string, direction: 'up' | 'down') => Promise<boolean>
  deleteRuleFromAgent: (ruleId: string) => Promise<boolean>
  checkRuleApplication: (ruleId: string, providerId: ProviderId) => Promise<RuleApplicationStatus | null>
  applyRule: (ruleId: string, providerId: ProviderId, action: RuleApplicationAction) => Promise<RuleApplicationStatus | null>
}

export function useAIRules(customService?: RuleServiceContract): UseAIRulesResult {
  const service = useMemo(
    () => customService ?? createHttpRuleServiceClient(),
    [customService],
  )

  const [rules, setRules] = useState<RuleDocument[]>([])
  const [agentState, setAgentState] = useState<RuleAgentState>('checking')
  const [agentError, setAgentError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [feedback, setFeedback] = useState<RuleFeedbackMessage | null>(null)

  const handleFailure = useCallback((err: unknown, contextLabel: string) => {
    const isOffline =
      err instanceof RuleApiError && err.errorCode === 'AGENT_OFFLINE'
    const message =
      err instanceof Error ? err.message : `${contextLabel}失敗，請稍後重試。`

    if (isOffline) {
      setAgentState('offline')
      setAgentError(message)
      setFeedback({
        tone: 'warn',
        text: `${contextLabel}：Local Agent 離線，無法執行本機規則操作（${message}）`,
      })
      return
    }

    setFeedback({
      tone: 'err',
      text: `${contextLabel}：${message}`,
    })
  }, [])

  const reloadRules = useCallback(async () => {
    setAgentState('checking')
    setIsBusy(true)
    try {
      const list = await service.listRules()
      setRules(list)
      setAgentState('online')
      setAgentError(null)
      setFeedback({
        tone: 'ok',
        text: `已從本機 Agent 重新載入已保存內容（共 ${list.length} 條規則）。`,
      })
      return true
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '無法連接本機規則服務，目前無法讀取或保存規則。'
      setAgentState('offline')
      setAgentError(message)
      setFeedback({
        tone: 'warn',
        text: `重新載入失敗：Local Agent 離線（${message}）`,
      })
      return false
    } finally {
      setIsBusy(false)
    }
  }, [service])

  useEffect(() => {
    let active = true
    service
      .listRules()
      .then((list) => {
        if (!active) return
        setRules(list)
        setAgentState('online')
        setAgentError(null)
      })
      .catch((err: unknown) => {
        if (!active) return
        const message =
          err instanceof Error
            ? err.message
            : '無法連接本機規則服務，目前無法讀取或保存規則。'
        setAgentState('offline')
        setAgentError(message)
        setRules([])
      })
    return () => {
      active = false
    }
  }, [service])

  const reloadSingleRule = useCallback(
    async (ruleId: string) => {
      setIsBusy(true)
      try {
        const res = await service.getRuleById(ruleId)
        setRules(res.rules)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已重新載入「${res.rule.fileName}」的本機已保存內容。`,
        })
        return res.rule
      } catch (err) {
        handleFailure(err, '重新載入已保存內容失敗')
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const addRuleToAgent = useCallback(
    async (payload: RuleCreatePayload) => {
      setIsBusy(true)
      try {
        const res = await service.addRule(payload)
        setRules(res.rules)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已加入規則「${res.rule.fileName}」並保存至本機 Agent。`,
        })
        return res.rule
      } catch (err) {
        handleFailure(err, '加入規則失敗')
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const toggleRuleEnabled = useCallback(
    async (ruleId: string, nextEnabled: boolean) => {
      setIsBusy(true)
      try {
        const res = await service.updateRule(ruleId, { enabled: nextEnabled })
        setRules(res.rules)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `規則「${res.rule.fileName}」已設為${res.rule.enabled ? '啟用' : '停用'}。`,
        })
        return true
      } catch (err) {
        handleFailure(err, '更新規則啟用狀態失敗')
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const updateRuleFile = useCallback(
    async (ruleId: string, payload: RuleUpdatePayload) => {
      setIsBusy(true)
      try {
        const res = await service.updateRule(ruleId, payload)
        setRules(res.rules)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已更新規則文件「${res.rule.fileName}」。`,
        })
        return res.rule
      } catch (err) {
        handleFailure(err, '修改規則文件失敗')
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const moveRuleOrder = useCallback(
    async (ruleId: string, direction: 'up' | 'down') => {
      setIsBusy(true)
      try {
        const res = await service.reorderRules({ ruleId, direction })
        setRules(res.rules)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已更新規則順序（${direction === 'up' ? '上移' : '下移'}）。`,
        })
        return true
      } catch (err) {
        handleFailure(err, '調整規則順序失敗')
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const deleteRuleFromAgent = useCallback(
    async (ruleId: string) => {
      setIsBusy(true)
      try {
        const res = await service.removeRule(ruleId)
        setRules(res.rules)
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: `已從本機 Agent 移除規則（${res.removedId}）。`,
        })
        return true
      } catch (err) {
        handleFailure(err, '移除規則失敗')
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const checkRuleApplication = useCallback(
    async (ruleId: string, providerId: ProviderId) => {
      try {
        return await service.checkRuleApplication(ruleId, providerId)
      } catch (err) {
        handleFailure(err, '檢查規則套用狀態失敗')
        return null
      }
    },
    [service, handleFailure],
  )

  const applyRule = useCallback(
    async (ruleId: string, providerId: ProviderId, action: RuleApplicationAction) => {
      setIsBusy(true)
      try {
        const result = await service.applyRule(ruleId, providerId, action)
        setRules((current) => current.map((rule) => rule.id === ruleId
          ? {
              ...rule,
              appliedProviderIds: result.applied ? [...new Set([...rule.appliedProviderIds, providerId])] : rule.appliedProviderIds,
              installedHookProviderIds: result.hookInstalled ? [...new Set([...rule.installedHookProviderIds, providerId])] : rule.installedHookProviderIds,
            }
          : rule))
        setAgentState('online')
        setAgentError(null)
        setFeedback({
          tone: 'ok',
          text: action === 'install-hook' ? '規則已安裝到 Local Agent Hook。' : '規則已套用至此 AI Provider。',
        })
        return result
      } catch (err) {
        handleFailure(err, action === 'install-hook' ? '安裝 Hook 規則失敗' : '套用規則失敗')
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [service, handleFailure],
  )

  const clearFeedback = useCallback(() => {
    setFeedback(null)
  }, [])

  return {
    rules,
    agentState,
    agentError,
    isBusy,
    feedback,
    setFeedback,
    clearFeedback,
    reloadRules,
    reloadSingleRule,
    addRuleToAgent,
    updateRuleFile,
    toggleRuleEnabled,
    moveRuleOrder,
    deleteRuleFromAgent,
    checkRuleApplication,
    applyRule,
  }
}
