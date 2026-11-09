import { useState } from 'react'
import type {
  GitHubAgentState,
  GitHubFlowState,
  GitHubIntegrationSnapshot,
  GitHubRepoMappingPayload,
  ProjectItem,
} from '../../../../shared/types/domain'
import { StatusBadge } from '../../../../shared/components/StatusBadge'
import type { GitHubFeedbackMessage } from './useGitHubIntegration'
import { useI18n } from '../../../../shared/i18n'

export interface GitHubIntegrationSectionProps {
  github: GitHubIntegrationSnapshot
  projects?: ProjectItem[]
  agentState: GitHubAgentState
  agentError: string | null
  isBusy: boolean
  isPolling: boolean
  feedback: GitHubFeedbackMessage | null
  onClearFeedback: () => void
  onReloadStatus: () => Promise<boolean>
  onSaveClientId: (clientId: string) => Promise<boolean>
  onStartDeviceFlow: (clientId?: string) => Promise<boolean>
  onOpenGitHubAndStartPolling: () => Promise<boolean>
  onPollOnce: () => Promise<boolean>
  onCancelDeviceFlow: () => Promise<boolean>
  onRefreshRepositories: () => Promise<boolean>
  onMapProjectToRepository?: (payload: GitHubRepoMappingPayload) => Promise<boolean>
  onUnmapProjectRepository?: (projectId: string) => Promise<boolean>
  onDisconnectGitHub: () => Promise<boolean>
}

function getFlowStatusBadgeProps(
  agentState: GitHubAgentState,
  flowState: GitHubFlowState,
  t: (key: string) => string,
  login?: string,
): { label: string; tone: 'ok' | 'warn' | 'err' | 'neutral' | 'accent' } {
  if (agentState === 'offline') return { label: t('common.localAgentOffline'), tone: 'warn' }
  if (agentState === 'checking') return { label: t('common.checkingStatus'), tone: 'accent' }
  switch (flowState) {
    case 'connected':
      return { label: login ? `🟢 ${t('common.connected')} (@${login})` : `🟢 ${t('common.connected')}`, tone: 'ok' }
    case 'pending':
      return { label: `🟡 ${t('common.authorizationPending')}`, tone: 'warn' }
    case 'expired':
      return { label: `⚪ ${t('common.verificationCodeExpired')}`, tone: 'err' }
    case 'denied':
      return { label: `🔴 ${t('common.authorizationDeniedAlt')}`, tone: 'err' }
    case 'disconnected':
    default:
      return { label: t('common.disconnected'), tone: 'neutral' }
  }
}

export function GitHubIntegrationSection({
  github,
  agentState,
  agentError,
  isBusy,
  isPolling,
  feedback,
  onClearFeedback,
  onReloadStatus,
  onSaveClientId,
  onStartDeviceFlow,
  onOpenGitHubAndStartPolling,
  onPollOnce,
  onCancelDeviceFlow,
  onRefreshRepositories,
  onDisconnectGitHub,
}: GitHubIntegrationSectionProps) {
  const { t } = useI18n()
  const [clientIdInput, setClientIdInput] = useState<string>('')
  const [hasEditedClientId, setHasEditedClientId] = useState(false)
  const [confirmDisconnectOpen, setConfirmDisconnectOpen] = useState(false)

  const displayedClientId = hasEditedClientId ? clientIdInput : (github.clientId ?? clientIdInput)
  const flowBadge = getFlowStatusBadgeProps(agentState, github.flowState, t, github.account?.login)

  const handleSaveClientIdClick = async () => {
    await onSaveClientId(displayedClientId.trim())
    setHasEditedClientId(false)
  }

  const handleStartFlowClick = async () => {
    await onStartDeviceFlow(displayedClientId.trim() || undefined)
    setHasEditedClientId(false)
  }

  return (
    <div className="sd-integrations__service-block" aria-label={t('common.githubConnectionSettingsSection')}>
      <div className="sd-integrations__section-bar">
        <div className="sd-integrations__section-title-group">
          <div>
            <h2 className="sd-integrations__section-heading">
              {t('common.githubOauthAndRepository')}
            </h2>
            <p className="sd-integrations__scope">
              {t('common.permissionScope')}<code>{github.requiredScope}</code>{t('common.accessToAllRepositoriesUnderTheAccountIncludingPrivateAndPublicRepositoriesClientSecretIsNotStored')}
            </p>
          </div>
        </div>
        <div className="sd-integrations__actions">
          <StatusBadge label={`${t('common.scope')}${github.requiredScope}`} tone="accent" mono />
          <StatusBadge label={flowBadge.label} tone={flowBadge.tone} />
        </div>
      </div>

      {agentState === 'offline' ? (
        <div className="sd-integrations__alert sd-integrations__alert--warn" role="alert">
          <div>
            <strong>{t('common.theLocalGithubOauthServiceLocalAgentIsOfflineOrUnavailable')}</strong>
            <p className="sd-integrations__alert-sub">
              {agentError ??
                t('common.confirmTheLocalDevelopmentServerOrNpmRunAgentIsRunningAt127001OfflineModeNeverPerformsFakeSignInsOrFallsBackToLocalstorage')}
            </p>
          </div>
          <button
            type="button"
            className="sd-integrations__btn"
            disabled={isBusy}
            onClick={() => void onReloadStatus()}
          >
            ↻ {t('common.reconnectAndCheckStatus')}
          </button>
        </div>
      ) : null}

      {agentState === 'online' && !github.keyringAvailable ? (
        <div className="sd-integrations__alert sd-integrations__alert--err" role="alert">
          <div>
            <strong>{t('common.osKeyringUnavailablePlaintextFallbackRejected')}</strong>
            <p className="sd-integrations__alert-sub">
              {github.keyringMessage ??
                t('common.theOsKeyringCannotBeAccessedThisSystemStrictlyForbidsReturningOauthTokensOrDeviceCodesToPlaintextFilesOrLocalstorage')}
            </p>
          </div>
          <button
            type="button"
            className="sd-integrations__btn"
            disabled={isBusy}
            onClick={() => void onReloadStatus()}
          >
            ↻ {t('common.checkKeyringAgain')}
          </button>
        </div>
      ) : null}

      {feedback ? (
        <div
          className={`sd-integrations__notice sd-integrations__notice--${feedback.tone}`}
          role="status"
        >
          <span>{feedback.text}</span>
          <button type="button" className="sd-integrations__btn" onClick={onClearFeedback}>
            {t('common.closeNotice')}
          </button>
        </div>
      ) : null}

      <div className="sd-integrations__gh-top-grid">
        <article className="sd-integrations__card" aria-label={t('common.githubOauthDeviceFlowSettingsCard')}>
          <div className="sd-integrations__card-top">
            <div>
              <h3 className="sd-integrations__card-title">{t('common.oauthAppClientIdAndDeviceFlowAuthorization')}</h3>
              <span className="sd-integrations__subtext">
                {t('common.enterTheOauthAppClientIdWithDeviceFlowEnabledInGithubNoClientSecretRequired')}
              </span>
            </div>
            <StatusBadge
              label={github.keyringAvailable ? t('common.osKeyringReady') : t('common.osKeyringUnavailable')}
              tone={github.keyringAvailable ? 'ok' : 'err'}
            />
          </div>

          <p className="sd-integrations__unimpl">
            {t('common.deviceTokensAndAccessTokensAreStoredOnlyInTheOsKeyringTheExternalVerificationUrlIsFixedAt')}
            <code>{github.verificationUri}</code>{t('common.andOnlyAfterTheFixedEndpoint')}{' '}
            <code>GET https://api.github.com/user</code>{t('common.andTheAccountBecomesConnectedOnlyAfterVerification')}
          </p>

          <div className="sd-integrations__form-row">
            <label className="sd-integrations__label" htmlFor="sd-github-client-id">
              {t('common.githubOauthAppClientId')}
            </label>
            <div className="sd-integrations__inline-form">
              <input
                id="sd-github-client-id"
                type="text"
                className="sd-integrations__input"
                placeholder={t('common.exampleIv18a9b0c1d2e3f4g5h')}
                value={displayedClientId}
                disabled={isBusy}
                onChange={(e) => {
                  setHasEditedClientId(true)
                  setClientIdInput(e.target.value)
                }}
              />
              <button
                type="button"
                className="sd-integrations__btn"
                disabled={isBusy || !displayedClientId.trim()}
                onClick={() => void handleSaveClientIdClick()}
              >
                {t('common.saveClientId')}
              </button>
            </div>
          </div>

          <div className="sd-integrations__actions">
            <button
              type="button"
              className="sd-integrations__btn sd-integrations__btn--cta"
              disabled={isBusy || !displayedClientId.trim()}
              onClick={() => void handleStartFlowClick()}
            >
              {t('common.startGithubDeviceFlowVerification')}
            </button>
            <button
              type="button"
              className="sd-integrations__btn"
              disabled={isBusy}
              onClick={() => void onReloadStatus()}
            >
              ↻ {t('common.reloadStatus')}
            </button>
          </div>

          {github.flowState === 'pending' && github.pendingSession ? (
            <div
              className="sd-integrations__device-box"
              role="region"
              aria-label={t('common.githubDeviceFlowOneTimeCodePanel')}
            >
              <div className="sd-integrations__card-top">
                <strong>{t('common.oneTimeDeviceCodeUserCode')}</strong>
                <StatusBadge
                  label={
                    github.pendingSession.pollingAuthorized
                      ? `${t('common.pollingEvery')}${github.pendingSession.intervalSeconds} ${t('common.seconds')}`
                      : t('common.waitingForTheUserToOpenAuthorization')
                  }
                  tone={github.pendingSession.pollingAuthorized ? 'accent' : 'warn'}
                />
              </div>

              <div className="sd-integrations__code-row">
                <code className="sd-integrations__user-code" aria-label={t('common.oneTimeUserCode')}>
                  {github.pendingSession.userCode}
                </code>
                <div className="sd-integrations__code-meta">
                  <span>
                    {t('common.officialVerificationUrl')}<code>{github.pendingSession.verificationUri}</code>
                  </span>
                  <span>
                    {t('common.about')}{github.pendingSession.expiresInSeconds} {t('common.secondsLeftPollingInterval')}{github.pendingSession.intervalSeconds} {t('common.secondsAlt')}
                  </span>
                </div>
              </div>

              <div className="sd-integrations__actions">
                <button
                  type="button"
                  className="sd-integrations__btn sd-integrations__btn--cta"
                  disabled={isBusy || isPolling}
                  onClick={() => void onOpenGitHubAndStartPolling()}
                >
                  {t('common.openGithubAuthorization')}
                </button>
                {github.pendingSession.pollingAuthorized ? (
                  <button
                    type="button"
                    className="sd-integrations__btn"
                    disabled={isBusy || isPolling}
                    onClick={() => void onPollOnce()}
                  >
                    {isPolling ? t('common.checkingAuthorization') : `↻ ${t('common.checkAuthorizationNow')}`}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="sd-integrations__btn sd-integrations__btn--danger"
                  disabled={isBusy}
                  onClick={() => void onCancelDeviceFlow()}
                >
                  {t('common.cancelAuthorizationFlow')}
                </button>
              </div>
            </div>
          ) : null}

          {github.flowState === 'expired' ? (
            <div className="sd-integrations__status-banner sd-integrations__status-banner--warn" role="status">
              <strong>{t('common.verificationCodeExpiredAlt')}</strong>
              <span>
                {t('common.thisDeviceFlowCodeExpiredStartTheGithubDeviceFlowAgainToGetANewCode')}
              </span>
            </div>
          ) : null}

          {github.flowState === 'denied' ? (
            <div className="sd-integrations__status-banner sd-integrations__status-banner--err" role="status">
              <strong>{t('common.authorizationDenied')}</strong>
              <span>{t('common.githubReportedThatAuthorizationWasDeniedOrTheScopeWasInvalidOnlyReadUserIsAllowedNoTokenWasSaved')}</span>
            </div>
          ) : null}
        </article>

        <article className="sd-integrations__card" aria-label={t('common.githubLinkedAccountStatusCard')}>
          <div className="sd-integrations__card-top">
            <h3 className="sd-integrations__card-title">{t('common.connectedAccountStatusVerifiedWithGetUser')}</h3>
            <StatusBadge label={flowBadge.label} tone={flowBadge.tone} />
          </div>

          {github.flowState === 'connected' && github.account ? (
            <>
              <p className="sd-integrations__unimpl">
                {t('common.theAccessTokenIsStoredSecurelyInTheOsKeyringDisconnectingRemovesTheKeyringCredentialAndClearsLoadedRepositoriesAndProjectMappings')}
              </p>

              <div className="sd-integrations__account-box">
                <span className="sd-integrations__avatar-placeholder" aria-hidden="true">
                  {github.account.login.slice(0, 2).toUpperCase()}
                </span>
                <div className="sd-integrations__account-info">
                  <strong>
                    {github.account.name
                      ? `${github.account.name} (@${github.account.login})`
                      : `@${github.account.login}`}
                  </strong>
                  <span>
                    {t('common.publicProfile')}<code>{github.account.htmlUrl}</code> · {t('common.loadedRepositories')}
                    {github.repositories.length}{t('common.privateAndPublicProjects')}
                  </span>
                  <span>
                    ✓ {t('common.automaticProjectMatchingComparesFolderNamesAndGitRemoteUrlsWhenSwitchingProjects')}
                  </span>
                </div>
              </div>

              <div className="sd-integrations__actions">
                <button
                  type="button"
                  className="sd-integrations__btn"
                  disabled={isBusy}
                  onClick={() => void onRefreshRepositories()}
                >
                  ↻ {t('common.refreshRepositoryList')}
                </button>
                <button
                  type="button"
                  className="sd-integrations__btn sd-integrations__btn--danger"
                  disabled={isBusy}
                  onClick={() => setConfirmDisconnectOpen(true)}
                >
                  {t('common.disconnectGithubOauthAlt')}
                </button>
              </div>

              {confirmDisconnectOpen ? (
                <div
                  className="sd-integrations__confirm-box"
                  role="alertdialog"
                  aria-label={t('common.confirmGithubOauthDisconnect')}
                >
                  <strong>{t('common.disconnectGithubOauth')}</strong>
                  <p className="sd-integrations__confirm-text">
                    {t('common.disconnectingImmediatelyRemovesTheAccessTokenFromTheOsKeyringAndClearsTheGithubAccountAndRepositoryListNoRemoteRepositoryIsChanged')}
                  </p>
                  <div className="sd-integrations__actions">
                    <button
                      type="button"
                      className="sd-integrations__btn sd-integrations__btn--danger"
                      disabled={isBusy}
                      onClick={() => {
                        setConfirmDisconnectOpen(false)
                        void onDisconnectGitHub()
                      }}
                    >
                      {t('common.confirmDisconnect')}
                    </button>
                    <button
                      type="button"
                      className="sd-integrations__btn"
                      disabled={isBusy}
                      onClick={() => setConfirmDisconnectOpen(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="sd-integrations__account-box">
              <span className="sd-integrations__avatar-placeholder" aria-hidden="true">
                ?
              </span>
              <div className="sd-integrations__account-info">
                <strong>{t('common.noGithubAccountConnected')}</strong>
                  <span>
                    {github.flowState === 'pending'
                    ? t('common.waitingForGithubDeviceFlowAuthorizationAndGetUserAccountVerification')
                    : github.flowState === 'expired'
                      ? t('common.thePreviousDeviceFlowCodeExpiredStartAuthorizationAgain')
                      : github.flowState === 'denied'
                        ? t('common.thePreviousDeviceFlowAuthorizationWasDeniedTheAccountIsCurrentlyDisconnected')
                        : t('common.enterTheOauthAppClientIdOnTheLeftAndStartDeviceFlowAuthorization')}
                  </span>
              </div>
            </div>
          )}
        </article>
      </div>

      <details className="sd-integrations__repo-disclosure">
        <summary>
          <span>{t('common.repositoriesFound')}</span>
          <span className="sd-integrations__repo-count">{github.repositories.length}</span>
        </summary>
        {github.repositories.length > 0 ? (
          <ul className="sd-integrations__repo-list" aria-label={t('common.githubRepositoriesFound')}>
            {github.repositories.map((repository) => (
              <li key={repository.id} className="sd-integrations__repo-item">
                <div className="sd-integrations__repo-main">
                  <a href={repository.htmlUrl} target="_blank" rel="noreferrer">{repository.fullName}</a>
                  <span className="sd-integrations__repo-visibility">{repository.isPrivate ? t('common.private') : t('common.public')}</span>
                </div>
                <div className="sd-integrations__repo-meta">
                  {repository.language ? <span>{repository.language}</span> : null}
                  <span>{t('common.default')}{repository.defaultBranch}</span>
                  {repository.description ? <span>{repository.description}</span> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sd-integrations__repo-empty">{t('common.noRepositoriesFoundYetCompleteGithubAuthorizationThenRefreshFromAccountStatus')}</p>
        )}
      </details>
    </div>
  )
}
