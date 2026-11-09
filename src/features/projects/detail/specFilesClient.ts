import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
export interface SpecDocumentSummary {
  fileName: string
  size: number
  updatedAt: string
}

export interface SpecDocument extends SpecDocumentSummary {
  content: string
}

export class SpecFilesClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpecFilesClientError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function requestJson(url: string, body: Record<string, string>, signal?: AbortSignal, fetcher: typeof fetch = (...args) => fetch(...args)) {
  let response: Response
  try {
    response = await localAgentFetch(fetcher)(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new SpecFilesClientError('無法連線至本機 Local Agent；請確認服務已啟動。')
  }
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new SpecFilesClientError('Local Agent 規格文件回應格式不正確。')
  }
  if (!response.ok || !isRecord(data) || data.ok !== true) {
    throw new SpecFilesClientError(isRecord(data) && typeof data.message === 'string' ? data.message : '讀取規格文件失敗。')
  }
  return data
}

export async function listSpecDocuments(projectPath: string, signal?: AbortSignal, fetcher?: typeof fetch): Promise<SpecDocumentSummary[]> {
  const data = await requestJson('/api/local-agent/spec/list', { projectPath }, signal, fetcher)
  if (!Array.isArray(data.files)) throw new SpecFilesClientError('Local Agent 規格文件清單格式不正確。')
  return data.files.flatMap((value): SpecDocumentSummary[] => {
    if (!isRecord(value) || typeof value.fileName !== 'string' || typeof value.size !== 'number' || typeof value.updatedAt !== 'string') return []
    return [{ fileName: value.fileName, size: value.size, updatedAt: value.updatedAt }]
  })
}

export async function readSpecDocument(projectPath: string, fileName: string, signal?: AbortSignal, fetcher?: typeof fetch): Promise<SpecDocument> {
  const data = await requestJson('/api/local-agent/spec/read', { projectPath, fileName }, signal, fetcher)
  if (!isRecord(data.document) || typeof data.document.fileName !== 'string' || typeof data.document.content !== 'string' || typeof data.document.size !== 'number' || typeof data.document.updatedAt !== 'string') {
    throw new SpecFilesClientError('Local Agent 規格文件內容格式不正確。')
  }
  return {
    fileName: data.document.fileName,
    content: data.document.content,
    size: data.document.size,
    updatedAt: data.document.updatedAt,
  }
}
