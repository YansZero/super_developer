import { useState, type ReactNode } from 'react'
import type {
  MainRouteId,
  ProjectItem,
  ProviderAgentState,
  ProviderId,
  ProviderSummary,
  SettingsTabId,
  ThemeId,
} from '../shared/types/domain'
import { THEME_OPTIONS } from '../shared/data/fixtures'
import { getProviderPresentation, getProviderStatusKey } from '../shared/providers/providerPresentation'
import { StatusBadge } from '../shared/components/StatusBadge'
import './styles/shell-sidebar.css'
import './AppShell.css'
import './styles/shell-themes.css'
import { SidebarNavIcon } from './SidebarNavIcon'
import { LanguageSwitcher, useI18n, type TranslationKey } from '../shared/i18n'
interface AppShellProps {
  activeRoute: MainRouteId
  activeSettingsTab: SettingsTabId
  selectedProjectId: string
  projects: ProjectItem[]
  providers: ProviderSummary[]
  activeTheme: ThemeId
  activeRuleCount: number
  providerAgentState?: ProviderAgentState
  isProbingProviders?: boolean
  githubConnected?: boolean
  jiraConnected?: boolean
  onNavigateRoute: (route: MainRouteId) => void
  onSelectProject: (projectId: string) => void
  onSelectSettingsTab: (tab: SettingsTabId) => void
  onSelectTheme: (theme: ThemeId) => void
  onSelectProviderFromSidebar?: (providerId: ProviderId) => void
  onRetryProviderAgent?: () => void
  children: ReactNode
}

const SETTINGS_NAV_ITEMS: Array<{
  id: 'github' | 'jira' | 'theme'
  labelKey: TranslationKey
  iconKind: 'github' | 'jira' | 'theme'
}> = [
  { id: 'github', labelKey: 'shell.github', iconKind: 'github' },
  { id: 'jira', labelKey: 'shell.jira', iconKind: 'jira' },
  { id: 'theme', labelKey: 'shell.theme', iconKind: 'theme' },
]

const AI_AGENT_NAV_ITEMS = [
  { id: 'providers' as const, labelKey: 'shell.providers' as const, iconKind: 'providers' as const },
  { id: 'rules' as const, labelKey: 'shell.rules' as const, iconKind: 'rules' as const },
  { id: 'skills' as const, labelKey: 'shell.skills' as const, iconKind: 'skills' as const },
  { id: 'mcp' as const, labelKey: 'shell.mcp' as const, iconKind: 'mcp' as const },
  { id: 'prompts' as const, labelKey: 'prompts.title' as const, iconKind: 'rules' as const },
  { id: 'work-center' as const, labelKey: 'shell.workCenter' as const, iconKind: 'ai-work-center' as const },
  { id: 'jira-work-center' as const, labelKey: 'shell.jiraWorkCenter' as const, iconKind: 'jira' as const },
]

export function AppShell({
  activeRoute,
  activeSettingsTab,
  selectedProjectId,
  projects,
  providers,
  activeTheme,
  activeRuleCount,
  providerAgentState = 'offline',
  isProbingProviders = false,
  githubConnected = false,
  jiraConnected = false,
  onNavigateRoute,
  onSelectProject,
  onSelectSettingsTab,
  onSelectTheme,
  onSelectProviderFromSidebar,
  onRetryProviderAgent,
  children,
}: AppShellProps) {
  const { t } = useI18n()
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isProjectsCollapsed, setIsProjectsCollapsed] = useState(false)
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false)
  const [isAiAgentCollapsed, setIsAiAgentCollapsed] = useState(false)
  const [isProviderStatusExpanded, setIsProviderStatusExpanded] = useState(false)
  const verifiedNormalProviders = providers.filter((p) => p.statusKind === 'normal').length
  const selectedProject = projects.find((project) =>
    project.id === selectedProjectId || project.name === selectedProjectId || project.folderDisplayName === selectedProjectId,
  )
  const pinnedProjects = projects.filter((project) => project.pinned)
  const agentBadgeLabel =
    providerAgentState === 'online'
      ? t('shell.localProbeConnected')
      : providerAgentState === 'checking'
        ? t('shell.localProbeChecking')
        : t('shell.agentOffline')

  const agentBadgeTone =
    providerAgentState === 'online'
      ? 'ok'
      : providerAgentState === 'checking'
        ? 'accent'
        : 'warn'

  const settingsRouteLabel: Record<SettingsTabId, string> = {
    providers: 'ai-providers',
    rules: 'ai-rules',
    github: 'github-integration',
    jira: 'jira-integration',
    theme: 'theme',
    integrations: 'integrations',
  }

  if (
    import.meta.env.MODE !== 'test' &&
    (activeRoute === 'overview' || activeRoute === 'detail' || activeRoute === 'settings' || activeRoute === 'jira-work-center' || activeRoute === 'ai-work-center' || activeRoute === 'skills' || activeRoute === 'mcp' || activeRoute === 'prompts') &&
    (activeSettingsTab === 'providers' || activeSettingsTab === 'rules' || activeSettingsTab === 'github' || activeSettingsTab === 'jira' || activeSettingsTab === 'theme')
  ) {
    const settingsTabs: Array<{ id: SettingsTabId; label: string }> = [
      { id: 'providers', label: t('shell.providers') },
      { id: 'rules', label: t('shell.rules') },
      { id: 'github', label: t('shell.github') },
      { id: 'jira', label: t('shell.jira') },
      { id: 'theme', label: t('common.themeSettings') },
    ]
    const sidebarRoute = String(activeRoute)

    return (
      <div className={`sd-stitch-settings${activeRoute === 'detail' || activeRoute === 'ai-work-center' || activeRoute === 'skills' || activeRoute === 'mcp' || activeRoute === 'prompts' ? ' sd-stitch-settings--detail' : ''}`}>
        <aside className="sd-stitch-settings__sidebar" aria-label="主導覽">
          <div className="sd-stitch-settings__brand">
            <svg className="sd-stitch-settings__brand-icon" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="sdStitchGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <linearGradient id="sdStitchGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#a855f7" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <polygon points="50,10 84,30 84,70 50,90 16,70 16,30" stroke="url(#sdStitchGrad1)" strokeWidth="6" strokeOpacity="0.45" fill="none" />
              <path d="M 41,26 L 23,42 L 41,58" stroke="url(#sdStitchGrad1)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 59,42 L 77,58 L 59,74" stroke="url(#sdStitchGrad2)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 41,41 L 59,59" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" />
              <circle cx="50" cy="50" r="6" fill="#38bdf8" />
            </svg>
            <span>SUPER DEVELOPER</span>
          </div>
          <span className="sd-stitch-settings__eyebrow">WORKSPACE</span>
          <nav className="sd-stitch-settings__nav" aria-label={t('shell.navLabel')}>
            <button type="button" className={sidebarRoute === 'overview' ? 'is-active' : ''} onClick={() => onNavigateRoute('overview')}><SidebarNavIcon kind="overview" />{t('shell.overview')}</button>
            <button type="button" className={sidebarRoute === 'detail' ? 'is-active' : ''} onClick={() => onNavigateRoute('detail')}><SidebarNavIcon kind="detail" />{t('shell.detail')}</button>
            <button type="button" className={sidebarRoute === 'ai-work-center' ? 'is-active' : ''} onClick={() => onNavigateRoute('ai-work-center')}><SidebarNavIcon kind="ai-work-center" />{t('shell.workCenter')}</button>
            <button type="button" className={sidebarRoute === 'jira-work-center' ? 'is-active' : ''} onClick={() => onNavigateRoute('jira-work-center')}><SidebarNavIcon kind="jira" />{t('shell.jiraWorkCenter')}</button>
            <span className="sd-stitch-settings__nav-divider" aria-hidden="true" />
            <button type="button" className={sidebarRoute === 'settings' ? 'is-active' : ''} onClick={() => onNavigateRoute('settings')}><SidebarNavIcon kind="settings" />{t('shell.settings')}</button>
            <button type="button" className={sidebarRoute === 'skills' ? 'is-active' : ''} onClick={() => onNavigateRoute('skills')}><SidebarNavIcon kind="skills" />{t('shell.skills')}</button>
            <button type="button" className={sidebarRoute === 'mcp' ? 'is-active' : ''} onClick={() => onNavigateRoute('mcp')}><SidebarNavIcon kind="mcp" />{t('shell.mcp')}</button>
            <button type="button" className={sidebarRoute === 'prompts' ? 'is-active' : ''} onClick={() => onNavigateRoute('prompts')}><SidebarNavIcon kind="rules" />{t('prompts.title')}</button>
          </nav>
          <div className="sd-stitch-settings__sidebar-foot">
            <section className="sd-stitch-settings__providers" aria-label={t('shell.providerSidebarLabel')}>
              <button
                type="button"
                className="sd-stitch-settings__providers-toggle"
                aria-label={t('shell.providerStatus')}
                aria-expanded={isProviderStatusExpanded}
                aria-controls="sd-stitch-provider-list"
                onClick={() => setIsProviderStatusExpanded((value) => !value)}
              >
                <span className="sd-stitch-settings__providers-head">
                  <span className="sd-stitch-settings__providers-title">{t('shell.providerStatus')}</span>
                  <span className="sd-stitch-settings__probe-badge">
                    <span className={`sd-stitch-settings__status-dot is-${providerAgentState}`} />
                    <span>{t('shell.aiConnectionStatus')}</span>
                  </span>
                </span>
                <span className="sd-stitch-settings__providers-chevron" aria-hidden="true">{isProviderStatusExpanded ? '»' : '«'}</span>
              </button>
              {isProviderStatusExpanded ? <ul id="sd-stitch-provider-list" className="sd-stitch-settings__provider-list">
                {providers.map((provider) => {
                  const presentation = getProviderPresentation(provider)
                  const providerStatusKey = getProviderStatusKey(provider) ?? presentation.statusText
                  return (
                    <li key={provider.id} className="sd-stitch-settings__provider-item">
                      <button
                        type="button"
                        className="sd-stitch-settings__provider-btn"
                        onClick={() => {
                          onSelectSettingsTab('providers')
                          onNavigateRoute('settings')
                          onSelectProviderFromSidebar?.(provider.id)
                        }}
                        title={`${provider.name}: ${t(providerStatusKey, { version: provider.version ?? '' })}`}
                        aria-label={`${provider.name}: ${t(providerStatusKey, { version: provider.version ?? '' })}`}
                      >
                        <span
                          className={`sd-stitch-settings__provider-dot is-${presentation.visualKind}`}
                          aria-hidden="true"
                        />
                        <div className="sd-stitch-settings__provider-body">
                          <div className="sd-stitch-settings__provider-row">
                            <span className="sd-stitch-settings__provider-name">{provider.name}</span>
                            <span className="sd-stitch-settings__provider-tag">
                              {provider.version
                                ? `v${provider.version}`
                                : provider.isBuiltin
                                  ? t('shell.builtin')
                                  : t('shell.custom')}
                            </span>
                          </div>
                          <span className={`sd-stitch-settings__provider-status is-${presentation.visualKind}`}>
                            {t(providerStatusKey, { version: provider.version ?? '' })}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul> : null}
            </section>
          </div>
        </aside>
        <div className="sd-stitch-settings__workspace">
          <header className="sd-stitch-settings__topbar">
            <div>
              <span>super-dev</span><span>/</span>
              <strong>{activeRoute === 'overview' ? 'project-overview' : activeRoute === 'detail' ? 'project-detail' : activeRoute === 'jira-work-center' ? 'jira-work-center' : activeRoute === 'ai-work-center' ? 'ai-work-center' : activeRoute === 'skills' ? 'skills' : activeRoute === 'mcp' ? 'mcp' : activeRoute === 'prompts' ? 'prompts' : `settings / ${settingsRouteLabel[activeSettingsTab]}`}</strong>
              {activeRoute === 'detail' && selectedProject ? <><span>/</span><strong>{selectedProject.name}</strong></> : null}
            </div>
            <div className="sd-stitch-settings__topbar-actions">
              {activeRoute === 'detail' && selectedProject ? <StatusBadge label={selectedProject.git.status === 'normal' && !selectedProject.isDemoFixture ? 'SYNCHRONIZED' : selectedProject.git.status === 'no-git' ? 'NO GIT REPOSITORY' : 'NOT ANALYZED'} tone={selectedProject.git.status === 'normal' && !selectedProject.isDemoFixture ? 'ok' : 'neutral'} mono /> : null}
              {activeSettingsTab === 'providers' ? <StatusBadge label={agentBadgeLabel} tone={agentBadgeTone} /> : null}
              <LanguageSwitcher />
            </div>
          </header>
          {activeRoute === 'settings' ? <nav className="sd-stitch-settings__tabs" aria-label="設定分類">
            {settingsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={tab.id === activeSettingsTab ? 'is-active' : ''}
                aria-current={tab.id === activeSettingsTab ? 'page' : undefined}
                onClick={() => onSelectSettingsTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav> : null}
          <main className="sd-stitch-settings__main">{children}</main>
        </div>
      </div>
    )
  }

  return (
    <div className="sd-shell">
      {/* 90 年代視窗系統標題列 (Retro 專用) */}
      <div className="sd-shell__retro-titlebar" aria-hidden="true">
        <div className="sd-shell__retro-titlebar-main">
          <span className="sd-shell__retro-titlebar-icon">💾</span>
          <span className="sd-shell__retro-titlebar-text">Super Developer - [專案管理系統 v1.0.0.exe]</span>
        </div>
        <div className="sd-shell__retro-titlebar-actions">
          <button type="button" className="sd-shell__retro-sysbtn" tabIndex={-1} aria-label="最小化">_</button>
          <button type="button" className="sd-shell__retro-sysbtn" tabIndex={-1} aria-label="最大化">□</button>
          <button type="button" className="sd-shell__retro-sysbtn sd-shell__retro-sysbtn--close" tabIndex={-1} aria-label="關閉">✕</button>
        </div>
      </div>

      {/* 90 年代經典選單列 (Retro 專用) */}
      <div className="sd-shell__retro-menubar" aria-hidden="true">
        <span className="sd-shell__retro-menu-item">檔案(<u>F</u>)</span>
        <span className="sd-shell__retro-menu-item">編輯(<u>E</u>)</span>
        <span className="sd-shell__retro-menu-item">檢視(<u>V</u>)</span>
        <span className="sd-shell__retro-menu-item">專案(<u>P</u>)</span>
        <span className="sd-shell__retro-menu-item">說明(<u>H</u>)</span>
      </div>

      {/* 電競戰況 HUD 戰術通訊列 (Esports 專用) */}
      <div className="sd-shell__esports-hud" aria-hidden="true">
        <div className="sd-shell__esports-hud-brand">
          <span className="sd-shell__esports-hud-badge">TAC-HUD</span>
          <span className="sd-shell__esports-hud-name">SUPER DEVELOPER // CYBERNETIC COCKPIT</span>
        </div>
        <div className="sd-shell__esports-hud-telemetry">
          <span className="sd-shell__esports-hud-metric">FREQ: 433.92MHZ</span>
          <span className="sd-shell__esports-hud-metric">SYS_LINK: 100%</span>
          <span className="sd-shell__esports-hud-metric sd-shell__esports-hud-metric--alert">DEFCON 1</span>
        </div>
      </div>

      {/* 8-Bit 像素冒險公會計分標頭 (8-Bit 專用) */}
      <div className="sd-shell__8bit-header" aria-hidden="true">
        <div className="sd-shell__8bit-header-left">
          <span className="sd-shell__8bit-star">★</span>
          <span>8-BIT DEV GUILD</span>
        </div>
        <div className="sd-shell__8bit-header-right">
          <span>STAGE 1-1</span>
          <span>SCORE: 099820</span>
          <span>COIN: ×99</span>
        </div>
      </div>

      <div className={`sd-shell__body ${isSidebarCollapsed ? 'sd-shell__body--sidebar-collapsed' : ''}`}>
        <aside
          className={`sd-shell__sidebar ${isSidebarCollapsed ? 'sd-shell__sidebar--collapsed' : ''}`}
          aria-label={t('shell.sidebarLabel')}
        >
        <div className="sd-shell__brand">
          <div className="sd-shell__brand-row">
            <div className="sd-shell__brand-identity">
              <span className="sd-shell__brand-mark" aria-hidden="true" title="我的專案室">
                <svg className="sd-shell__brand-svg" viewBox="0 0 100 100" fill="none">
                  <defs>
                    <linearGradient id="sdShellGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                    <linearGradient id="sdShellGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#6366f1" />
                    </linearGradient>
                  </defs>
                  <polygon points="50,10 84,30 84,70 50,90 16,70 16,30" stroke="url(#sdShellGrad1)" strokeWidth="6" strokeOpacity="0.45" fill="none" />
                  <path d="M 41,26 L 23,42 L 41,58" stroke="url(#sdShellGrad1)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M 59,42 L 77,58 L 59,74" stroke="url(#sdShellGrad2)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M 41,41 L 59,59" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
                  <circle cx="50" cy="50" r="6" fill="#38bdf8" />
                </svg>
              </span>
              {!isSidebarCollapsed && (
                <div className="sd-shell__brand-titles">
                <span className="sd-shell__brand-title">{t('shell.brandTitle')}</span>
                  <span className="sd-shell__brand-en">Super Developer</span>
                </div>
              )}
            </div>
            <button
              type="button"
              className="sd-shell__collapse-toggle"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
              title={isSidebarCollapsed ? t('shell.expandSidebar') : t('shell.collapseSidebar')}
              aria-expanded={!isSidebarCollapsed}
            >
              <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                {isSidebarCollapsed ? (
                  <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M10 3.5L5.5 8L10 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          </div>
          {!isSidebarCollapsed && <p className="sd-shell__brand-sub">{t('shell.brandSubtitle')}</p>}
        </div>

        <nav className="sd-shell__nav" aria-label="主要功能選單">
          <div className="sd-shell__nav-group sd-shell__nav-group--projects">
            <button
              type="button"
              className="sd-shell__settings-header sd-shell__settings-header--toggle"
              onClick={() => setIsProjectsCollapsed((prev) => !prev)}
              aria-expanded={!isProjectsCollapsed}
              aria-controls="sd-projects-subnav"
              title={isProjectsCollapsed ? t('shell.expandProjects') : t('shell.collapseProjects')}
              aria-label={isProjectsCollapsed ? t('shell.expandProjects') : t('shell.collapseProjects')}
            >
              <span className="sd-shell__settings-title">
                <SidebarNavIcon kind="all-projects" />
                {!isSidebarCollapsed && <span>{t('shell.projects')}</span>}
              </span>
              {!isSidebarCollapsed && (
                <>
                  <span className="sd-shell__nav-meta">{projects.length}</span>
                  <svg
                    className={`sd-shell__chevron ${isProjectsCollapsed ? 'sd-shell__chevron--collapsed' : ''}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M3.5 10L8 5.5L12.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
            {!isProjectsCollapsed && (
              <div id="sd-projects-subnav" className="sd-shell__subnav">
                <button
                  type="button"
                  className={`sd-shell__nav-btn sd-shell__nav-btn--sub ${activeRoute === 'overview' ? 'sd-shell__nav-btn--active' : ''}`}
                  onClick={() => onNavigateRoute('overview')}
                  title={t('shell.overview')}
                  aria-label={t('shell.overview')}
                  aria-current={activeRoute === 'overview' ? 'page' : undefined}
                >
                  <span className="sd-shell__nav-item-main">
                    <SidebarNavIcon kind="overview" />
                    {!isSidebarCollapsed && <span>{t('shell.overview')}</span>}
                  </span>
                </button>
                <button
                  type="button"
                  className={`sd-shell__nav-btn sd-shell__nav-btn--sub ${activeRoute === 'detail' ? 'sd-shell__nav-btn--active' : ''}`}
                  onClick={() => onNavigateRoute('detail')}
                  title={t('shell.detail')}
                  aria-label={t('shell.detail')}
                  aria-current={activeRoute === 'detail' ? 'page' : undefined}
                >
                  <span className="sd-shell__nav-item-main">
                    <SidebarNavIcon kind="detail" />
                    {!isSidebarCollapsed && <span>{t('shell.detail')}</span>}
                  </span>
                </button>
                {projects.length === 0 ? (
                  !isSidebarCollapsed && <span className="sd-shell__empty-projects">{t('shell.noProjects')}</span>
                ) : (
                  <>
                    {!isSidebarCollapsed && (
                      <div className="sd-shell__settings-header sd-shell__settings-header--static sd-shell__pinned-heading">
                        <span>{t('shell.pinnedProjects')}</span>
                        <span className="sd-shell__nav-meta">{pinnedProjects.length}</span>
                      </div>
                    )}
                    {pinnedProjects.length === 0 ? (
                      !isSidebarCollapsed && <span className="sd-shell__empty-projects">{t('shell.pinnedEmpty')}</span>
                    ) : pinnedProjects.map((proj) => {
                      const isSelected = activeRoute === 'detail' && proj.id === selectedProjectId
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          className={`sd-shell__proj-btn ${isSelected ? 'sd-shell__proj-btn--active' : ''}`}
                          onClick={() => {
                            onSelectProject(proj.id)
                            onNavigateRoute('detail')
                          }}
                          title={proj.name}
                          aria-label={proj.name}
                          aria-current={isSelected ? 'page' : undefined}
                        >
                          {isSidebarCollapsed ? (
                            <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M2.5 3.5C2.5 2.95 2.95 2.5 3.5 2.5H6.2L7.6 4.1H13.5C14.05 4.1 14.5 4.55 14.5 5.1V12.5C14.5 13.05 14.05 13.5 13.5 13.5H3.5C2.95 13.5 2.5 13.05 2.5 12.5V3.5Z" stroke="currentColor" strokeWidth="1.4" />
                            </svg>
                          ) : (
                            <span className="sd-shell__proj-name">{proj.name}</span>
                          )}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="sd-shell__nav-group sd-shell__nav-group--settings">
            <button
              type="button"
              className="sd-shell__settings-header sd-shell__settings-header--toggle"
              onClick={() => setIsSettingsCollapsed((prev) => !prev)}
              aria-expanded={!isSettingsCollapsed}
              aria-controls="sd-settings-subnav"
              title={isSettingsCollapsed ? t('shell.expandSettings') : t('shell.collapseSettings')}
              aria-label={isSettingsCollapsed ? t('shell.expandSettings') : t('shell.collapseSettings')}
            >
              <span className="sd-shell__settings-title">
                <SidebarNavIcon kind="settings" />
                {!isSidebarCollapsed && <span>{t('shell.settings')}</span>}
              </span>
              {!isSidebarCollapsed && (
                <svg
                  className={`sd-shell__chevron ${isSettingsCollapsed ? 'sd-shell__chevron--collapsed' : ''}`}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3.5 10L8 5.5L12.5 10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            {!isSettingsCollapsed && (
              <div id="sd-settings-subnav" className="sd-shell__subnav">
                {SETTINGS_NAV_ITEMS.map((item) => {
                  const isActive = activeRoute === 'settings' && activeSettingsTab === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sd-shell__nav-btn sd-shell__nav-btn--sub ${isActive ? 'sd-shell__nav-btn--active' : ''}`}
                      onClick={() => {
                        onSelectSettingsTab(item.id)
                        onNavigateRoute('settings')
                      }}
                      title={t(item.labelKey)}
                      aria-label={t(item.labelKey)}
                    >
                      <span className="sd-shell__nav-item-main">
                        <SidebarNavIcon kind={item.iconKind} />
                        {!isSidebarCollapsed && <span>{t(item.labelKey)}</span>}
                      </span>
                      {!isSidebarCollapsed && ((item.id === 'github' && githubConnected) || (item.id === 'jira' && jiraConnected)) ? (
                        <span className="sd-shell__check-badge" aria-hidden="true">✓</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="sd-shell__nav-group sd-shell__nav-group--ai-agent">
            <button
              type="button"
              className="sd-shell__settings-header sd-shell__settings-header--toggle"
              onClick={() => setIsAiAgentCollapsed((prev) => !prev)}
              aria-expanded={!isAiAgentCollapsed}
              aria-controls="sd-ai-agent-subnav"
              title={isAiAgentCollapsed ? t('shell.expandAgent') : t('shell.collapseAgent')}
              aria-label={isAiAgentCollapsed ? t('shell.expandAgent') : t('shell.collapseAgent')}
            >
              <span className="sd-shell__settings-title">
                <SidebarNavIcon kind="ai-agent" />
                {!isSidebarCollapsed && <span>{t('shell.aiAgent')}</span>}
              </span>
              {!isSidebarCollapsed && (
                <svg
                  className={`sd-shell__chevron ${isAiAgentCollapsed ? 'sd-shell__chevron--collapsed' : ''}`}
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M3.5 10L8 5.5L12.5 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            {!isAiAgentCollapsed && (
              <div id="sd-ai-agent-subnav" className="sd-shell__subnav">
                {AI_AGENT_NAV_ITEMS.map((item) => {
                  const isWorkCenter = item.id === 'work-center'
                  const isJiraWorkCenter = item.id === 'jira-work-center'
                  const isSkills = item.id === 'skills'
                  const isMcp = item.id === 'mcp'
                  const isPrompts = item.id === 'prompts'
                  const isActive = isWorkCenter
                    ? activeRoute === 'ai-work-center'
                    : isJiraWorkCenter
                      ? activeRoute === 'jira-work-center'
                      : isSkills
                        ? activeRoute === 'skills'
                        : isMcp
                          ? activeRoute === 'mcp'
                          : isPrompts
                            ? activeRoute === 'prompts'
                          : activeRoute === 'settings' && activeSettingsTab === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sd-shell__nav-btn sd-shell__nav-btn--sub ${isActive ? 'sd-shell__nav-btn--active' : ''}`}
                      onClick={() => {
                        if (isWorkCenter) {
                          onNavigateRoute('ai-work-center')
                          return
                        }
                        if (isJiraWorkCenter) {
                          onNavigateRoute('jira-work-center')
                          return
                        }
                        if (isSkills) {
                          onNavigateRoute('skills')
                          return
                        }
                        if (isMcp) {
                          onNavigateRoute('mcp')
                          return
                        }
                        if (isPrompts) {
                          onNavigateRoute('prompts')
                          return
                        }
                        onSelectSettingsTab(item.id)
                        onNavigateRoute('settings')
                      }}
                      title={t(item.labelKey)}
                      aria-label={t(item.labelKey)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="sd-shell__nav-item-main">
                        <SidebarNavIcon kind={item.iconKind} />
                        {!isSidebarCollapsed && <span>{t(item.labelKey)}</span>}
                      </span>
                      {!isSidebarCollapsed && item.id === 'providers' && verifiedNormalProviders > 0 ? (
                        <span className="sd-shell__check-badge" aria-hidden="true">✓</span>
                      ) : null}
                      {!isSidebarCollapsed && item.id === 'providers' && verifiedNormalProviders === 0 ? (
                        <span className="sd-shell__nav-meta">{providers.length}</span>
                      ) : null}
                      {!isSidebarCollapsed && item.id === 'rules' && activeRuleCount > 0 ? (
                        <span className="sd-shell__nav-meta">{activeRuleCount}</span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

        </nav>

        <section className="sd-shell__providers" aria-label={t('shell.providerSidebarLabel')}>
          <button
            type="button"
            className="sd-shell__providers-toggle"
            aria-label={t('shell.providerStatus')}
            aria-expanded={isProviderStatusExpanded}
            aria-controls="sd-shell-provider-list"
            onClick={() => setIsProviderStatusExpanded((value) => !value)}
          >
            <span className="sd-shell__providers-head" title={`${t('shell.providerStatus')} (${agentBadgeLabel})`}>
              {!isSidebarCollapsed ? (
                <>
                  <span className="sd-shell__providers-title">{t('shell.providerStatus')}</span>
                  <span className="sd-shell__providers-separator" aria-hidden="true">│</span>
                  <span className={`sd-shell__providers-connection sd-shell__providers-connection--${agentBadgeTone}`}>
                    {t('shell.aiConnectionStatus')}
                  </span>
                </>
              ) : (
                <span
                  className={`sd-shell__provider-dot sd-shell__provider-dot--${agentBadgeTone === 'ok' ? 'normal' : agentBadgeTone === 'accent' ? 'unknown' : 'missing'}`}
                  aria-hidden="true"
                  title={`${t('shell.providerStatus')}: ${agentBadgeLabel}`}
                />
              )}
            </span>
            {!isSidebarCollapsed ? <span className="sd-shell__providers-chevron" aria-hidden="true">{isProviderStatusExpanded ? '»' : '«'}</span> : null}
          </button>
          {isProviderStatusExpanded ? <ul id="sd-shell-provider-list" className="sd-shell__provider-list">
            {providers.map((provider) => {
              const presentation = getProviderPresentation(provider)
              const providerStatusKey = getProviderStatusKey(provider) ?? presentation.statusText
              return (
                <li key={provider.id} className="sd-shell__provider-item">
                  <button
                    type="button"
                    className="sd-shell__provider-btn"
                    onClick={() => {
                      onSelectSettingsTab('providers')
                      onNavigateRoute('settings')
                      onSelectProviderFromSidebar?.(provider.id)
                    }}
                    title={`${provider.name}: ${t(providerStatusKey, { version: provider.version ?? '' })}`}
                    aria-label={`${provider.name}: ${t(providerStatusKey, { version: provider.version ?? '' })}`}
                  >
                    <span
                      className={`sd-shell__provider-dot sd-shell__provider-dot--${presentation.visualKind}`}
                      aria-hidden="true"
                    />
                    {!isSidebarCollapsed && (
                      <div className="sd-shell__provider-body">
                        <div className="sd-shell__provider-row">
                          <span className="sd-shell__provider-name">{provider.name}</span>
                          <span className="sd-shell__provider-tag">
                            {provider.version
                              ? `v${provider.version}`
                              : provider.isBuiltin
                                ? t('shell.builtin')
                                : t('shell.custom')}
                          </span>
                        </div>
                        <span
                          className={`sd-shell__provider-status sd-shell__provider-status--${presentation.visualKind}`}
                        >
                          {t(providerStatusKey, { version: provider.version ?? '' })}
                        </span>
                      </div>
                    )}
                  </button>
                </li>
              )
            })}
          </ul> : null}
          {isProviderStatusExpanded && onRetryProviderAgent ? (
            <button
              type="button"
              className="sd-shell__proj-btn sd-shell__provider-retry-btn"
              onClick={onRetryProviderAgent}
              disabled={isProbingProviders}
              title={
                providerAgentState === 'offline'
                  ? t('shell.retryProvider')
                  : isProbingProviders
                    ? t('shell.checkingProvider')
                    : t('shell.retryAllProviders')
              }
              aria-label={
                providerAgentState === 'offline'
                  ? t('shell.retryProvider')
                  : isProbingProviders
                    ? t('shell.checkingProvider')
                    : t('shell.retryAllProviders')
              }
            >
              {isSidebarCollapsed ? (
                <span className="sd-shell__retry-icon" aria-hidden="true">↻</span>
              ) : (
                <>
                  <span className="sd-shell__proj-name">
                    {providerAgentState === 'offline'
                      ? `↻ ${t('shell.retryProvider')}`
                      : isProbingProviders
                        ? t('shell.checkingProvider')
                        : `↻ ${t('shell.retryAllProviders')}`}
                  </span>
                  <span className="sd-shell__proj-git">
                    {providerAgentState === 'offline' ? t('shell.retry') : t('shell.probe')}
                  </span>
                </>
              )}
            </button>
          ) : null}
        </section>
      </aside>

      <div className="sd-shell__workspace">
        <header className="sd-shell__topbar">
          <div className="sd-shell__agent-banner" role="status">
            <StatusBadge
              label={
                providerAgentState === 'online'
                  ? t('shell.agentConnected')
                  : providerAgentState === 'checking'
                    ? t('shell.agentChecking')
                    : t('shell.stageOffline')
              }
              tone={
                providerAgentState === 'online'
                  ? 'ok'
                  : providerAgentState === 'checking'
                    ? 'accent'
                    : 'warn'
              }
            />
            <span className="sd-shell__agent-text">{t('shell.demoData')}</span>
          </div>
          <div className="sd-shell__topbar-right">
            <div className="sd-shell__theme-bar" role="group" aria-label={t('shell.quickTheme')}>
              <span className="sd-shell__theme-label">{t('shell.themeLabel')}</span>
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`sd-shell__theme-chip ${activeTheme === theme.id ? 'sd-shell__theme-chip--active' : ''}`}
                  onClick={() => onSelectTheme(theme.id)}
                  aria-pressed={activeTheme === theme.id}
                >
                  {theme.id}
                </button>
              ))}
            </div>
            <LanguageSwitcher />
            <div className="sd-shell__utility-icons" aria-hidden="true">
              <span className="sd-shell__icon-circle">
                <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2.5C5.8 2.5 4.2 4.1 4.2 6.3V9.2L3 10.8H13L11.8 9.2V6.3C11.8 4.1 10.2 2.5 8 2.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M6.6 12.2C6.9 12.8 7.4 13.2 8 13.2C8.6 13.2 9.1 12.8 9.4 12.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </span>
              <span className="sd-shell__avatar-circle">
                <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="5.8" r="2.3" fill="currentColor" />
                  <path d="M3.6 13C4.2 10.9 5.9 9.8 8 9.8C10.1 9.8 11.8 10.9 12.4 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </span>
            </div>
          </div>
        </header>

        <main className="sd-shell__main">{children}</main>
      </div>
      </div>

      {/* 90 年代視窗系統底部狀態列 (Retro 專用) */}
      <footer className="sd-shell__retro-statusbar" aria-hidden="true">
        <span className="sd-shell__retro-status-cell sd-shell__retro-status-cell--main">就緒</span>
        <span className="sd-shell__retro-status-cell">專案數: {projects.length}</span>
        <span className="sd-shell__retro-status-cell">Provider: {providers.length}</span>
        <span className="sd-shell__retro-status-cell">主題: {activeTheme}</span>
        <span className="sd-shell__retro-status-cell">100%</span>
      </footer>
    </div>
  )
}
