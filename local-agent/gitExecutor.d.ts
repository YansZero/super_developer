declare module '*gitExecutor.mjs' {
  export interface GitUncommittedFileEntry {
    path: string
    code: string
    status: 'modified' | 'added' | 'deleted' | 'untracked'
    staged: boolean
  }

  export interface GitExecutionResult {
    ok: boolean
    command: string
    projectPath: string
    exitCode: number
    stdout: string
    stderr: string
    files?: GitUncommittedFileEntry[]
    isSimulated: boolean
    timestamp: string
    errorCode?: string
    message?: string
  }

  export interface GitExecutorOptions {
    runner?: (
      file: string,
      args: string[],
      options: Record<string, unknown>,
    ) => Promise<{
      error: unknown
      stdout: string
      stderr: string
      exitCode: number
    }>
  }

  export function createGitExecutor(options?: GitExecutorOptions): {
    execute(input: {
      command: string
      projectPath?: string | null
      branch?: string | null
      filePath?: string | null
      files?: string[] | null
      commitMessage?: string | null
      isDemoFixture?: boolean
    }): Promise<GitExecutionResult>
  }
}
