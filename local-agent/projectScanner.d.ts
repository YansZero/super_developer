declare module '*projectScanner.mjs' {
  export interface ProjectTechStackByArea {
    frontend: string[]
    backend: string[]
    app?: string[]
  }

  export interface ProjectScanGitSummary {
    status: 'normal' | 'detached' | 'no-git'
    branchName: string | null
    lastCommitHash: string | null
    lastCommitMessage: string | null
    aheadCount: number
    behindCount: number
    uncommittedFileCount?: number
    openPrCount: number
    openIssueCount: number
    remoteUrl: string | null
  }

  export interface ProjectScanTodo {
    taskId?: string
    id: string
    title: string
    completed: boolean
    category: 'frontend' | 'backend'
    sourceFileLabel: string
    details?: string
  }

  export interface ProjectScanProgress {
    available: boolean
    missingReason: string | null
    sourceFileLabel: string | null
    todos: ProjectScanTodo[]
  }

  export interface ProjectScanResult {
    ok: boolean
    project?: { name: string; folderDisplayName: string; techStack: string[]; techStackByArea?: ProjectTechStackByArea; git: ProjectScanGitSummary; frontendProgress?: ProjectScanProgress; backendProgress?: ProjectScanProgress }
    errorCode?: string
    message?: string
  }

  export interface ProjectProgressResult {
    ok: boolean
    frontendProgress?: ProjectScanProgress
    backendProgress?: ProjectScanProgress
    errorCode?: string
    message?: string
  }

  export type CompleteProjectProgressResult = ProjectProgressResult

  export interface ProjectGitStatusResult {
    ok: boolean
    git?: ProjectScanGitSummary
    errorCode?: string
    message?: string
  }

  export function createProjectScanner(options?: { runner?: (...args: never[]) => Promise<unknown> }): {
    scan(projectPath: string): Promise<ProjectScanResult>
    scanProgress(projectPath: string): Promise<ProjectProgressResult>
    completeProgressTodo(projectPath: string, todoId: string): Promise<CompleteProjectProgressResult>
    scanGitStatus(projectPath: string): Promise<ProjectGitStatusResult>
  }
}
