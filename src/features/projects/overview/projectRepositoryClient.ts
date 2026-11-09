import type { ProjectArchitectureAnalysis, ProjectItem } from '../../../shared/types/domain'

export class ProjectRepositoryError extends Error {
  readonly status: number

  constructor(message: string, status = 0) {
    super(message)
    this.name = 'ProjectRepositoryError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const LEGACY_PROJECT_TEXT_KEYS: Record<string, string> = {
  '已加入本機專案；尚未分析 Git branch、Jira Ticket、待辦與規格。': 'project.summary.addedWaitingForAnalysis',
  '已加入本機專案；Git branch 已掃描，待補充前後端待辦與規格文件。': 'project.summary.gitScannedWaitingForTodoAndSpecs',
  '尚未分析': 'project.updated.notAnalyzed',
  '剛剛完成本機掃描': 'project.updated.justScanned',
  '尚未分析專案。': 'project.progress.projectNotAnalyzed',
  '尚未掃描前端待辦文件。': 'project.progress.frontendNotScanned',
  '尚未掃描後端待辦文件。': 'project.progress.backendNotScanned',
  '尚未掃描規格文件。': 'project.progress.specNotScanned',
  '尚未分析 Git branch 與 Jira 關聯。': 'project.jira.notAnalyzed',
  '尚未分析 Git branch 與 Jira 的關聯。': 'project.jira.notAnalyzed',
  '尚未手動指定 Jira Project；請到設定 > Jira 指派專案。': 'project.jira.notManuallyLinked',
}

function normalizeProjectTextKey(value: string | null): string | null {
  return value ? LEGACY_PROJECT_TEXT_KEYS[value] ?? value : null
}

function normalizeProject(project: ProjectItem): ProjectItem {
  return {
    ...project,
    summary: normalizeProjectTextKey(project.summary) ?? project.summary,
    updatedAtLabel: normalizeProjectTextKey(project.updatedAtLabel) ?? project.updatedAtLabel,
    frontendProgress: {
      ...project.frontendProgress,
      missingReason: normalizeProjectTextKey(project.frontendProgress.missingReason),
    },
    backendProgress: {
      ...project.backendProgress,
      missingReason: normalizeProjectTextKey(project.backendProgress.missingReason),
    },
    spec: {
      ...project.spec,
      missingReason: normalizeProjectTextKey(project.spec.missingReason),
      updatedAtLabel: normalizeProjectTextKey(project.spec.updatedAtLabel),
    },
    jira: {
      ...project.jira,
      unlinkedReason: normalizeProjectTextKey(project.jira.unlinkedReason),
    },
  }
}

function parseProjects(value: unknown): ProjectItem[] {
  if (!isRecord(value) || !Array.isArray(value.projects)) {
    throw new ProjectRepositoryError('專案資料庫回應格式不正確。')
  }
  return value.projects.filter((project): project is ProjectItem => {
    if (!isRecord(project)) return false
    return project.isDemoFixture === false && typeof project.id === 'string' && typeof project.name === 'string' && typeof project.folderDisplayName === 'string'
  }).map((project) => normalizeProject({
    ...project,
    ...(typeof project.folderPath === 'string' ? { folderPath: project.folderPath } : {}),
  }))
}

async function readResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ProjectRepositoryError(`專案資料庫回應格式不正確（HTTP ${response.status}）。`, response.status)
  }
}

function errorMessage(data: unknown, fallback: string, status: number) {
  if (status === 503) return '專案資料庫暫時無法使用，請確認 BFF 服務是否已啟動。'
  return isRecord(data) && isRecord(data.error) && typeof data.error.message === 'string'
    ? data.error.message
    : fallback
}

export interface ProjectRepositoryService {
  list(): Promise<ProjectItem[]>
  save(project: ProjectItem, folderPath: string): Promise<ProjectItem>
  saveArchitectureAnalysis(projectId: string, analysis: ProjectArchitectureAnalysis): Promise<ProjectItem>
  remove(projectId: string): Promise<void>
}

export function createProjectRepositoryService(fetcher: typeof fetch = (...args) => fetch(...args)): ProjectRepositoryService {
  return {
    async list() {
      let response: Response
      try {
        response = await fetcher('/api/projects', { headers: { Accept: 'application/json' } })
      } catch (error) {
        throw new ProjectRepositoryError(`無法連線至專案資料庫：${error instanceof Error ? error.message : String(error)}`)
      }
      const data = await readResponse(response)
      if (!response.ok) throw new ProjectRepositoryError(errorMessage(data, `讀取專案資料庫失敗（HTTP ${response.status}）。`, response.status), response.status)
      return parseProjects(data)
    },
    async save(project, folderPath) {
      let response: Response
      try {
        response = await fetcher('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ project, folderPath }),
        })
      } catch (error) {
        throw new ProjectRepositoryError(`無法連線至專案資料庫：${error instanceof Error ? error.message : String(error)}`)
      }
      const data = await readResponse(response)
      if (!response.ok || !isRecord(data) || !data.project) {
        throw new ProjectRepositoryError(errorMessage(data, `儲存專案失敗（HTTP ${response.status}）。`, response.status), response.status)
      }
      const parsed = parseProjects({ projects: [data.project] })
      if (!parsed[0]) throw new ProjectRepositoryError('專案資料庫回傳的專案格式不正確。', response.status)
      return parsed[0]
    },
    async saveArchitectureAnalysis(projectId, analysis) {
      let response: Response
      try {
        response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}/architecture-analysis`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ analysis }),
        })
      } catch (error) {
        throw new ProjectRepositoryError(`無法連線至專案資料庫：${error instanceof Error ? error.message : String(error)}`)
      }
      const data = await readResponse(response)
      if (!response.ok || !isRecord(data) || !data.project) {
        throw new ProjectRepositoryError(errorMessage(data, `儲存專案架構分析失敗（HTTP ${response.status}）。`, response.status), response.status)
      }
      const parsed = parseProjects({ projects: [data.project] })
      if (!parsed[0]) throw new ProjectRepositoryError('專案資料庫回傳的分析結果格式不正確。', response.status)
      return parsed[0]
    },
    async remove(projectId) {
      let response: Response
      try {
        response = await fetcher(`/api/projects/${encodeURIComponent(projectId)}`, {
          method: 'DELETE',
          headers: { Accept: 'application/json' },
        })
      } catch (error) {
        throw new ProjectRepositoryError(`無法連線至專案資料庫：${error instanceof Error ? error.message : String(error)}`)
      }
      const data = await readResponse(response)
      if (!response.ok || !isRecord(data) || data.success !== true) {
        throw new ProjectRepositoryError(errorMessage(data, `移除專案失敗（HTTP ${response.status}）。`, response.status), response.status)
      }
    },
  }
}
