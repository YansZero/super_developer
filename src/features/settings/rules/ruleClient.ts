import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
import type {
  ProviderId,
  RuleCreatePayload,
  RuleDocument,
  RuleApplicationAction,
  RuleApplicationStatus,
  RuleReorderPayload,
  RuleUpdatePayload,
} from '../../../shared/types/domain'

export interface RuleServiceContract {
  listRules(): Promise<RuleDocument[]>
  getRuleById(
    ruleId: string,
  ): Promise<{ rule: RuleDocument; rules: RuleDocument[] }>
  addRule(
    payload: RuleCreatePayload,
  ): Promise<{ rule: RuleDocument; rules: RuleDocument[] }>
  updateRule(
    ruleId: string,
    payload: RuleUpdatePayload,
  ): Promise<{ rule: RuleDocument; rules: RuleDocument[] }>
  reorderRules(
    payload: RuleReorderPayload,
  ): Promise<{ rules: RuleDocument[] }>
  removeRule(
    ruleId: string,
  ): Promise<{ removedId: string; rules: RuleDocument[] }>
  checkRuleApplication(
    ruleId: string,
    providerId: ProviderId,
  ): Promise<RuleApplicationStatus>
  applyRule(
    ruleId: string,
    providerId: ProviderId,
    action: RuleApplicationAction,
  ): Promise<RuleApplicationStatus>
}

export class RuleApiError extends Error {
  readonly errorCode: string
  readonly status: number

  constructor(message: string, errorCode = 'AGENT_REQUEST_FAILED', status = 500) {
    super(message)
    this.name = 'RuleApiError'
    this.errorCode = errorCode
    this.status = status
  }
}

async function requestRuleJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await localAgentFetch()(url, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch {
    throw new RuleApiError(
      '無法連線至本機規則服務（127.0.0.1），請確認開發伺服器或 npm run agent 已啟動。',
      'AGENT_OFFLINE',
      0,
    )
  }

  let data: Record<string, unknown>
  try {
    data = (await response.json()) as Record<string, unknown>
  } catch {
    throw new RuleApiError(
      '本機規則服務未回傳有效 JSON（Local Agent 可能尚未啟動）。',
      'AGENT_OFFLINE',
      response.status,
    )
  }

  if (!response.ok || data.ok !== true) {
    const message =
      typeof data.message === 'string' && data.message.trim()
        ? data.message
        : `請求失敗（HTTP ${response.status}）`
    const errorCode =
      typeof data.errorCode === 'string' && data.errorCode.trim()
        ? data.errorCode
        : 'AGENT_REQUEST_FAILED'
    throw new RuleApiError(message, errorCode, response.status)
  }

  return data as unknown as T
}

export function createHttpRuleServiceClient(
  baseUrl = '/api/local-agent',
): RuleServiceContract {
  return {
    async listRules() {
      const res = await requestRuleJson<{ ok: true; rules: RuleDocument[] }>(
        `${baseUrl}/rules`,
        { method: 'GET' },
      )
      return res.rules
    },

    async getRuleById(ruleId) {
      const res = await requestRuleJson<{
        ok: true
        rule: RuleDocument
        rules: RuleDocument[]
      }>(`${baseUrl}/rules/${encodeURIComponent(ruleId)}`, {
        method: 'GET',
      })
      return { rule: res.rule, rules: res.rules }
    },

    async addRule(payload) {
      const res = await requestRuleJson<{
        ok: true
        rule: RuleDocument
        rules: RuleDocument[]
      }>(`${baseUrl}/rules`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return { rule: res.rule, rules: res.rules }
    },

    async updateRule(ruleId, payload) {
      const res = await requestRuleJson<{
        ok: true
        rule: RuleDocument
        rules: RuleDocument[]
      }>(`${baseUrl}/rules/${encodeURIComponent(ruleId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      return { rule: res.rule, rules: res.rules }
    },

    async reorderRules(payload) {
      const res = await requestRuleJson<{
        ok: true
        rules: RuleDocument[]
      }>(`${baseUrl}/rules/reorder`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return { rules: res.rules }
    },

    async removeRule(ruleId) {
      const res = await requestRuleJson<{
        ok: true
        removedId: string
        rules: RuleDocument[]
      }>(`${baseUrl}/rules/${encodeURIComponent(ruleId)}`, {
        method: 'DELETE',
      })
      return { removedId: res.removedId, rules: res.rules }
    },

    async checkRuleApplication(ruleId, providerId) {
      const res = await requestRuleJson<{
        ok: true
        application: RuleApplicationStatus
      }>(`${baseUrl}/rules/${encodeURIComponent(ruleId)}/application?providerId=${encodeURIComponent(providerId)}`, {
        method: 'GET',
      })
      return res.application
    },

    async applyRule(ruleId, providerId, action) {
      const res = await requestRuleJson<{
        ok: true
        application: RuleApplicationStatus
      }>(`${baseUrl}/rules/${encodeURIComponent(ruleId)}/application`, {
        method: 'POST',
        body: JSON.stringify({ providerId, action }),
      })
      return res.application
    },
  }
}
