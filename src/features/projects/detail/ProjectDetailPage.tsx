import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type SetStateAction } from 'react'
import type { JiraService } from '../../jira/jiraContracts'
import type { JiraSiteServiceContract } from '../../settings/integrations/jira/jiraSiteContracts'
import type {
  GitHubProjectRepoMapping,
  JiraTicketSummary,
  ProjectArchitectureAnalysis,
  ProjectItem,
  ProviderSummary,
  RuleDocument,
  SettingsTabId,
} from '../../../shared/types/domain'
import {
  cancelTrackedDispatch,
  getDispatchJobsSnapshot,
  retryArchitectureSave,
  startTrackedDispatch,
  subscribeDispatchJobs,
} from './dispatchJobStore'
import { DispatchClientError, resolveDispatchErrorMessage, type ImageAttachment } from './dispatchClient'
import {
  buildDispatchPreviewPayload,
  linkedProgressDocuments,
  filterJiraTickets,
  getLoadedProgress,
  getProgressDocuments,
  isProgressDocumentCompleted,
  type ProgressDocument,
} from './projectDetailHelpers'
import { parseArchitectureTrees } from './projectArchitectureParser'
import { sanitizeTerminalOutput } from './outputSanitizer'
import { ProjectDetailWorkspace, type ProjectDetailWorkspaceTab } from './ProjectDetailWorkspace'
import { ProjectDetailOverviewPanel } from './ProjectDetailOverviewPanel'
import { ProjectGitOperationsPage } from './ProjectGitOperationsPage'
import { ProjectDetailJiraWorkbench } from './ProjectDetailJiraWorkbench'
import { ProjectDetailTodoBoard } from './ProjectDetailTodoBoard'
import { ProjectDetailSpecViewer } from './ProjectDetailSpecViewer'
import { ProjectDetailArchitectureTree } from './ProjectDetailArchitectureTree'
import { ProjectDetailArchitectureAnalysis } from './ProjectDetailArchitectureAnalysis'
import { DispatchConfirmationDialog } from './DispatchConfirmationDialog'
import { useProviderModelSelection } from './hooks/useProviderModelSelection'
import { useProjectSpecDocuments } from './hooks/useProjectSpecDocuments'
import { useGitStatusRefresh } from './hooks/useGitStatusRefresh'
import { useJiraTicketAnalysis } from './hooks/useJiraTicketAnalysis'
import { useProjectDispatchJobs } from './hooks/useProjectDispatchJobs'
import { useI18n, type Locale } from '../../../shared/i18n'
import zhTWArchitecturePrompt from '../../../../library/prompt/ai-project-analysis_zhTW.md?raw'
import enArchitecturePrompt from '../../../../library/prompt/ai-project-analysis_en.md?raw'
import esArchitecturePrompt from '../../../../library/prompt/ai-project-analysis_es.md?raw'
import './ProjectDetailPage.scss'

interface ProjectDetailPageProps {
  project: ProjectItem
  allProjects: ProjectItem[]
  providers: ProviderSummary[]
  rules: RuleDocument[]
  mappedGitHubRepo?: GitHubProjectRepoMapping | null
  onRefreshGitStatus: (projectId: string, projectPath: string, signal: AbortSignal) => Promise<void>
  onRefreshProgress: (projectId: string, projectPath: string) => Promise<void>
  onCompleteProgressTodo: (projectId: string, projectPath: string, todoId: string) => Promise<void>
  onSaveArchitectureAnalysis: (projectId: string, analysis: ProjectArchitectureAnalysis) => Promise<void>
  onReloadArchitectureAnalysis: (projectId: string) => Promise<void>
  jiraService: JiraService
  jiraSiteService: JiraSiteServiceContract
  onAddProjects: (projectPaths: string[]) => Promise<ProjectItem[]>
  onRemoveProjects: (projectIds: string[]) => Promise<void>
  onPickProjectFolders: () => Promise<string[]>
  onSelectProject: (projectId: string) => void
  onOpenSettingsTab: (tab: SettingsTabId) => void
}

const DETAIL_TAB_QUERY: Record<ProjectDetailWorkspaceTab, string> = {
  overview: 'overview',
  branches: 'git-operations',
  jira: 'jira-tasks',
  ai: 'ai-analysis',
  code: 'architecture',
  specs: 'specifications',
  progress: 'progress',
}

const ARCHITECTURE_PROMPTS: Record<Locale, string> = {
  'zh-TW': zhTWArchitecturePrompt.trim(),
  en: enArchitecturePrompt.trim(),
  es: esArchitecturePrompt.trim(),
}

type ArchitectureView = 'tree' | 'analysis'

function detailTabFromLocation() {
  const url = new URL(window.location.href)
  const tab = url.searchParams.get('tab')
  const legacyJiraCode = url.searchParams.get('jira')
  const entry = (Object.entries(DETAIL_TAB_QUERY) as Array<[ProjectDetailWorkspaceTab, string]>).find(([, value]) => value === tab)
  if (entry) return entry[0]
  return legacyJiraCode ? 'jira' : 'overview'
}

export function ProjectDetailPage({
  project,
  allProjects,
  providers,
  rules,
  mappedGitHubRepo,
  onRefreshGitStatus,
  onRefreshProgress,
  onSaveArchitectureAnalysis,
  onReloadArchitectureAnalysis,
  jiraService,
  jiraSiteService,
  onAddProjects,
  onRemoveProjects,
  onPickProjectFolders,
  onSelectProject,
  onOpenSettingsTab,
}: ProjectDetailPageProps) {
  const { t, locale } = useI18n()
  const [selectedSpecSectionId, setSelectedSpecSectionId] = useState<string | null>(null)
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({})
  const [rescanMessage, setRescanMessage] = useState<string | null>(null)
  const [architectureReloading, setArchitectureReloading] = useState(false)
  const [architectureView, setArchitectureView] = useState<ArchitectureView>('tree')
  const architectureAnalysisSectionRef = useRef<HTMLElement | null>(null)
  const architectureTreeSectionRef = useRef<HTMLElement | null>(null)
  const [jiraFilter, setJiraFilter] = useState<'ALL' | JiraTicketSummary['status']>('ALL')
  const [jiraKeyword, setJiraKeyword] = useState('')
  const jiraModelSelection = useProviderModelSelection()
  const architectureModelSelection = useProviderModelSelection()
  const implementationModelSelection = useProviderModelSelection()
  const [implementationPrompt, setImplementationPrompt] = useState('')
  const [jiraAttachments, setJiraAttachments] = useState<ImageAttachment[]>([])
  const [architectureAttachments, setArchitectureAttachments] = useState<ImageAttachment[]>([])
  const [implementationAttachments, setImplementationAttachments] = useState<ImageAttachment[]>([])
  const [promptDrafts, setPromptDrafts] = useState<Record<Locale, string>>(() => ({ ...ARCHITECTURE_PROMPTS }))
  const promptText = promptDrafts[locale]
  const setPromptText = (prompt: string) => setPromptDrafts((drafts) => ({ ...drafts, [locale]: prompt }))
  const taskSourceLabel = t('common.aiProjectArchitectureAnalysis')
  const [showDispatchConfirmation, setShowDispatchConfirmation] = useState(false)
  const [confirmationTaskType, setConfirmationTaskType] = useState<'jira' | 'architecture'>('jira')
  const [pendingImplementationDocument, setPendingImplementationDocument] = useState<ProgressDocument | null>(null)
  const [jiraDispatchStarting, setJiraDispatchStarting] = useState(false)
  const [architectureDispatchStarting, setArchitectureDispatchStarting] = useState(false)
  const [jiraDispatchError, setJiraDispatchError] = useState<string | null>(null)
  const [architectureDispatchError, setArchitectureDispatchError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ProjectDetailWorkspaceTab>(() => detailTabFromLocation())
  const [requestedSource, setRequestedSource] = useState<string | null>(() => new URL(window.location.href).searchParams.get('source'))
  const isRequestedSourceCompleted = useMemo(() => {
    if (!requestedSource) return false
    const allTodos = [...project.frontendProgress.todos, ...project.backendProgress.todos]
    const docs = getProgressDocuments(allTodos)
    const doc = docs.find((d) => d.sourceFileLabel === requestedSource)
    return doc ? isProgressDocumentCompleted(doc) : false
  }, [project, requestedSource])
  const activeRequestedSource = isRequestedSourceCompleted ? null : requestedSource
  const [loadedByProject, setLoadedByProject] = useState<Record<string, Record<'frontend' | 'backend', string | null>>>({})
  const progressSelectionKey = JSON.stringify([project.id, activeRequestedSource])
  const loadedDocuments = loadedByProject[progressSelectionKey] ?? linkedProgressDocuments(project, activeRequestedSource)
  const setLoadedDocuments = useCallback((update: SetStateAction<Record<'frontend' | 'backend', string | null>>) => {
    setLoadedByProject((current) => {
      const previous = current[progressSelectionKey] ?? linkedProgressDocuments(project, activeRequestedSource)
      return { ...current, [progressSelectionKey]: typeof update === 'function' ? update(previous) : update }
    })
  }, [activeRequestedSource, progressSelectionKey, project])
  const handleClearSource = useCallback(() => {
    setRequestedSource(null)
    const url = new URL(window.location.href)
    if (url.searchParams.has('source')) {
      url.searchParams.delete('source')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
  }, [])
  useEffect(() => {
    if (isRequestedSourceCompleted) {
      const url = new URL(window.location.href)
      if (url.searchParams.has('source')) {
        url.searchParams.delete('source')
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      }
    }
  }, [isRequestedSourceCompleted])
  const progressJobs = useSyncExternalStore(subscribeDispatchJobs, getDispatchJobsSnapshot, getDispatchJobsSnapshot)
  const loadedProgress = (category: 'frontend' | 'backend') => {
    const progress = category === 'frontend' ? project.frontendProgress : project.backendProgress
    const documents = getProgressDocuments(progress.todos)
    const active = progressJobs.find((record) => record.job.projectId === project.id && record.taskType === 'custom' && ['queued', 'running'].includes(record.job.status) && documents.some((document) => document.sourceFileLabel === record.progressSourceFileLabel))
    const source = active?.progressSourceFileLabel ?? loadedDocuments[category]
    const record = active ?? progressJobs.find((item) => item.job.projectId === project.id && item.progressSourceFileLabel === source && item.job.tasks?.length)
    const loaded = getLoadedProgress(progress, documents.some((document) => document.sourceFileLabel === source && (record || source === activeRequestedSource || !isProgressDocumentCompleted(document))) ? source : null)
    return { ...loaded, todos: loaded.todos.map((todo) => {
      const task = record?.job.tasks?.find((item) => item.taskId === todo.taskId || item.taskId === todo.id)
      return task ? { ...todo, completed: task.status === 'completed' } : todo
    }) }
  }
  const {
    jiraPromptText, setJiraPromptText, jiraTaskSourceLabel, jiraTaskTicketKey, jiraTaskTicketTitle, jiraTaskTicketDescription,
    analyzingTicketKey, failedTicketKey, jiraAnalysisError, prepareTicketAnalysis,
  } = useJiraTicketAnalysis(project.id, jiraService, jiraSiteService)
  const {
    architectureDispatchRecord, jiraDispatchJob, architectureDispatchJob,
    architectureSaveError, jiraDispatchRunning, architectureDispatchRunning,
  } = useProjectDispatchJobs(project.id)
  const {
    projectSpecDocuments, currentSpecDocumentsError, specFilesLoading,
    selectedSpecFileName, setSelectedSpecFileName, selectedSpecDocument, specDocumentError,
  } = useProjectSpecDocuments(project, jiraDispatchJob)
  const { gitRefreshError, gitRefreshedAt, gitRefreshCountdown } = useGitStatusRefresh(project, onRefreshGitStatus)

  useEffect(() => {
    if (!rescanMessage) return
    const timeoutId = window.setTimeout(() => setRescanMessage(null), 3000)
    return () => window.clearTimeout(timeoutId)
  }, [rescanMessage])

  const handleTabChange = (tab: ProjectDetailWorkspaceTab, jiraCode?: string) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.pathname = '/project-detail'
    url.searchParams.delete('type')
    url.searchParams.delete('jira')
    url.searchParams.set('project', project.name)
    if (tab === 'overview') url.searchParams.delete('tab')
    else url.searchParams.set('tab', DETAIL_TAB_QUERY[tab])
    if (tab === 'jira' && jiraCode) url.searchParams.set('code', jiraCode)
    else url.searchParams.delete('code')
    window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }

  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.pathname !== '/project-detail') return
    const legacyJiraCode = url.searchParams.get('jira')
    if (legacyJiraCode && !url.searchParams.get('tab')) {
      url.searchParams.delete('jira')
      url.searchParams.set('tab', DETAIL_TAB_QUERY.jira)
      url.searchParams.set('code', legacyJiraCode)
      window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
    }
    const handlePopState = () => { setActiveTab(detailTabFromLocation()); setRequestedSource(new URL(window.location.href).searchParams.get('source')) }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const savedArchitectureAnalysis = project.architectureAnalysis
  const savedArchitectureOutput = useMemo(
    () => sanitizeTerminalOutput(savedArchitectureAnalysis?.output),
    [savedArchitectureAnalysis?.output],
  )
  const parsedArchitectureTrees = useMemo(
    () => parseArchitectureTrees(savedArchitectureOutput),
    [savedArchitectureOutput],
  )
  const frontendTree = parsedArchitectureTrees.frontend.length > 0
    ? parsedArchitectureTrees.frontend
    : project.frontendTree
  const backendTree = parsedArchitectureTrees.backend.length > 0
    ? parsedArchitectureTrees.backend
    : project.backendTree
  const hasSavedArchitectureAnalysis = Boolean(savedArchitectureAnalysis && savedArchitectureOutput.trim())

  const handleRefreshArchitectureTree = async () => {
    setRescanMessage(null)
    if (!hasSavedArchitectureAnalysis) {
      handleTabChange('ai')
      window.requestAnimationFrame(() => {
        architectureAnalysisSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }

    setArchitectureReloading(true)
    try {
      await onReloadArchitectureAnalysis(project.id)
      setRescanMessage(t('common.architectureAnalysisReloadedFromDatabase'))
    } catch (error) {
      setRescanMessage(error instanceof Error ? error.message : t('common.architectureAnalysisReloadFailed'))
    } finally {
      setArchitectureReloading(false)
    }
  }

  const statusFilteredTickets = filterJiraTickets(project.jira.tickets, jiraFilter)
  const visibleTickets = statusFilteredTickets.filter((ticket) => {
    const query = jiraKeyword.trim().toLowerCase()
    if (!query) return true
    return ticket.key.toLowerCase().includes(query) || ticket.title.toLowerCase().includes(query) || ticket.assignee.toLowerCase().includes(query)
  })
  const todoCount = project.jira.tickets.filter((ticket) => ticket.status === 'TODO').length
  const inProgressCount = project.jira.tickets.filter((ticket) => ticket.status === 'IN_PROGRESS').length
  const doneCount = project.jira.tickets.filter((ticket) => ticket.status === 'DONE').length
  const jiraProvider = providers.find((provider) => provider.id === jiraModelSelection.selectedProviderId) ?? providers[0]
  const architectureProvider = providers.find((provider) => provider.id === architectureModelSelection.selectedProviderId) ?? providers[0]
  const jiraProviderSupportsDispatch = ['antigravity', 'codex', 'claude-code'].includes(jiraModelSelection.selectedProviderId)
  const architectureProviderSupportsDispatch = ['antigravity', 'codex', 'claude-code'].includes(architectureModelSelection.selectedProviderId)
  const jiraSelectedModel = jiraModelSelection.providerModelCatalog.models.find((model) => model.id === jiraModelSelection.selectedModelId)
  const architectureSelectedModel = architectureModelSelection.providerModelCatalog.models.find((model) => model.id === architectureModelSelection.selectedModelId)
  const jiraCatalogCurrent = jiraModelSelection.providerModelCatalog.providerId === jiraModelSelection.selectedProviderId
  const architectureCatalogCurrent = architectureModelSelection.providerModelCatalog.providerId === architectureModelSelection.selectedProviderId
  const jiraEffortOptions = jiraSelectedModel?.efforts ?? []
  const architectureEffortOptions = architectureSelectedModel?.efforts ?? []
  const jiraSelectedEffortLabel = jiraModelSelection.selectedModelId === 'default' || jiraModelSelection.selectedEffort === 'default'
    ? t('common.cliDefault')
    : jiraModelSelection.selectedEffort
  const architectureSelectedEffortLabel = architectureModelSelection.selectedModelId === 'default' || architectureModelSelection.selectedEffort === 'default'
    ? t('common.cliDefault')
    : architectureModelSelection.selectedEffort
  const confirmationModelSelection = confirmationTaskType === 'jira' ? jiraModelSelection : architectureModelSelection
  const confirmationProvider = confirmationTaskType === 'jira' ? jiraProvider : architectureProvider
  const confirmationSelectedModel = confirmationTaskType === 'jira' ? jiraSelectedModel : architectureSelectedModel
  const confirmationEffortLabel = confirmationTaskType === 'jira' ? jiraSelectedEffortLabel : architectureSelectedEffortLabel
  const confirmationPrompt = confirmationTaskType === 'jira'
    ? jiraPromptText
    : pendingImplementationDocument ? implementationPrompt : promptText
  const confirmationStarting = confirmationTaskType === 'jira' ? jiraDispatchStarting : architectureDispatchStarting

  const dispatchPreview = buildDispatchPreviewPayload({
    project,
    provider: architectureProvider,
    taskSourceLabel,
    promptText,
    rules,
  })

  const startImplementation = async (document: ProgressDocument) => {
    const projectPath = project.folderPath ?? ''
    if (!projectPath) throw new DispatchClientError(t('dispatch.error.PROJECT_DIRECTORY_UNAVAILABLE'), undefined, 'PROJECT_DIRECTORY_UNAVAILABLE')
    if (!['antigravity', 'codex', 'claude-code'].includes(implementationModelSelection.selectedProviderId)) {
      throw new DispatchClientError(t('dispatch.error.PROVIDER_UNSUPPORTED'), undefined, 'PROVIDER_UNSUPPORTED')
    }
    if (implementationModelSelection.providerModelLoading || implementationModelSelection.providerModelCatalog.providerId !== implementationModelSelection.selectedProviderId) {
      throw new DispatchClientError(t('dispatch.error.MODEL_CATALOG_NOT_LOADED'), undefined, 'MODEL_CATALOG_NOT_LOADED')
    }
    await startTrackedDispatch({
      taskType: 'custom',
      projectId: project.id,
      providerId: implementationModelSelection.selectedProviderId,
      modelId: implementationModelSelection.selectedModelId,
      effort: implementationModelSelection.selectedEffort,
      projectPath,
      projectName: project.name,
      branchName: project.git.branchName,
      prompt: implementationPrompt,
      ...(implementationAttachments.length > 0 ? { imageAttachment: implementationAttachments[0], imageAttachments: implementationAttachments } : {}),
      jiraTicketTitle: document.sourceFileLabel,
      progressSourceFileLabel: document.sourceFileLabel,
    })
    setImplementationAttachments([])
  }

  const requestImplementation = (document: ProgressDocument) => {
    setPendingImplementationDocument(document)
    setImplementationPrompt(t('progress.dispatchPrompt', { tasks: document.todos.filter((todo) => !todo.completed).map((todo) => `- [ ] ${todo.title}`).join('\n'), source: document.sourceFileLabel }))
    setImplementationAttachments([])
    setArchitectureDispatchError(null)
    setConfirmationTaskType('architecture')
    setShowDispatchConfirmation(true)
  }

  const confirmDispatch = async () => {
    const taskType = confirmationTaskType
    const modelSelection = taskType === 'jira' ? jiraModelSelection : architectureModelSelection
    const projectPath = project.folderPath ?? ''
    if (!projectPath) {
      const errorMsg = t('dispatch.error.PROJECT_DIRECTORY_UNAVAILABLE')
      if (taskType === 'jira') setJiraDispatchError(errorMsg)
      else setArchitectureDispatchError(errorMsg)
      setShowDispatchConfirmation(false)
      return
    }
    if (taskType === 'jira') {
      setJiraDispatchStarting(true)
      setJiraDispatchError(null)
    } else {
      setArchitectureDispatchStarting(true)
      setArchitectureDispatchError(null)
    }
    try {
      if (taskType === 'architecture' && pendingImplementationDocument) {
        await startImplementation(pendingImplementationDocument)
        setPendingImplementationDocument(null)
        setShowDispatchConfirmation(false)
        return
      }
      const activeAttachments = taskType === 'jira' ? jiraAttachments : architectureAttachments
      await startTrackedDispatch({
        taskType,
        projectId: project.id,
        providerId: modelSelection.selectedProviderId,
        modelId: modelSelection.selectedModelId,
        effort: modelSelection.selectedEffort,
        projectPath,
        projectName: project.name,
        branchName: project.git.branchName,
        prompt: taskType === 'jira' ? jiraPromptText : promptText,
        ...(activeAttachments.length > 0 ? { imageAttachment: activeAttachments[0], imageAttachments: activeAttachments } : {}),
        ...(taskType === 'jira' && jiraTaskTicketKey
          ? { jiraTicketKey: jiraTaskTicketKey, jiraTicketTitle: jiraTaskTicketTitle }
          : {}),
      }, taskType === 'architecture' ? onSaveArchitectureAnalysis : undefined)
      if (taskType === 'jira') setJiraAttachments([])
      else setArchitectureAttachments([])
      setShowDispatchConfirmation(false)
    } catch (error) {
      const message = resolveDispatchErrorMessage(error, t)
      if (taskType === 'jira') setJiraDispatchError(message)
      else setArchitectureDispatchError(message)
    } finally {
      if (taskType === 'jira') setJiraDispatchStarting(false)
      else setArchitectureDispatchStarting(false)
    }
  }

  const stopDispatch = async (jobId: string, taskType: 'jira' | 'architecture') => {
    if (taskType === 'jira') setJiraDispatchError(null)
    else setArchitectureDispatchError(null)
    try {
      await cancelTrackedDispatch(jobId)
    } catch (error) {
      const message = resolveDispatchErrorMessage(error, t)
      if (taskType === 'jira') setJiraDispatchError(message)
      else setArchitectureDispatchError(message)
    }
  }

  const toggleTreeNode = (nodeId: string) => {
    setCollapsedNodes((prev) => ({ ...prev, [nodeId]: !prev[nodeId] }))
  }

  const openJiraTicket = (ticketKey: string) => {
    handleTabChange('jira', ticketKey)
  }

  return (
    <ProjectDetailWorkspace
        project={project}
        frontendProgress={loadedProgress('frontend')}
        backendProgress={loadedProgress('backend')}
        allProjects={allProjects}
        providers={providers}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onSelectProject={(projectId) => {
          onSelectProject(projectId)
          setSelectedSpecSectionId(null)
          setRescanMessage(null)
        }}
        onAddProjects={onAddProjects}
        onRemoveProjects={onRemoveProjects}
        onPickProjectFolders={onPickProjectFolders}
        onOpenSettingsTab={onOpenSettingsTab}
        gitRefreshError={gitRefreshError}
        gitRefreshedAt={gitRefreshedAt}
        gitRefreshCountdown={gitRefreshCountdown}
      >

      {activeTab === 'overview' ? <ProjectDetailOverviewPanel project={project} onOpenJiraTicket={openJiraTicket} /> : null}

      {activeTab === 'branches' ? <ProjectGitOperationsPage project={project} mappedGitHubRepo={mappedGitHubRepo} /> : null}

      {activeTab === 'jira' ? (
        <ProjectDetailJiraWorkbench
          project={project}
          providers={providers}
          jiraFilter={jiraFilter}
          setJiraFilter={setJiraFilter}
          jiraKeyword={jiraKeyword}
          setJiraKeyword={setJiraKeyword}
          visibleTickets={visibleTickets}
          todoCount={todoCount}
          inProgressCount={inProgressCount}
          doneCount={doneCount}
          analyzingTicketKey={analyzingTicketKey}
          prepareTicketAnalysis={prepareTicketAnalysis}
          jiraTaskSourceLabel={jiraTaskSourceLabel}
          jiraTaskTicketKey={jiraTaskTicketKey}
          jiraTaskTicketTitle={jiraTaskTicketTitle}
          jiraTaskTicketDescription={jiraTaskTicketDescription}
          failedTicketKey={failedTicketKey}
          jiraAnalysisError={jiraAnalysisError}
          jiraModelSelection={jiraModelSelection}
          jiraCatalogCurrent={jiraCatalogCurrent}
          jiraEffortOptions={jiraEffortOptions}
          jiraPromptText={jiraPromptText}
          setJiraPromptText={setJiraPromptText}
          imageAttachments={jiraAttachments}
          setImageAttachments={setJiraAttachments}
          onAttachmentError={setJiraDispatchError}
          jiraDispatchError={jiraDispatchError}
          jiraDispatchJob={jiraDispatchJob}
          stopDispatch={stopDispatch}
          jiraProviderSupportsDispatch={jiraProviderSupportsDispatch}
          jiraDispatchStarting={jiraDispatchStarting}
          jiraDispatchRunning={jiraDispatchRunning}
          onRequestDispatch={() => { setJiraDispatchError(null); setConfirmationTaskType('jira'); setShowDispatchConfirmation(true) }}
          onOpenSettingsTab={onOpenSettingsTab}
        />
      ) : null}

      {activeTab === 'code' ? (
        <ProjectDetailArchitectureTree
            project={project}
            architectureView={architectureView}
            onArchitectureViewChange={setArchitectureView}
            architectureTreeSectionRef={architectureTreeSectionRef}
            savedArchitectureOutput={savedArchitectureOutput}
            rescanMessage={rescanMessage}
            architectureSaveError={architectureSaveError}
            architectureDispatchJob={architectureDispatchJob}
            architectureReloading={architectureReloading}
            hasSavedArchitectureAnalysis={hasSavedArchitectureAnalysis}
            frontendTree={frontendTree}
            backendTree={backendTree}
            collapsedNodes={collapsedNodes}
            handleRefreshArchitectureTree={handleRefreshArchitectureTree}
            retryArchitectureSave={retryArchitectureSave}
            toggleTreeNode={toggleTreeNode}
          />
      ) : null}

      {activeTab === 'ai' ? (
        <ProjectDetailArchitectureAnalysis
          project={project}
          architectureAnalysisSectionRef={architectureAnalysisSectionRef}
          providers={providers}
          modelSelection={architectureModelSelection}
          architectureCatalogCurrent={architectureCatalogCurrent}
          architectureEffortOptions={architectureEffortOptions}
          architectureSelectedModel={architectureSelectedModel}
          architectureSelectedEffortLabel={architectureSelectedEffortLabel}
          architectureProviderSupportsDispatch={architectureProviderSupportsDispatch}
          dispatchPreview={dispatchPreview}
          savedArchitectureAnalysis={savedArchitectureAnalysis}
          architectureDispatchError={architectureDispatchError}
          architectureDispatchStarting={architectureDispatchStarting}
          architectureDispatchRunning={architectureDispatchRunning}
          architectureDispatchJob={architectureDispatchJob}
          architectureDispatchRecord={architectureDispatchRecord}
          architectureSaveError={architectureSaveError}
          hasSavedArchitectureAnalysis={hasSavedArchitectureAnalysis}
          promptText={promptText}
          setPromptText={setPromptText}
          imageAttachments={architectureAttachments}
          setImageAttachments={setArchitectureAttachments}
          onAttachmentError={setArchitectureDispatchError}
          stopDispatch={stopDispatch}
          retryArchitectureSave={retryArchitectureSave}
          onRequestDispatch={() => { setArchitectureDispatchError(null); setConfirmationTaskType('architecture'); setShowDispatchConfirmation(true) }}
          onOpenSettingsTab={onOpenSettingsTab}
          onShowSavedAnalysis={() => { setArchitectureView('analysis'); handleTabChange('code'); window.requestAnimationFrame(() => architectureTreeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }}
        />
      ) : null}

      {activeTab === 'specs' ? (
        <ProjectDetailSpecViewer
          project={project}
          projectSpecDocuments={projectSpecDocuments}
          selectedSpecFileName={selectedSpecFileName}
          selectedSpecDocument={selectedSpecDocument}
          specDocumentError={specDocumentError}
          currentSpecDocumentsError={currentSpecDocumentsError}
          specFilesLoading={specFilesLoading}
          selectedSpecSectionId={selectedSpecSectionId}
          setSelectedSpecFileName={(fileName) => setSelectedSpecFileName(fileName)}
          setSelectedSpecSectionId={setSelectedSpecSectionId}
        />
      ) : null}

      {activeTab === 'progress' ? (
        <ProjectDetailTodoBoard requestedSource={activeRequestedSource} project={project} loadedDocuments={loadedDocuments} setLoadedDocuments={setLoadedDocuments} onStartImplementation={requestImplementation} onRefreshProgress={onRefreshProgress} onClearSource={handleClearSource} />
      ) : null}

      {showDispatchConfirmation ? (
        <DispatchConfirmationDialog
          project={project}
          confirmationTaskType={confirmationTaskType}
          confirmationProviderName={confirmationProvider?.name ?? confirmationModelSelection.selectedProviderId}
          confirmationModelLabel={confirmationSelectedModel ? t(confirmationSelectedModel.label) : t('common.cliDefault')}
          confirmationEffortLabel={confirmationEffortLabel}
          confirmationPrompt={confirmationPrompt}
          confirmationAttachments={confirmationTaskType === 'jira' ? jiraAttachments : architectureAttachments}
          confirmationStarting={confirmationStarting}
          confirmationTitle={pendingImplementationDocument ? t('common.confirmProgressImplementation') : undefined}
          confirmationNotice={pendingImplementationDocument ? t('common.reviewProgressImplementationBeforeDispatch') : undefined}
          providerOptions={pendingImplementationDocument ? providers : undefined}
          selectedProviderId={pendingImplementationDocument ? architectureModelSelection.selectedProviderId : undefined}
          onProviderChange={pendingImplementationDocument ? (providerId) => {
            architectureModelSelection.setSelectedProviderId(providerId)
            architectureModelSelection.setSelectedModelId('default')
            architectureModelSelection.setSelectedEffort('default')
            architectureModelSelection.setProviderModelLoading(true)
          } : undefined}
          implementation={pendingImplementationDocument ? {
            source: pendingImplementationDocument.sourceFileLabel,
            selection: implementationModelSelection,
            providers,
            prompt: implementationPrompt,
            setPrompt: setImplementationPrompt,
            imageAttachments: implementationAttachments,
            setImageAttachments: setImplementationAttachments,
            onAttachmentError: setArchitectureDispatchError,
            error: architectureDispatchError,
          } : undefined}
          onClose={() => { setPendingImplementationDocument(null); setShowDispatchConfirmation(false) }}
          onConfirm={() => void confirmDispatch()}
        />
      ) : null}
    </ProjectDetailWorkspace>
  )
}
