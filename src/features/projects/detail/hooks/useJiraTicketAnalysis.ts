import { useEffect, useRef, useState } from 'react'
import type { JiraService } from '../../../jira/jiraContracts'
import { jiraMessages } from '../../../jira/jiraContracts'
import type { JiraSiteServiceContract } from '../../../settings/integrations/jira/jiraSiteContracts'
import type { JiraTicketSummary } from '../../../../shared/types/domain'
import { useI18n } from '../../../../shared/i18n'
import { defaultJiraPromptTemplate, fillJiraPromptTemplate } from '../jiraPromptTemplate'

export function useJiraTicketAnalysis(
  projectId: string,
  jiraService: JiraService,
  jiraSiteService: JiraSiteServiceContract,
) {
  const { locale, t } = useI18n()
  const [jiraPromptText, setJiraPromptText] = useState('')
  const [jiraTaskSourceLabel, setJiraTaskSourceLabel] = useState('手動輸入 Prompt')
  const [jiraTaskTicketKey, setJiraTaskTicketKey] = useState<string | null>(null)
  const [jiraTaskTicketTitle, setJiraTaskTicketTitle] = useState('')
  const [jiraTaskTicketDescription, setJiraTaskTicketDescription] = useState('')
  const [analyzingTicketKey, setAnalyzingTicketKey] = useState<string | null>(null)
  const [failedTicketKey, setFailedTicketKey] = useState<string | null>(null)
  const [jiraAnalysisError, setJiraAnalysisError] = useState<string | null>(null)
  const ticketAnalysisController = useRef<AbortController | null>(null)

  useEffect(() => {
    ticketAnalysisController.current?.abort()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalyzingTicketKey(null)
    setFailedTicketKey(null)
    setJiraAnalysisError(null)
    return () => ticketAnalysisController.current?.abort()
  }, [projectId])

  const prepareTicketAnalysis = async (ticket: JiraTicketSummary, templateFile = defaultJiraPromptTemplate(locale)) => {
    ticketAnalysisController.current?.abort()
    const controller = new AbortController()
    ticketAnalysisController.current = controller
    setJiraTaskTicketKey(null)
    setJiraTaskTicketTitle('')
    setJiraTaskTicketDescription('')
    setAnalyzingTicketKey(ticket.key)
    setFailedTicketKey(null)
    setJiraAnalysisError(null)
    try {
      const snapshot = await jiraSiteService.getSnapshot(controller.signal)
      const cloudId = snapshot.selectedCloudId
      if (!cloudId || !snapshot.sites.some((site) => site.cloudId === cloudId)) {
        throw new Error('請先到 Jira 連結設定選擇並保存 Jira Site。')
      }
      const before = await jiraService.profile(controller.signal)
      if (before.id !== snapshot.userKey || before.selectedCloudId !== cloudId) {
        throw new Error('Jira 登入帳號或 Site 已變更，請重新整理後再試。')
      }
      const detail = await jiraService.detail(cloudId, ticket.key, controller.signal)
      const after = await jiraService.profile(controller.signal)
      if (after.id !== before.id || after.selectedCloudId !== cloudId) {
        throw new Error('Jira 登入帳號或 Site 已變更，請重新整理後再試。')
      }
      if (!detail.description?.trim()) throw new Error('此 Jira Ticket 沒有可帶入的 Description。')
      const response = await fetch(`/api/prompts/${encodeURIComponent(templateFile)}`, { signal: controller.signal })
      const template = await response.json() as { ok?: boolean; content?: unknown; message?: string }
      if (!response.ok || !template.ok || typeof template.content !== 'string') throw new Error(template.message || t('common.promptTemplateLoadFailed'))
      if (controller.signal.aborted) return
      setJiraTaskSourceLabel(`Jira Ticket ${detail.key}`)
      setJiraTaskTicketKey(detail.key.toUpperCase())
      setJiraTaskTicketTitle(detail.summary)
      setJiraTaskTicketDescription(detail.description)
      setJiraPromptText(fillJiraPromptTemplate(template.content, `${detail.key} - ${detail.summary}\n\n${detail.description}`))
    } catch (error) {
      if (controller.signal.aborted) return
      setFailedTicketKey(ticket.key)
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      setJiraAnalysisError(code && code in jiraMessages
        ? jiraMessages[code as keyof typeof jiraMessages]
        : error instanceof Error ? error.message : '讀取 Jira Ticket Description 失敗。')
    } finally {
      if (!controller.signal.aborted) setAnalyzingTicketKey(null)
    }
  }

  return {
    jiraPromptText, setJiraPromptText, jiraTaskSourceLabel, jiraTaskTicketKey, jiraTaskTicketTitle, jiraTaskTicketDescription,
    analyzingTicketKey, failedTicketKey, jiraAnalysisError, prepareTicketAnalysis,
  }
}
