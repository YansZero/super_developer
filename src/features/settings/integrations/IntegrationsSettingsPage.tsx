import { useEffect, useState } from 'react'
import type { IntegrationState, JiraTicketSummary, MainRouteId, ProjectItem } from '../../../shared/types/domain'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { GitHubIntegrationSection } from './github/GitHubIntegrationSection'
import type { GitHubServiceContract } from './github/githubClient'
import { useGitHubIntegration } from './github/useGitHubIntegration'
import { JiraSiteSection } from './jira/JiraSiteSection'
import { JiraClientConfigsSection } from './jira/JiraClientConfigsSection'
import { JiraSiteError } from './jira/jiraSiteContracts'
import type { JiraSiteServiceContract } from './jira/jiraSiteContracts'
import { createJiraSiteClient } from './jira/jiraSiteClient'
import type { JiraService } from '../../jira/jiraContracts'
import { SidebarNavIcon } from '../../../app/SidebarNavIcon'
import './IntegrationsSettingsPage.css'
import './styles/integration-mapping.css'
import './styles/integration-oauth.css'
import { useI18n } from '../../../shared/i18n'

const defaultJiraSiteStatusService = createJiraSiteClient()

type JiraConnectionView =
  | { phase: 'checking' | 'signedOut' | 'noSite' | 'error'; siteName: null }
  | { phase: 'ready'; siteName: string }

export interface IntegrationsSettingsPageProps {
  integrations: IntegrationState[]
  projects: ProjectItem[]
  jiraService?: JiraService
  jiraSiteService?: JiraSiteServiceContract
  githubService?: GitHubServiceContract
  githubState?: ReturnType<typeof useGitHubIntegration>
  openExternalVerificationUrl?: (url: 'https://github.com/login/device') => void
  mode?: 'all' | 'github' | 'jira'
  jiraTab?: JiraSettingsTab
  onSelectJiraTab?: (tab: JiraSettingsTab) => void
  onJiraConnectionChange?: (connected: boolean) => void
  onAssignJiraTickets?: (projectId: string, tickets: JiraTicketSummary[]) => Promise<ProjectItem>
  onNavigateRoute?: (route: MainRouteId) => void
}

export type JiraSettingsTab = 'connection' | 'assigned' | 'projects'

export function IntegrationsSettingsPage({
  integrations,
  projects,
  githubService,
  githubState: externalGitHubState,
  jiraSiteService,
  openExternalVerificationUrl,
  onJiraConnectionChange,
  mode = 'all',
  onNavigateRoute,
}: IntegrationsSettingsPageProps) {
  const { t } = useI18n()
  const internalGitHubState = useGitHubIntegration({
    service: githubService,
    openExternalVerificationUrl,
  })
  const githubState = externalGitHubState ?? internalGitHubState
  const siteStatusService = jiraSiteService ?? defaultJiraSiteStatusService
  const [jiraConnection, setJiraConnection] = useState<JiraConnectionView>({ phase: 'checking', siteName: null })

  const jiraIntegration = integrations.find((i) => i.service === 'jira') ?? integrations[1]
  const showGitHub = mode !== 'jira'
  const showJira = mode !== 'github'
  const pageLabel = mode === 'github' ? 'GitHub' : mode === 'jira' ? 'Jira' : t('common.githubAndJira')
  const pageIconKind = mode === 'github' ? 'github' : mode === 'jira' ? 'jira' : 'integrations'
  const pageTitle = mode === 'github'
    ? t('common.githubSettings')
    : mode === 'jira'
      ? t('common.jiraSettings')
      : t('common.integrationSettings')
  const pageSubtitle = mode === 'github'
    ? t('common.configureGithubOauthDeviceFlowRepositoryListsAndLocalProjectMappings')
    : mode === 'jira'
      ? t('common.configureAtlassianOauthJiraSitesAndSignInVerification')
      : t('common.configureGithubOauthAppDeviceFlowAndLocalRepositoryMappingsStartJiraOauthSignInAndChooseASiteHere')

  useEffect(() => {
    if (!showJira) return
    const controller = new AbortController()
    void siteStatusService.getSnapshot(controller.signal).then((snapshot) => {
      if (controller.signal.aborted) return
      const selected = snapshot.sites.find((site) => site.cloudId === snapshot.selectedCloudId)
      setJiraConnection(selected ? { phase: 'ready', siteName: selected.name } : { phase: 'noSite', siteName: null })
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return
      setJiraConnection({ phase: error instanceof JiraSiteError && error.code === 'AUTH_REQUIRED' ? 'signedOut' : 'error', siteName: null })
    })
    return () => controller.abort()
  }, [showJira, siteStatusService])

  return (
    <section className="sd-integrations" aria-label={`${pageLabel} ${t('common.integrationSettingsPage')}`}>
      <header className="sd-integrations__head">
        <div className="sd-integrations__head-top">
          <div className="sd-integrations__settings-label">
            <SidebarNavIcon kind={pageIconKind} />
            <h1 className="sd-integrations__title">{pageTitle}</h1>
          </div>
        </div>
        <div className="sd-integrations__head-row">
          <p className="sd-integrations__subtitle">{pageSubtitle}</p>
        </div>
      </header>

      {showGitHub ? (
        <GitHubIntegrationSection
          github={githubState.github}
          projects={projects}
          agentState={githubState.agentState}
          agentError={githubState.agentError}
          isBusy={githubState.isBusy}
          isPolling={githubState.isPolling}
          feedback={githubState.feedback}
          onClearFeedback={githubState.clearFeedback}
          onReloadStatus={githubState.reloadGitHubStatus}
          onSaveClientId={githubState.saveClientId}
          onStartDeviceFlow={githubState.startDeviceFlow}
          onOpenGitHubAndStartPolling={githubState.openGitHubAndStartPolling}
          onPollOnce={githubState.pollDeviceFlowOnce}
          onCancelDeviceFlow={githubState.cancelDeviceFlow}
          onRefreshRepositories={githubState.refreshPublicRepositories}
          onMapProjectToRepository={githubState.mapProjectToRepository}
          onUnmapProjectRepository={githubState.unmapProjectRepository}
          onDisconnectGitHub={githubState.disconnectGitHub}
        />
      ) : null}

      {showJira ? <div className="sd-integrations__service-block" aria-label={t('common.jiraSection')}>
        <div className="sd-integrations__section-bar">
          <div className="sd-integrations__section-title-group">
            <div>
              <h2 className="sd-integrations__section-heading">{t(jiraIntegration.displayName)}</h2>
              <p className="sd-integrations__scope">{t(jiraIntegration.scopeDescription)}</p>
              <p className="sd-integrations__jira-note" role="note">
                <span className="sd-integrations__jira-note-icon" aria-hidden="true">▲</span>
                <span>{t('common.useTheJiraPageToAssignTicketsThisAreaIsForSetupAndSignInVerification')}</span>
              </p>
            </div>
          </div>
          <div className="sd-integrations__actions">
            {jiraConnection.phase === 'ready' ? <StatusBadge label={`${jiraConnection.siteName} ${t('common.signedIn')}`} tone="ok" /> : null}
            <button
              type="button"
              className="sd-integrations__jira-settings-link"
              onClick={() => onNavigateRoute?.('jira-work-center')}
            >
              <StatusBadge label={t('common.goToJiraWorkCenter')} tone="accent" />
            </button>
          </div>
        </div>

        <>
          <JiraClientConfigsSection />
          <JiraSiteSection service={jiraSiteService} onConnectionChange={onJiraConnectionChange} />
        </>
      </div> : null}
    </section>
  )
}
