import type {
  DispatchPreviewPayload,
  JiraTicketSummary,
  ProjectItem,
  ProviderSummary,
  RuleDocument,
  SideProgress,
  TodoItem,
} from '../../../shared/types/domain'
import { PROTOTYPE_STAGE_BANNER } from '../../../shared/data/fixtures'

export function splitTodosByCompletion(todos: TodoItem[]): {
  pending: TodoItem[]
  completed: TodoItem[]
} {
  return {
    pending: todos.filter((item) => !item.completed),
    completed: todos.filter((item) => item.completed),
  }
}

export interface ProgressDocument {
  category: TodoItem['category']
  sourceFileLabel: string
  content: string
  todos: TodoItem[]
}

export function isProgressDocumentCompleted(document: ProgressDocument): boolean {
  return document.todos.length > 0 && document.todos.every((todo) => todo.completed)
}

export function getProgressDocuments(todos: TodoItem[]): ProgressDocument[] {
  const documents = new Map<string, ProgressDocument>()
  todos.filter((todo) => todo.details).forEach((todo) => {
    const existing = documents.get(todo.sourceFileLabel)
    if (existing) {
      existing.todos.push(todo)
      return
    }
    documents.set(todo.sourceFileLabel, {
      category: todo.category,
      sourceFileLabel: todo.sourceFileLabel,
      content: todo.details ?? '',
      todos: [todo],
    })
  })
  return [...documents.values()]
}

export function getLoadedProgress(progress: SideProgress, sourceFileLabel: string | null): SideProgress {
  return {
    ...progress,
    sourceFileLabel,
    todos: sourceFileLabel
      ? progress.todos.filter((todo) => todo.sourceFileLabel === sourceFileLabel)
      : [],
  }
}

export function filterJiraTickets(
  tickets: JiraTicketSummary[],
  statusFilter: 'ALL' | JiraTicketSummary['status'],
): JiraTicketSummary[] {
  if (statusFilter === 'ALL') {
    return tickets
  }
  return tickets.filter((ticket) => ticket.status === statusFilter)
}

export function buildDispatchPreviewPayload(params: {
  project: ProjectItem
  provider: ProviderSummary
  taskSourceLabel: string
  promptText: string
  rules: RuleDocument[]
}): DispatchPreviewPayload {
  const { project, provider, taskSourceLabel, promptText, rules } = params
  const branchLabel =
    project.git.status === 'no-git'
      ? PROTOTYPE_STAGE_BANNER.gitNoRepoWarning
      : (project.git.branchName ?? 'HEAD')

  const activeRuleNames = rules
    .filter((r) => {
      if (!r.enabled) return false
      return r.kind === 'hook'
        ? r.installedHookProviderIds.includes(provider.id)
        : r.appliedProviderIds.includes(provider.id)
    })
    .map((r) => r.fileName)

  return {
    projectName: project.name,
    folderDisplayName: project.folderDisplayName,
    branchLabel,
    providerName: `${provider.name}（${provider.statusText}）`,
    taskSourceLabel,
    promptText: promptText.trim() || '（尚未輸入派工指令內容）',
    activeRuleNames,
    executionNotice:
      '本階段未實作 Local Agent 專案派工執行；Provider 狀態已由本機探針提供，此預覽僅供核對派工模組契約，不會啟動終端機派工程序或修改本機專案檔案。',
  }
}


export function aiJobHref(jobId: string) { return `/ai-work-center?${new URLSearchParams({ jobId })}` }
export function progressBoardHref(project: string, source?: string | null) {
  return `/project-detail?${new URLSearchParams({ project, tab: 'progress', ...(source ? { source } : {}) })}`
}
export function linkedProgressDocuments(project: ProjectItem, source: string | null): Record<'frontend' | 'backend', string | null> {
  const valid = source && /^spec\/job\/[A-Za-z0-9._-]+\.md$/i.test(source)
  const isPending = (todos: typeof project.frontendProgress.todos) => {
    if (!valid) return null
    const docs = getProgressDocuments(todos)
    const doc = docs.find((d) => d.sourceFileLabel === source)
    if (!doc || isProgressDocumentCompleted(doc)) return null
    return source
  }
  return {
    frontend: isPending(project.frontendProgress.todos),
    backend: isPending(project.backendProgress.todos),
  }
}
