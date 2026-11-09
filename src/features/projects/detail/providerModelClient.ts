import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
export interface ProviderModelOption {
  id: string
  label: string
  efforts: string[]
}

export interface ProviderModelCatalog {
  providerId: string
  source: 'cli' | 'default'
  models: ProviderModelOption[]
  message: string
}

export class ProviderModelCatalogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderModelCatalogError'
  }
}

const LEGACY_MODEL_CATALOG_KEYS: Record<string, string> = {
  'CLI 預設': 'common.cliDefault',
  '模型清單取自目前已登入的 Antigravity CLI。': 'common.modelListLoadedFromSignedInCli',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseCatalog(value: unknown): ProviderModelCatalog {
  if (!isRecord(value) || typeof value.providerId !== 'string') {
    throw new ProviderModelCatalogError('Provider 模型清單格式不正確。')
  }
  const models = Array.isArray(value.models)
    ? value.models.flatMap((item): ProviderModelOption[] => {
        if (!isRecord(item) || typeof item.id !== 'string' || typeof item.label !== 'string') return []
        return [{
          id: item.id,
          label: item.id === 'default' ? 'common.cliDefault' : LEGACY_MODEL_CATALOG_KEYS[item.label] ?? item.label,
          efforts: Array.isArray(item.efforts)
            ? item.efforts.filter((effort): effort is string => typeof effort === 'string')
            : [],
        }]
      })
    : []
  if (models.length === 0) throw new ProviderModelCatalogError('Provider 沒有回傳可用模型選項。')

  return {
    providerId: value.providerId,
    source: value.source === 'cli' ? 'cli' : 'default',
    models,
    message: typeof value.message === 'string' ? LEGACY_MODEL_CATALOG_KEYS[value.message] ?? value.message : '',
  }
}

export async function fetchProviderModelCatalog(
  providerId: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = (...args) => fetch(...args),
): Promise<ProviderModelCatalog> {
  let response: Response
  try {
    response = await localAgentFetch(fetcher)(`/api/local-agent/providers/${encodeURIComponent(providerId)}/models`, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProviderModelCatalogError('無法連線至本機 Provider 服務。')
  }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new ProviderModelCatalogError('本機 Provider 服務回應格式不正確。')
  }
  if (!response.ok || !isRecord(data) || data.ok !== true) {
    throw new ProviderModelCatalogError(
      isRecord(data) && typeof data.message === 'string' ? data.message : '無法載入 Provider 模型清單。',
    )
  }
  return parseCatalog(data.catalog)
}
