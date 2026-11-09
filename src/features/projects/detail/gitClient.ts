import { localAgentFetch } from '../../../shared/i18n/localAgentFetch'
export interface GitUncommittedFileItem {
  path: string
  code: string
  status: 'modified' | 'added' | 'deleted' | 'untracked'
  staged: boolean
}

export interface GitExecutionResponse {
  ok: boolean
  command: string
  projectPath: string
  exitCode: number
  stdout: string
  stderr: string
  files?: GitUncommittedFileItem[]
  isSimulated: boolean
  timestamp: string
  errorCode?: string
  message?: string
}

export interface GitServiceContract {
  executeGitCommand(args: {
    command:
      | 'status'
      | 'fetch'
      | 'pull'
      | 'push'
      | 'branches'
      | 'checkout'
      | 'create-branch'
      | 'log'
      | 'uncommitted-files'
      | 'file-diff'
      | 'commit'
      | 'stash'
    projectPath?: string
    branch?: string
    filePath?: string
    files?: string[]
    commitMessage?: string
    isDemoFixture?: boolean
  }): Promise<GitExecutionResponse>
}

export class GitApiError extends Error {
  readonly errorCode: string
  readonly status: number

  constructor(message: string, errorCode = 'GIT_REQUEST_FAILED', status = 500) {
    super(message)
    this.name = 'GitApiError'
    this.errorCode = errorCode
    this.status = status
  }
}

export function createHttpGitServiceClient(
  baseUrl = '/api/local-agent/git',
): GitServiceContract {
  return {
    async executeGitCommand(args) {
      let response: Response
      try {
        response = await localAgentFetch()(`${baseUrl}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        })
      } catch (err) {
        throw new GitApiError(
          `無法連線至本機 Git 服務：${err instanceof Error ? err.message : String(err)}`,
          'AGENT_OFFLINE',
          0,
        )
      }

      let data: unknown
      try {
        data = await response.json()
      } catch {
        throw new GitApiError(
          `本機 Git 服務回應非預期內容（HTTP ${response.status}）`,
          'INVALID_AGENT_RESPONSE',
          response.status,
        )
      }

      if (!response.ok || !data || typeof data !== 'object') {
        const errorRecord = data as Record<string, unknown>
        throw new GitApiError(
          typeof errorRecord?.message === 'string'
            ? errorRecord.message
            : `Git 命令執行失敗（HTTP ${response.status}）`,
          typeof errorRecord?.errorCode === 'string'
            ? errorRecord.errorCode
            : 'GIT_EXECUTION_FAILED',
          response.status,
        )
      }

      return data as GitExecutionResponse
    },
  }
}
