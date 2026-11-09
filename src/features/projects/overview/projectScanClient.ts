import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
import type { GitBranchSummary, ProjectTechStackByArea, SideProgress, TodoItem } from '../../../shared/types/domain'

export interface ProjectScanSnapshot {
  name: string
  folderDisplayName: string
  techStack: string[]
  techStackByArea?: ProjectTechStackByArea
  git: GitBranchSummary
  frontendProgress?: SideProgress
  backendProgress?: SideProgress
}

export interface ProjectProgressSnapshot {
  frontendProgress: SideProgress
  backendProgress: SideProgress
}

export interface ProjectScanServiceContract {
  scan(projectPath: string): Promise<ProjectScanSnapshot>
  scanProgress(projectPath: string): Promise<ProjectProgressSnapshot>
  completeProgressTodo(projectPath: string, todoId: string): Promise<ProjectProgressSnapshot>
  scanGitStatus(projectPath: string, signal?: AbortSignal): Promise<GitBranchSummary>
  pickFolders(): Promise<string[]>
  openFolder(projectPath: string): Promise<{ ok: boolean; message?: string }>
}

export class ProjectScanError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code = 'PROJECT_SCAN_FAILED', status = 500) {
    super(message)
    this.name = 'ProjectScanError'
    this.code = code
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseGit(value: unknown): GitBranchSummary {
  if (!isRecord(value)) throw new ProjectScanError('Local Agent 回傳的 Git 資料格式不正確。', 'INVALID_RESPONSE')
  const status = value.status
  if (status !== 'normal' && status !== 'detached' && status !== 'no-git' && status !== 'unanalysed') {
    throw new ProjectScanError('Local Agent 回傳未知的 Git 狀態。', 'INVALID_RESPONSE')
  }
  const nullableText = (item: unknown) => item === null ? null : typeof item === 'string' ? item : null
  const numberValue = (item: unknown) => typeof item === 'number' && Number.isInteger(item) && item >= 0 ? item : 0
  return {
    status,
    branchName: nullableText(value.branchName),
    lastCommitHash: nullableText(value.lastCommitHash),
    lastCommitMessage: nullableText(value.lastCommitMessage),
    aheadCount: numberValue(value.aheadCount),
    behindCount: numberValue(value.behindCount),
    uncommittedFileCount: numberValue(value.uncommittedFileCount),
    openPrCount: numberValue(value.openPrCount),
    openIssueCount: numberValue(value.openIssueCount),
    remoteUrl: nullableText(value.remoteUrl),
  }
}

function parseProgress(value: unknown, category: 'frontend' | 'backend'): SideProgress {
  const missingReason = `project.progress.${category}JobNotFound`
  if (!isRecord(value)) return { available: false, missingReason, sourceFileLabel: null, todos: [] }
  const todos = Array.isArray(value.todos) ? value.todos.filter((item): item is TodoItem => {
    if (!isRecord(item)) return false
    return typeof item.id === 'string' && typeof item.title === 'string' && item.category === category &&
      typeof item.completed === 'boolean' && typeof item.sourceFileLabel === 'string'
  }) : []
  return {
    available: value.available === true && todos.length > 0,
    missingReason: typeof value.missingReason === 'string' ? value.missingReason : missingReason,
    sourceFileLabel: typeof value.sourceFileLabel === 'string' ? value.sourceFileLabel : null,
    todos,
  }
}

function parseSnapshot(value: unknown): ProjectScanSnapshot {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.folderDisplayName !== 'string' || !Array.isArray(value.techStack)) {
    throw new ProjectScanError('Local Agent 回傳的專案掃描資料格式不正確。', 'INVALID_RESPONSE')
  }
  return {
    name: value.name,
    folderDisplayName: value.folderDisplayName,
    techStack: value.techStack.filter((item): item is string => typeof item === 'string'),
    techStackByArea: isRecord(value.techStackByArea) && Array.isArray(value.techStackByArea.frontend) && Array.isArray(value.techStackByArea.backend)
      ? {
        frontend: value.techStackByArea.frontend.filter((item): item is string => typeof item === 'string'),
        backend: value.techStackByArea.backend.filter((item): item is string => typeof item === 'string'),
        app: Array.isArray(value.techStackByArea.app)
          ? value.techStackByArea.app.filter((item): item is string => typeof item === 'string')
          : [],
      }
      : undefined,
    git: parseGit(value.git),
    frontendProgress: parseProgress(value.frontendProgress, 'frontend'),
    backendProgress: parseProgress(value.backendProgress, 'backend'),
  }
}

function parseProgressSnapshot(value: unknown): ProjectProgressSnapshot {
  if (!isRecord(value)) throw new ProjectScanError('Local Agent 回傳的進度資料格式不正確。', 'INVALID_RESPONSE')
  return {
    frontendProgress: parseProgress(value.frontendProgress, 'frontend'),
    backendProgress: parseProgress(value.backendProgress, 'backend'),
  }
}

export function createHttpProjectScanService(fetcher: typeof fetch = (...args) => fetch(...args)): ProjectScanServiceContract {
  return {
    async pickFolders() {
      let response: Response
      try {
        response = await localAgentFetch(fetcher)('/api/local-agent/projects/pick', {
          method: 'POST',
          headers: { Accept: 'application/json' },
        })
      } catch (error) {
        throw new ProjectScanError(
          `無法連線至本機資料夾選擇器：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_OFFLINE',
          0,
        )
      }

      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ProjectScanError(`本機資料夾選擇器回應格式不正確（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status)
      }
      if (!response.ok || !isRecord(data) || data.ok !== true || !Array.isArray(data.projectPaths)) {
        throw new ProjectScanError(
          isRecord(data) && typeof data.message === 'string' ? data.message : `資料夾選擇失敗（HTTP ${response.status}）。`,
          isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : 'PICKER_UNAVAILABLE',
          response.status,
        )
      }
      const paths = data.projectPaths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      if (paths.length === 0) throw new ProjectScanError('資料夾選擇器沒有回傳有效專案。', 'INVALID_RESPONSE', response.status)
      return [...new Set(paths)]
    },
    async scan(projectPath) {
      let response: Response
      try {
        response = await localAgentFetch(fetcher)('/api/local-agent/projects/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath }),
        })
      } catch (error) {
        throw new ProjectScanError(
          `無法連線至本機專案掃描服務：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_OFFLINE',
          0,
        )
      }

      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ProjectScanError(`本機專案掃描服務回應格式不正確（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status)
      }
      if (!response.ok || !isRecord(data) || data.ok !== true) {
        throw new ProjectScanError(
          isRecord(data) && typeof data.message === 'string' ? data.message : `專案掃描失敗（HTTP ${response.status}）。`,
          isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : 'PROJECT_SCAN_FAILED',
          response.status,
        )
      }
      return parseSnapshot(data.project)
    },
    async scanProgress(projectPath) {
      let response: Response
      try {
        response = await localAgentFetch(fetcher)('/api/local-agent/projects/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath }),
        })
      } catch (error) {
        throw new ProjectScanError(
          `無法連線至本機進度掃描服務：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_OFFLINE',
          0,
        )
      }

      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ProjectScanError(`本機進度掃描服務回應格式不正確（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status)
      }
      if (!response.ok || !isRecord(data) || data.ok !== true) {
        throw new ProjectScanError(
          isRecord(data) && typeof data.message === 'string' ? data.message : `進度掃描失敗（HTTP ${response.status}）。`,
          isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : 'PROJECT_PROGRESS_SCAN_FAILED',
          response.status,
        )
      }
      return parseProgressSnapshot(data)
    },
    async completeProgressTodo(projectPath, todoId) {
      let response: Response
      try {
        response = await localAgentFetch(fetcher)('/api/local-agent/projects/progress/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath, todoId }),
        })
      } catch (error) {
        throw new ProjectScanError(
          `無法連線至本機進度回寫服務：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_OFFLINE',
          0,
        )
      }
      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ProjectScanError(`本機進度回寫服務回應格式不正確（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status)
      }
      if (!response.ok || !isRecord(data) || data.ok !== true) {
        throw new ProjectScanError(
          isRecord(data) && typeof data.message === 'string' ? data.message : `進度回寫失敗（HTTP ${response.status}）。`,
          isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : 'PROJECT_PROGRESS_WRITE_FAILED',
          response.status,
        )
      }
      return parseProgressSnapshot(data)
    },
    async scanGitStatus(projectPath, signal) {
      let response: Response
      try {
        response = await localAgentFetch(fetcher)('/api/local-agent/projects/git-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath }),
          signal,
        })
      } catch (error) {
        if (signal?.aborted) throw error
        throw new ProjectScanError(
          `無法連線至本機 Git 狀態服務：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_OFFLINE',
          0,
        )
      }

      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ProjectScanError(`本機 Git 狀態服務回應格式不正確（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status)
      }
      if (!response.ok || !isRecord(data) || data.ok !== true) {
        throw new ProjectScanError(
          isRecord(data) && typeof data.message === 'string' ? data.message : `Git 狀態刷新失敗（HTTP ${response.status}）。`,
          isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : 'GIT_STATUS_REFRESH_FAILED',
          response.status,
        )
      }
      return parseGit(data.git)
    },
    async openFolder(projectPath) {
      let response: Response
      try {
        response = await localAgentFetch(fetcher)('/api/local-agent/projects/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectPath }),
        })
      } catch (error) {
        throw new ProjectScanError(
          `無法連線至開啟資料夾服務：${error instanceof Error ? error.message : String(error)}`,
          'AGENT_OFFLINE',
          0,
        )
      }

      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new ProjectScanError(`本機服務回應格式不正確（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status)
      }
      if (!response.ok || !isRecord(data) || data.ok !== true) {
        throw new ProjectScanError(
          isRecord(data) && typeof data.message === 'string' ? data.message : `開啟資料夾失敗（HTTP ${response.status}）。`,
          isRecord(data) && typeof data.errorCode === 'string' ? data.errorCode : 'OPEN_FOLDER_FAILED',
          response.status,
        )
      }
      return { ok: true, message: typeof data.message === 'string' ? data.message : undefined }
    },
  }
}
