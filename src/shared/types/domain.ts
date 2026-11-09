export type ThemeId = 'modern' | 'esports' | '8bit' | 'retro'

export type MainRouteId = 'overview' | 'detail' | 'ai-work-center' | 'jira-work-center' | 'skills' | 'mcp' | 'prompts' | 'settings'

export type SettingsTabId =
  | 'theme'
  | 'providers'
  | 'rules'
  | 'github'
  | 'jira'
  | 'integrations'

export type BuiltinProviderId = 'antigravity' | 'codex' | 'claude-code'

export type ProviderId = BuiltinProviderId | (string & {})

export type ProviderStatusKind = 'normal' | 'missing' | 'unknown'

export type ProviderCliStatus =
  | 'unprobed'
  | 'available'
  | 'missing'
  | 'not_executable'
  | 'invalid_path'
  | 'timeout'
  | 'unexpected_output'
  | 'error'

export type ProviderAuthStatus =
  | 'unknown'
  | 'authenticated'
  | 'unauthenticated'
  | 'manual_required'
  | 'error'

export type ProviderAgentState = 'checking' | 'online' | 'offline'

export interface ProviderSummary {
  id: ProviderId
  name: string
  shortLabel: string
  cliCommand: string
  defaultCliPath: string
  cliPath: string
  isBuiltin: boolean
  authModeLabel: string
  supportsAuthProbe: boolean
  supportsLoginCommand: boolean
  loginCommandHint: string
  loginGuideText: string
  statusKind: ProviderStatusKind
  statusText: string
  cliStatus: ProviderCliStatus
  authStatus: ProviderAuthStatus
  version: string | null
  checkedAt: string | null
  errorCode: string | null
  errorMessage: string | null
  demoNote: string
  isDemo: boolean
}

export interface ProviderConfigUpdatePayload {
  name?: string
  cliPath: string
}

export interface CustomProviderCreatePayload {
  name: string
  cliCommand?: string
  cliPath: string
}

export interface ProviderLoginOutcome {
  outcome: string
  errorCode: string | null
  commandHint: string
  message: string
}

export type GitStatusKind = 'normal' | 'detached' | 'no-git' | 'unanalysed'

export interface GitBranchSummary {
  status: GitStatusKind
  branchName: string | null
  lastCommitHash: string | null
  lastCommitMessage: string | null
  aheadCount: number
  behindCount: number
  /** Git status --porcelain 回報的未提交檔案數；舊快照缺少此欄位時視為 0。 */
  uncommittedFileCount?: number
  openPrCount: number
  openIssueCount: number
  remoteUrl: string | null
}

export interface TodoItem {
  taskId?: string
  id: string
  title: string
  completed: boolean
  category: 'frontend' | 'backend'
  sourceFileLabel: string
  details?: string
}

export interface SideProgress {
  available: boolean
  missingReason: string | null
  sourceFileLabel: string | null
  todos: TodoItem[]
}

export interface SpecSection {
  id: string
  heading: string
  summary: string
  clauses: string[]
}

export interface ProjectSpec {
  available: boolean
  fileName: string | null
  updatedAtLabel: string | null
  missingReason: string | null
  sections: SpecSection[]
}

export interface ArchNode {
  id: string
  name: string
  kind: 'folder' | 'file'
  note?: string
  children?: ArchNode[]
}

export interface JiraTicketSummary {
  key: string
  title: string
  /** Jira issue type; optional for older locally persisted assignments. */
  issueType?: string
  /** Jira status label; optional for older locally persisted assignments. */
  statusName?: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  assignee: string
  updatedAt: string
  summaryText: string
}

export interface ProjectJiraBinding {
  linked: boolean
  /** Jira Project is explicitly assigned by the user; branch names never choose it automatically. */
  manual?: boolean
  siteName: string | null
  projectKey: string | null
  projectName: string | null
  unlinkedReason: string | null
  tickets: JiraTicketSummary[]
}

export interface ProjectTechStackByArea {
  frontend: string[]
  backend: string[]
  app?: string[]
}

export interface ProjectItem {
  id: string
  name: string
  folderDisplayName: string
  /** 原生資料夾選擇器回傳的路徑，僅供本機 Agent 使用，不直接當作顯示名稱。 */
  folderPath?: string
  /** 使用者在左側導覽釘選的專案；舊資料缺少此欄位時視為未釘選。 */
  pinned?: boolean
  summary: string
  techStack: string[]
  techStackByArea?: ProjectTechStackByArea
  updatedAtLabel: string
  isDemoFixture: boolean
  git: GitBranchSummary
  frontendProgress: SideProgress
  backendProgress: SideProgress
  spec: ProjectSpec
  frontendTree: ArchNode[]
  backendTree: ArchNode[]
  architectureAnalysis?: ProjectArchitectureAnalysis | null
  jira: ProjectJiraBinding
}

export interface ProjectArchitectureAnalysis {
  output: string
  analyzedAt: string
  branchName: string | null
  providerId: ProviderId
  modelId: string
  effort: string
}

export type RuleAgentState = 'checking' | 'online' | 'offline'

export type RuleExtension = '.md' | '.txt'

export type RuleKind = 'guidance' | 'rule' | 'hook'

export type RuleHookEvent = 'before-command' | 'before-completion'

export interface RuleDocument {
  id: string
  fileName: string
  extension: RuleExtension
  sizeBytes: number
  content: string
  enabled: boolean
  kind: RuleKind
  hookEvents: RuleHookEvent[]
  appliedProviderIds: ProviderId[]
  installedHookProviderIds: ProviderId[]
  updatedAt?: string
  loadedAtLabel: string
}

export interface RuleCreatePayload {
  fileName: string
  content: string
  enabled?: boolean
  kind?: RuleKind
  hookEvents?: RuleHookEvent[]
}

export interface RuleUpdatePayload {
  enabled?: boolean
  fileName?: string
  content?: string
  kind?: RuleKind
  hookEvents?: RuleHookEvent[]
}

export type RuleApplicationAction = 'apply' | 'install-hook'

export interface RuleApplicationStatus {
  ruleId: string
  providerId: ProviderId
  applied: boolean
  hookInstalled: boolean
  effective: boolean
}

export interface RuleReorderPayload {
  ruleId?: string
  direction?: 'up' | 'down'
  orderedIds?: string[]
}

export interface ThemeMeta {
  id: ThemeId
  name: string
  subtitle: string
  paletteSummary: string
  effectSummary: string
}

export interface IntegrationState {
  service: 'github' | 'jira'
  displayName: string
  connected: false
  statusLabel: string
  scopeDescription: string
  unimplementedNotice: string
}

export type GitHubAgentState = 'checking' | 'online' | 'offline'

export type GitHubFlowState =
  | 'disconnected'
  | 'pending'
  | 'expired'
  | 'denied'
  | 'connected'

export type GitHubPollOutcome =
  | 'pending'
  | 'slow_down'
  | 'expired'
  | 'denied'
  | 'connected'
  | 'rate_limited'

export interface GitHubPendingSession {
  sessionId: string
  userCode: string
  verificationUri: 'https://github.com/login/device'
  intervalSeconds: number
  expiresInSeconds: number
  pollingAuthorized: boolean
}

export interface GitHubPublicAccount {
  id: number
  login: string
  name: string | null
  htmlUrl: string
  avatarUrl: string | null
  publicReposCount: number
}

export interface GitHubPublicRepository {
  id: number
  name: string
  fullName: string
  htmlUrl: string
  description: string | null
  language: string | null
  defaultBranch: string
  updatedAt: string | null
  isPrivate: boolean
}

export interface GitHubProjectRepoMapping {
  projectId: string
  projectName: string
  folderDisplayName: string
  repoId: number
  repoFullName: string
  repoHtmlUrl: string
  defaultBranch: string
  mappedAt: string
}

export interface GitHubRepoMappingPayload {
  projectId: string
  projectName: string
  folderDisplayName: string
  repoId: number
}

export interface GitHubIntegrationSnapshot {
  clientId: string | null
  requiredScope: string
  verificationUri: 'https://github.com/login/device'
  keyringAvailable: boolean
  keyringErrorCode: string | null
  keyringMessage: string | null
  flowState: GitHubFlowState
  pendingSession: GitHubPendingSession | null
  account: GitHubPublicAccount | null
  repositories: GitHubPublicRepository[]
  mappings: GitHubProjectRepoMapping[]
}

export interface DispatchPreviewPayload {
  projectName: string
  folderDisplayName: string
  branchLabel: string
  providerName: string
  taskSourceLabel: string
  promptText: string
  activeRuleNames: string[]
  executionNotice: string
}

export type TargetInstallStateKind = 'installed' | 'drifted' | 'external' | 'broken' | 'absent'

export interface TargetDescriptor {
  id: string
  name: string
  shortLabel: string
  isBuiltin: boolean
  skillsDir: string
  mcpConfigPath: string
  mcpFormat: 'json' | 'toml'
}

export interface TargetInstallStatus {
  targetId: string
  targetName: string
  shortLabel: string
  state: TargetInstallStateKind
  managed: boolean
  inSync?: boolean
  targetPath?: string
  configPath?: string
}

export interface SupportingFileEntry {
  path: string
  sizeBytes: number
  updatedAt?: string
  content?: string
}

export interface CheckActionItem {
  targetId: string
  targetName: string
  action: 'already_installed' | 'installed' | 'repaired' | 'skipped_external' | 'failed' | 'pending'
  status: 'ok' | 'warning' | 'error'
  message: string
  configPath?: string
}

export interface SkillCheckReport {
  checkedAt: string
  overallStatus: 'ok' | 'partial' | 'error'
  actions: CheckActionItem[]
}

export interface SkillDocument {
  name: string
  description: string
  body?: string
  content?: string
  files: SupportingFileEntry[]
  targets: TargetInstallStatus[]
  lastCheck: SkillCheckReport | null
  updatedAt: string
}

export interface McpPreflightCheckItem {
  id: string
  label: string
  status: 'ok' | 'warning' | 'error'
  detail: string
  suggestion?: string
}

export interface McpAiVerificationResult {
  providerId: string
  modelId: string
  checkedAt: string
  ok: boolean
  loaded: boolean
  status: 'ok' | 'missing' | 'warning' | 'error'
  tools: string[]
  detail: string
  suggestion: string
}

export interface McpCheckReport {
  serverName: string
  checkedAt: string
  overallStatus: 'ok' | 'partial' | 'error'
  blockedByPreflight: boolean
  checks: McpPreflightCheckItem[]
  providerActions: CheckActionItem[]
  aiVerification: McpAiVerificationResult | null
}

export interface McpServerDocument {
  name: string
  description: string
  transport: 'stdio' | 'http'
  command: string | null
  args: string[]
  url: string | null
  env: Record<string, string>
  headers: Record<string, string>
  secretEnv: Record<string, string>
  secretHeaders: Record<string, string>
  missingSecrets: string[]
  targets: TargetInstallStatus[]
  lastCheck: McpCheckReport | null
  updatedAt: string
}

export interface ExternalMcpServerEntry {
  name: string
  targetId: string
  targetName: string
  configPath: string
}

