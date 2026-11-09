import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type {
  MainRouteId,
  JiraTicketSummary,
  ProjectArchitectureAnalysis,
  ProjectItem,
  SettingsTabId,
  ThemeId,
} from './shared/types/domain'
import {
  DEMO_PROJECTS,
  INITIAL_INTEGRATIONS,
} from './shared/data/fixtures'
import { applyAndStoreTheme, isValidThemeId, loadStoredTheme } from './shared/theme/themeStorage'
import {
  loadRunningAnimalBackground,
  loadRunningAnimals,
  storeRunningAnimalBackground,
  storeRunningAnimals,
} from './shared/appearance/runningAnimal'
import type { JiraService } from './features/jira/jiraContracts'
import { defaultJiraService } from './features/jira/useJiraWorkbench'
import type { JiraSiteServiceContract } from './features/settings/integrations/jira/jiraSiteContracts'
import { createJiraSiteClient } from './features/settings/integrations/jira/jiraSiteClient'
import { AppShell } from './app/AppShell'
import { DispatchNotifications } from './features/ai-work-center/DispatchNotifications'
import { readDispatchNotificationSettings, type DispatchNotificationSettings } from './features/ai-work-center/dispatchNotificationSettings'
import { uniqueJiraAssignments } from './features/jira/jiraAssignment'
import { jiraTicketToSummary } from './features/jira/jiraTicketPresentation'
import { ProjectsOverviewPage } from './features/projects/overview/ProjectsOverviewPage'
import type { ProviderServiceContract } from './features/settings/providers/providerClient'
import { useProviderSettings } from './features/settings/providers/useProviderSettings'
import type { RuleServiceContract } from './features/settings/rules/ruleClient'
import { useAIRules } from './features/settings/rules/useAIRules'
import type { JiraSettingsTab } from './features/settings/integrations/IntegrationsSettingsPage'
import type { GitHubServiceContract } from './features/settings/integrations/github/githubClient'
import { useGitHubIntegration } from './features/settings/integrations/github/useGitHubIntegration'
import { findMatchingGitHubRepo } from './features/projects/detail/projectRepoMatcher'
import { createHttpProjectScanService } from './features/projects/overview/projectScanClient'
import { analyzeProjectJiraBinding, createProjectFromScan, createProjectPlaceholder } from './features/projects/overview/projectJiraAnalyzer'
import { createProjectRepositoryService } from './features/projects/overview/projectRepositoryClient'
import { MCP_PATH, PROMPTS_PATH, PROJECT_OVERVIEW_PATH, SKILLS_PATH } from './app/appRoutes'
import { LanguageProvider, useI18n } from './shared/i18n'
import type { SkillServiceContract } from './features/skills/skillClient'
import type { McpServiceContract } from './features/mcp/mcpClient'

const ProjectDetailPage = lazy(() => import('./features/projects/detail/ProjectDetailPage').then((module) => ({ default: module.ProjectDetailPage })))
const AiWorkCenterPage = lazy(() => import('./features/ai-work-center/AiWorkCenterPage').then((module) => ({ default: module.AiWorkCenterPage })))
const JiraWorkCenterPage = lazy(() => import('./features/jira/JiraWorkCenterPage').then((module) => ({ default: module.JiraWorkCenterPage })))
const SkillsPage = lazy(() => import('./features/skills/SkillsPage').then((module) => ({ default: module.SkillsPage })))
const PromptsPage = lazy(() => import('./features/prompts/PromptsPage').then((module) => ({ default: module.PromptsPage })))
const McpPage = lazy(() => import('./features/mcp/McpPage').then((module) => ({ default: module.McpPage })))
const ThemeSettingsPage = lazy(() => import('./features/settings/theme/ThemeSettingsPage').then((module) => ({ default: module.ThemeSettingsPage })))
const ProviderSettingsPage = lazy(() => import('./features/settings/providers/ProviderSettingsPage').then((module) => ({ default: module.ProviderSettingsPage })))
const AIRulesSettingsPage = lazy(() => import('./features/settings/rules/AIRulesSettingsPage').then((module) => ({ default: module.AIRulesSettingsPage })))
const GitHubSettingsPage = lazy(() => import('./features/settings/integrations/GitHubSettingsPage').then((module) => ({ default: module.GitHubSettingsPage })))
const JiraSettingsPage = lazy(() => import('./features/settings/integrations/JiraSettingsPage').then((module) => ({ default: module.JiraSettingsPage })))

const projectScanService = createHttpProjectScanService()
const projectRepositoryService = createProjectRepositoryService()
const defaultJiraSiteService = createJiraSiteClient()
function routeFromLocation(): MainRouteId {
  if (window.location.pathname === '/settings') return 'settings'
  if (window.location.pathname === '/project-detail' && new URL(window.location.href).searchParams.get('project')?.trim()) return 'detail'
  if (window.location.pathname === '/ai-work-center') return 'ai-work-center'
  if (window.location.pathname === '/jira-work-center') return 'jira-work-center'
  if (window.location.pathname === SKILLS_PATH) return 'skills'
  if (window.location.pathname === MCP_PATH) return 'mcp'
  if (window.location.pathname === PROMPTS_PATH) return 'prompts'
  return 'overview'
}

function settingsTabFromLocation(): SettingsTabId {
  const value = new URL(window.location.href).searchParams.get('settings')
  return value === 'github' || value === 'jira' || value === 'providers' || value === 'rules' || value === 'theme'
    ? value
    : 'theme'
}

function jiraTabFromLocation(): JiraSettingsTab {
  const value = new URL(window.location.href).searchParams.get('jiraTab')
  return value === 'assigned' || value === 'projects' ? value : 'connection'
}

function themeFromLocation(): ThemeId {
  const value = new URL(window.location.href).searchParams.get('theme')
  return isValidThemeId(value) ? value : loadStoredTheme('modern')
}

export interface AppProps {
  jiraService?: JiraService
  jiraSiteService?: JiraSiteServiceContract
  providerService?: ProviderServiceContract
  ruleService?: RuleServiceContract
  githubService?: GitHubServiceContract
  skillService?: SkillServiceContract
  mcpService?: McpServiceContract
  openExternalVerificationUrl?: (url: 'https://github.com/login/device') => void
}

export function App(props: AppProps = {}) {
  return (
    <LanguageProvider>
      <AppContent {...props} />
    </LanguageProvider>
  )
}

function AppContent({
  jiraService,
  jiraSiteService,
  providerService,
  ruleService,
  githubService,
  skillService,
  mcpService,
  openExternalVerificationUrl,
}: AppProps = {}) {
  const { t } = useI18n()
  const [activeRoute, setActiveRoute] = useState<MainRouteId>(() => routeFromLocation())
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>(() => settingsTabFromLocation())
  const [notificationSettings, setNotificationSettings] = useState<DispatchNotificationSettings | null>(null)
  const [activeJiraTab, setActiveJiraTab] = useState<JiraSettingsTab>(() => jiraTabFromLocation())
  const [jiraConnected, setJiraConnected] = useState(false)
  // Fixtures are retained only for the Vitest prototype scenarios; production starts
  // from the SQLite-backed project list and never renders demo cards.
  const [projects, setProjects] = useState<ProjectItem[]>(() => import.meta.env.MODE === 'test' ? DEMO_PROJECTS : [])
  const [projectsLoaded, setProjectsLoaded] = useState(import.meta.env.MODE === 'test')
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => new URL(window.location.href).searchParams.get('project')?.trim() ?? '')
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => themeFromLocation())
  const [runningAnimals, setRunningAnimals] = useState(loadRunningAnimals)
  const [runningAnimalBackground, setRunningAnimalBackground] = useState(loadRunningAnimalBackground)
  const jiraSyncedProjects = useRef(new Set<string>())

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      let settings: DispatchNotificationSettings | null = null
      try { settings = await readDispatchNotificationSettings(controller.signal) }
      catch { /* Fall back to the previous browser preference if the agent is unavailable. */ }
      if (controller.signal.aborted) return
      if (!settings) {
        let inApp = false
        try { inApp = localStorage.getItem('super-developer.dispatch-notifications') === 'true' } catch { /* Optional legacy preference. */ }
        settings = { inApp, desktop: false }
      }
      setNotificationSettings(settings)
    }
    void load()
    return () => controller.abort()
  }, [])

  const providerState = useProviderSettings(providerService)
  const ruleState = useAIRules(ruleService)
  const githubState = useGitHubIntegration({
    service: githubService,
    openExternalVerificationUrl,
  })

  useEffect(() => {
    if (import.meta.env.MODE === 'test' && !jiraSiteService) return
    const controller = new AbortController()
    void (jiraSiteService ?? defaultJiraSiteService).getSnapshot(controller.signal)
      .then(() => { if (!controller.signal.aborted) setJiraConnected(true) })
      .catch(() => { if (!controller.signal.aborted) setJiraConnected(false) })
    return () => controller.abort()
  }, [jiraSiteService])

  useEffect(() => {
    applyAndStoreTheme(activeTheme)
  }, [activeTheme])

  useEffect(() => {
    storeRunningAnimals(runningAnimals)
  }, [runningAnimals])

  useEffect(() => {
    storeRunningAnimalBackground(runningAnimalBackground)
  }, [runningAnimalBackground])

  useEffect(() => {
    let active = true
    void projectRepositoryService.list().then((storedProjects) => {
      if (!active || storedProjects.length === 0) return
      setProjects((previous) => {
        const storedFolders = new Set(storedProjects.map((project) => project.folderDisplayName))
        return [...storedProjects, ...previous.filter((project) => !storedFolders.has(project.folderDisplayName))]
      })
    }).catch(() => {
      // The dashboard still opens with an empty project list while the BFF is unavailable.
    }).finally(() => { if (active) setProjectsLoaded(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (window.location.pathname === '/') {
      const url = new URL(window.location.href)
      url.pathname = PROJECT_OVERVIEW_PATH
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
    if (window.location.pathname === '/project-detail' && !new URL(window.location.href).searchParams.get('project')?.trim()) {
      const url = new URL(window.location.href)
      url.pathname = PROJECT_OVERVIEW_PATH
      url.searchParams.delete('project')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    }
    const handlePopState = () => {
      setActiveRoute(routeFromLocation())
      setActiveSettingsTab(settingsTabFromLocation())
      setActiveJiraTab(jiraTabFromLocation())
      setActiveTheme(themeFromLocation())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!projectsLoaded || window.location.pathname !== '/project-detail') return
    const url = new URL(window.location.href)
    const projectParam = url.searchParams.get('project')?.trim()
    const matchedProject = projectParam
      ? projects.find((project) => project.id === projectParam || project.name === projectParam || project.folderDisplayName === projectParam)
      : undefined
    if (!matchedProject) {
      url.pathname = PROJECT_OVERVIEW_PATH
      url.searchParams.delete('project')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      window.dispatchEvent(new PopStateEvent('popstate'))
      return
    }
  }, [projects, projectsLoaded])

  const selectedProject = projects.find((item) => item.id === selectedProjectId || item.name === selectedProjectId || item.folderDisplayName === selectedProjectId) ?? projects[0]
  const activeJiraService = jiraService ?? defaultJiraService

  useEffect(() => {
    if (activeRoute !== 'detail') {
      jiraSyncedProjects.current.clear()
      return
    }
    const projectKey = selectedProject?.jira.projectKey
    if (!projectsLoaded || !selectedProject || selectedProject.isDemoFixture || selectedProject.jira.tickets.length === 0) return
    if (jiraSyncedProjects.current.has(selectedProject.id)) return
    jiraSyncedProjects.current.add(selectedProject.id)
    const controller = new AbortController()
    void (async () => {
      try {
        const before = await activeJiraService.profile(controller.signal)
        const cloudId = before.selectedCloudId
        if (!cloudId) throw new Error('Jira Site unavailable')
        const liveTickets = projectKey
          ? await activeJiraService.projectTickets(cloudId, projectKey, controller.signal)
          : (await Promise.all(selectedProject.jira.tickets.map(async (summary) => {
              try { return await activeJiraService.detail(cloudId, summary.key, controller.signal) } catch { return null }
            }))).filter((ticket): ticket is NonNullable<typeof ticket> => ticket !== null)
        const after = await activeJiraService.profile(controller.signal)
        if (after.id !== before.id || after.selectedCloudId !== cloudId || controller.signal.aborted) throw new Error('Jira identity changed')
        const liveByKey = new Map(liveTickets.map((ticket) => [ticket.key, ticket] as const))
        const nextTickets = selectedProject.jira.tickets.map((summary) => {
          const live = liveByKey.get(summary.key)
          return live ? jiraTicketToSummary(live) : summary
        })
        const changed = nextTickets.some((ticket, index) => JSON.stringify(ticket) !== JSON.stringify(selectedProject.jira.tickets[index]))
        if (!changed) return
        const updated = await projectRepositoryService.save(
          { ...selectedProject, jira: { ...selectedProject.jira, tickets: nextTickets } },
          selectedProject.folderPath ?? selectedProject.folderDisplayName,
        )
        if (!controller.signal.aborted) setProjects((previous) => previous.map((project) => project.id === updated.id ? updated : project))
      } catch {
        jiraSyncedProjects.current.delete(selectedProject.id)
      }
    })()
    return () => controller.abort()
  }, [activeJiraService, activeRoute, projectsLoaded, selectedProject])
  const handleRefreshGitStatus = useCallback(async (projectId: string, projectPath: string, signal: AbortSignal) => {
    const git = await projectScanService.scanGitStatus(projectPath, signal)
    if (signal.aborted) return
    setProjects((previous) => previous.map((project) =>
      project.id === projectId ? { ...project, git } : project,
    ))
  }, [])
  const handleRefreshProjectProgress = useCallback(async (projectId: string, projectPath: string) => {
    const current = projects.find((project) => project.id === projectId)
    if (!current) throw new Error('找不到要刷新進度的專案。')
    const progress = await projectScanService.scanProgress(projectPath)
    setProjects((previous) => previous.map((project) => project.id === projectId ? { ...project, ...progress } : project))
  }, [projects])
  const handleCompleteProgressTodo = useCallback(async (projectId: string, projectPath: string, todoId: string) => {
    const current = projects.find((project) => project.id === projectId)
    if (!current) throw new Error('找不到要回寫進度的專案。')
    const progress = await projectScanService.completeProgressTodo(projectPath, todoId)
    const saved = await projectRepositoryService.save({ ...current, ...progress }, projectPath)
    setProjects((previous) => previous.map((project) => project.id === projectId ? saved : project))
  }, [projects])
  const mappedGitHubRepo = selectedProject
    ? selectedProject.git.remoteUrl?.trim()
      ? findMatchingGitHubRepo(selectedProject, githubState.github.repositories)
      : githubState.github.mappings.find((m) => m.projectId === selectedProject.id) ??
        findMatchingGitHubRepo(selectedProject, githubState.github.repositories)
    : null

  const handleSelectTheme = (nextTheme: ThemeId) => {
    applyAndStoreTheme(nextTheme)
    setActiveTheme(nextTheme)
  }


  const handleRetryOrProbeProviders = () => {
    if (providerState.agentState === 'offline') {
      void providerState.reloadProviders()
    } else {
      void providerState.probeAllProviders()
    }
  }

  const activeRuleCount = ruleState.rules.filter((r) => r.enabled).length

  const handleAddProjects = async (projectPaths: string[]) => {
    const addedProjects: ProjectItem[] = []
    for (const projectPath of projectPaths) {
      const project = createProjectPlaceholder(projectPath, `project-local-${Date.now()}-${addedProjects.length}`)
      addedProjects.push(await projectRepositoryService.save(project, projectPath))
    }
    const addedPaths = new Set(addedProjects.map((project) => project.folderDisplayName))
    setProjects((previous) => [
      ...addedProjects,
      ...previous.filter((project) => !addedPaths.has(project.folderDisplayName)),
    ])
    if (addedProjects[0]) setSelectedProjectId(addedProjects[0].id)
    return addedProjects
  }

  const handleAnalyzeProject = async (projectId: string) => {
    const current = projects.find((project) => project.id === projectId)
    if (!current) throw new Error('找不到要分析的專案。')
    const projectPath = current.folderPath ?? current.folderDisplayName
    const snapshot = await projectScanService.scan(projectPath)
    const analyzed = await analyzeProjectJiraBinding(
      {
        ...current,
        ...createProjectFromScan(snapshot, current.id),
        folderDisplayName: current.folderDisplayName,
        folderPath: projectPath,
        jira: current.jira,
      },
    )
    const saved = await projectRepositoryService.save(analyzed, projectPath)
    setProjects((previous) => previous.map((project) => project.id === projectId ? saved : project))
    setSelectedProjectId(saved.id)
    return saved
  }

  const handleSaveArchitectureAnalysis = async (projectId: string, analysis: ProjectArchitectureAnalysis) => {
    const saved = await projectRepositoryService.saveArchitectureAnalysis(projectId, analysis)
    setProjects((previous) => previous.map((project) => project.id === projectId ? saved : project))
  }

  const handleReloadArchitectureAnalysis = async (projectId: string) => {
    const storedProjects = await projectRepositoryService.list()
    const refreshed = storedProjects.find((project) => project.id === projectId)
    if (!refreshed?.architectureAnalysis) throw new Error('資料庫中找不到此專案已保存的架構分析。')
    setProjects((previous) => previous.map((project) => project.id === projectId ? refreshed : project))
  }

  const handleAssignJiraTickets = async (projectId: string, tickets: JiraTicketSummary[]) => {
    const current = projects.find((project) => project.id === projectId)
    if (!current) throw new Error('找不到要指派 Jira Ticket 的本機專案。')
    const uniqueTickets = uniqueJiraAssignments(projects, projectId, tickets)
    const updated = await projectRepositoryService.save(
      { ...current, jira: { ...current.jira, tickets: uniqueTickets } },
      current.folderPath ?? current.folderDisplayName,
    )
    setProjects((previous) => previous.map((project) => project.id === projectId ? updated : project))
    return updated
  }

  const handleRemoveProjects = async (projectIds: string[]) => {
    const removableIds = new Set(projects.filter((project) => projectIds.includes(project.id) && !project.isDemoFixture).map((project) => project.id))
    await Promise.all([...removableIds].map((projectId) => projectRepositoryService.remove(projectId)))
    const remainingProjects = projects.filter((project) => !removableIds.has(project.id))
    setProjects(remainingProjects)
    if (removableIds.has(selectedProjectId)) setSelectedProjectId(remainingProjects[0]?.id ?? '')
  }

  const handleRemoveProject = async (projectId: string) => {
    await handleRemoveProjects([projectId])
  }

  const handleToggleProjectPinned = async (projectId: string) => {
    const current = projects.find((project) => project.id === projectId)
    if (!current) return
    const nextPinned = !current.pinned
    if (current.isDemoFixture) {
      setProjects((previous) => previous.map((project) => project.id === projectId ? { ...project, pinned: nextPinned } : project))
      return
    }
    const updated = await projectRepositoryService.save(
      { ...current, pinned: nextPinned },
      current.folderPath ?? current.folderDisplayName,
    )
    setProjects((previous) => previous.map((project) => project.id === projectId ? updated : project))
  }

  const handleSelectSettingsTab = (tab: SettingsTabId) => {
    setActiveSettingsTab(tab)
    if (tab === 'jira') setActiveJiraTab('connection')
    const url = new URL(window.location.href)
    url.pathname = '/settings'
    url.searchParams.delete('error')
    url.searchParams.set('settings', tab)
    if (tab === 'jira') url.searchParams.set('jiraTab', 'connection')
    else url.searchParams.delete('jiraTab')
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }

  const handleSelectJiraTab = (tab: JiraSettingsTab) => {
    setActiveJiraTab(tab)
    const url = new URL(window.location.href)
    url.pathname = '/settings'
    url.searchParams.set('settings', 'jira')
    url.searchParams.set('jiraTab', tab)
    window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    if (activeRoute !== 'detail') return
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    const url = new URL(window.location.href)
    url.pathname = '/project-detail'
    url.searchParams.delete('type')
    url.searchParams.set('project', project.name)
    window.history.replaceState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }

  const handleOpenProjectDetail = (projectId: string) => {
    const project = projects.find((item) => item.id === projectId)
    if (!project) return
    setSelectedProjectId(project.id)
    setActiveRoute('detail')
    const url = new URL(window.location.href)
    url.pathname = '/project-detail'
    url.searchParams.delete('settings')
    url.searchParams.delete('type')
    url.searchParams.delete('tab')
    url.searchParams.delete('code')
    url.searchParams.delete('jira')
    url.searchParams.set('project', project.name)
    window.history.pushState({}, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }

  const handleNavigateRoute = (route: MainRouteId) => {
    const projectForDetail = projects.find((item) => item.id === selectedProjectId) ?? projects[0]
    const targetRoute = route === 'detail' && !projectForDetail ? 'overview' : route
    setActiveRoute(targetRoute)
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    if (targetRoute === 'overview') {
      url.pathname = PROJECT_OVERVIEW_PATH
      url.searchParams.delete('settings')
      url.searchParams.delete('type')
      url.searchParams.delete('project')
      url.searchParams.delete('tab')
      url.searchParams.delete('code')
      url.searchParams.delete('jira')
      url.searchParams.delete('jiraTab')
    } else if (targetRoute === 'detail') {
      url.pathname = '/project-detail'
      url.searchParams.delete('settings')
      url.searchParams.delete('type')
      url.searchParams.delete('jiraTab')
      url.searchParams.set('project', projectForDetail?.name ?? '')
    } else if (targetRoute === 'ai-work-center') {
      url.pathname = '/ai-work-center'
      url.searchParams.delete('settings')
      url.searchParams.delete('type')
      url.searchParams.delete('project')
      url.searchParams.delete('tab')
      url.searchParams.delete('code')
      url.searchParams.delete('jira')
      url.searchParams.delete('jiraTab')
    } else if (targetRoute === 'jira-work-center') {
      url.pathname = '/jira-work-center'
      url.searchParams.set('type', 'job_list')
      url.searchParams.delete('settings')
      url.searchParams.delete('project')
      url.searchParams.delete('tab')
      url.searchParams.delete('code')
      url.searchParams.delete('jira')
      url.searchParams.delete('jiraTab')
    } else if (targetRoute === 'skills') {
      url.pathname = SKILLS_PATH
      url.searchParams.delete('settings')
      url.searchParams.delete('type')
      url.searchParams.delete('project')
      url.searchParams.delete('tab')
      url.searchParams.delete('code')
      url.searchParams.delete('jira')
      url.searchParams.delete('jiraTab')
    } else if (targetRoute === 'mcp' || targetRoute === 'prompts') {
      url.pathname = targetRoute === 'mcp' ? MCP_PATH : PROMPTS_PATH
      url.searchParams.delete('settings')
      url.searchParams.delete('type')
      url.searchParams.delete('project')
      url.searchParams.delete('tab')
      url.searchParams.delete('code')
      url.searchParams.delete('jira')
      url.searchParams.delete('jiraTab')
    } else {
      url.pathname = '/settings'
      url.searchParams.delete('project')
      url.searchParams.delete('type')
      url.searchParams.delete('tab')
      url.searchParams.delete('code')
      url.searchParams.delete('jira')
      url.searchParams.delete('jiraTab')
      if (!url.searchParams.has('settings')) url.searchParams.set('settings', activeSettingsTab)
    }
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }

  return (
    <AppShell
      activeRoute={activeRoute}
      activeSettingsTab={activeSettingsTab}
      selectedProjectId={selectedProject?.id ?? ''}
      projects={projects}
      providers={providerState.providers}
      activeTheme={activeTheme}
      activeRuleCount={activeRuleCount}
      providerAgentState={providerState.agentState}
        githubConnected={githubState.github.flowState === 'connected'}
        jiraConnected={jiraConnected}
      isProbingProviders={providerState.isProbingAll}
      onNavigateRoute={handleNavigateRoute}
      onSelectProject={handleSelectProject}
      onSelectSettingsTab={handleSelectSettingsTab}
      onSelectTheme={handleSelectTheme}
      onSelectProviderFromSidebar={(providerId) => {
        providerState.setFocusedProviderId(providerId)
      }}
      onRetryProviderAgent={handleRetryOrProbeProviders}
    >
      {notificationSettings && (notificationSettings.inApp || notificationSettings.desktop)
        ? <DispatchNotifications key={`${notificationSettings.inApp}-${notificationSettings.desktop}`} settings={notificationSettings} />
        : null}
      <Suspense fallback={<div className="sd-empty-state" role="status">{t('common.loading')}</div>}>
      {activeRoute === 'overview' ? (
        <ProjectsOverviewPage
          runningAnimals={runningAnimals}
          runningAnimalBackground={runningAnimalBackground}
          projects={projects}
          providers={providerState.providers}
          onAddProjects={handleAddProjects}
          onAnalyzeProject={handleAnalyzeProject}
          onRemoveProject={handleRemoveProject}
          onToggleProjectPinned={handleToggleProjectPinned}
          onPickProjectFolders={projectScanService.pickFolders}
          onOpenProjectDetail={(projectId) => {
            handleOpenProjectDetail(projectId)
          }}
        />
      ) : null}

      {activeRoute === 'detail' && selectedProject ? (
        <ProjectDetailPage
          project={selectedProject}
          allProjects={projects}
          providers={providerState.providers}
          rules={ruleState.rules}
          mappedGitHubRepo={mappedGitHubRepo}
          onRefreshGitStatus={handleRefreshGitStatus}
          onRefreshProgress={handleRefreshProjectProgress}
          onCompleteProgressTodo={handleCompleteProgressTodo}
          onSaveArchitectureAnalysis={handleSaveArchitectureAnalysis}
          onReloadArchitectureAnalysis={handleReloadArchitectureAnalysis}
          jiraService={jiraService ?? defaultJiraService}
          jiraSiteService={jiraSiteService ?? defaultJiraSiteService}
          onAddProjects={handleAddProjects}
          onRemoveProjects={handleRemoveProjects}
          onPickProjectFolders={projectScanService.pickFolders}
          onSelectProject={handleSelectProject}
          onOpenSettingsTab={(tab) => {
            handleSelectSettingsTab(tab)
            handleNavigateRoute('settings')
          }}
        />
      ) : activeRoute === 'detail' ? (
        <div className="sd-empty-state">{t('common.addAProjectFromProjectOverviewFirst')}</div>
      ) : null}

      {activeRoute === 'ai-work-center' ? (
        <AiWorkCenterPage providers={providerState.providers} projects={projects} onSaveArchitectureAnalysis={handleSaveArchitectureAnalysis} />
      ) : null}

      {activeRoute === 'jira-work-center' ? (
        <JiraWorkCenterPage
          projects={projects}
          jiraService={jiraService ?? defaultJiraService}
          jiraSiteService={jiraSiteService ?? defaultJiraSiteService}
          onAssignJiraTickets={handleAssignJiraTickets}
          onOpenProjectDetail={(projectId) => {
            handleOpenProjectDetail(projectId)
          }}
          onNavigateToJiraSettings={() => {
            handleSelectSettingsTab('jira')
            handleNavigateRoute('settings')
          }}
        />
      ) : null}

      {activeRoute === 'skills' ? (
        <SkillsPage providers={providerState.providers} skillService={skillService} />
      ) : null}

      {activeRoute === 'prompts' ? <PromptsPage providers={providerState.providers} /> : null}

      {activeRoute === 'mcp' ? (
        <McpPage providers={providerState.providers} mcpService={mcpService} />
      ) : null}

      {activeRoute === 'settings' && activeSettingsTab === 'theme' ? (
        <ThemeSettingsPage
          runningAnimals={runningAnimals}
          onSelectAnimals={setRunningAnimals}
          runningAnimalBackground={runningAnimalBackground}
          onSelectAnimalBackground={setRunningAnimalBackground}
          activeTheme={activeTheme}
          onSelectTheme={handleSelectTheme}
        />
      ) : null}

      {activeRoute === 'settings' && activeSettingsTab === 'providers' ? (
        <ProviderSettingsPage
          notificationSettings={notificationSettings}
          onSaveNotificationSettings={setNotificationSettings}
          providers={providerState.providers}
          agentState={providerState.agentState}
          agentError={providerState.agentError}
          busyProviderIds={providerState.busyProviderIds}
          isProbingAll={providerState.isProbingAll}
          focusedProviderId={providerState.focusedProviderId}
          feedback={providerState.feedback}
          onClearFeedback={providerState.clearFeedback}
          onReloadProviders={providerState.reloadProviders}
          onProbeProvider={providerState.probeSingleProvider}
          onProbeAllProviders={providerState.probeAllProviders}
          onSaveProviderConfig={providerState.saveProviderConfig}
          onCreateCustomProvider={providerState.createCustomProvider}
          onDeleteCustomProvider={providerState.deleteCustomProvider}
          onTriggerProviderLogin={providerState.triggerProviderLogin}
        />
      ) : null}

      {activeRoute === 'settings' && activeSettingsTab === 'rules' ? (
        <AIRulesSettingsPage
          rules={ruleState.rules}
          agentState={ruleState.agentState}
          agentError={ruleState.agentError}
          isBusy={ruleState.isBusy}
          feedback={ruleState.feedback}
          onClearFeedback={ruleState.clearFeedback}
          onReloadRules={ruleState.reloadRules}
          onReloadSingleRule={ruleState.reloadSingleRule}
          onAddRule={ruleState.addRuleToAgent}
          onUpdateRule={ruleState.updateRuleFile}
          onToggleRule={ruleState.toggleRuleEnabled}
          onMoveRule={ruleState.moveRuleOrder}
          onRemoveRule={ruleState.deleteRuleFromAgent}
          providers={providerState.providers}
          onCheckRuleApplication={ruleState.checkRuleApplication}
          onApplyRule={ruleState.applyRule}
        />
      ) : null}

      {activeRoute === 'settings' && activeSettingsTab === 'github' ? (
        <GitHubSettingsPage
          integrations={INITIAL_INTEGRATIONS}
          projects={projects}
          githubService={githubService}
          githubState={githubState}
          jiraSiteService={jiraSiteService}
          openExternalVerificationUrl={openExternalVerificationUrl}
        />
      ) : null}

      {activeRoute === 'settings' && activeSettingsTab === 'jira' ? (
        <JiraSettingsPage
          integrations={INITIAL_INTEGRATIONS}
          projects={projects}
          githubService={githubService}
          githubState={githubState}
          jiraService={jiraService}
          jiraSiteService={jiraSiteService}
          jiraTab={activeJiraTab}
          onSelectJiraTab={handleSelectJiraTab}
          onJiraConnectionChange={setJiraConnected}
          onAssignJiraTickets={handleAssignJiraTickets}
          onNavigateRoute={handleNavigateRoute}
          openExternalVerificationUrl={openExternalVerificationUrl}
        />
      ) : null}
      </Suspense>

    </AppShell>
  )
}
