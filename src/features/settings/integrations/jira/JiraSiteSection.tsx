import { useEffect } from 'react'
import type { JiraSiteServiceContract } from './jiraSiteContracts'
import { jiraSiteMessages } from './jiraSiteState'
import { useJiraSites } from './useJiraSites'
import { StatusBadge } from '../../../../shared/components/StatusBadge'
import './JiraSiteSection.css'
import { useI18n } from '../../../../shared/i18n'

export function JiraSiteSection({ service, onConnectionChange }: { service?: JiraSiteServiceContract; onConnectionChange?: (connected: boolean) => void }) {
  const { t } = useI18n()
  const { state, view, choose, save, reload } = useJiraSites(service)

  useEffect(() => {
    if (state.phase === 'ready' && state.snapshot) onConnectionChange?.(true)
    else if (state.error?.code === 'AUTH_REQUIRED') onConnectionChange?.(false)
  }, [onConnectionChange, state.error, state.phase, state.snapshot])

  return (
    <section className="sd-jira-sites" aria-label={t('common.jiraSiteSettings')} aria-busy={view.busy}>
      <header className="sd-jira-sites__head">
        <div className="sd-jira-sites__heading">
          <span className="sd-integrations__step-number" aria-hidden="true">2</span>
          <div>
            <span className="sd-integrations__step-label">{t('common.step2')}</span>
            <h3>{t('common.jiraSiteAndSignInCheck')}</h3>
            <p>{t('common.theCheckCallsTheJiraApiASiteListConfirmsSignInAndApiConnectivity')}</p>
          </div>
        </div>
        <StatusBadge label={state.phase === 'ready' && state.snapshot ? t('common.jiraApiConnected') : state.phase === 'loading' ? t('common.checkingJiraApi') : state.error?.code === 'AUTH_REQUIRED' ? t('common.notSignedInToJira') : state.phase === 'error' ? t('common.jiraApiConnectionError') : t('common.signInNotChecked')} tone={state.phase === 'ready' && state.snapshot ? 'ok' : state.phase === 'error' ? 'err' : 'neutral'} />
      </header>
      <div className="sd-jira-sites__current-site-row">
        <span className="sd-jira-sites__current-site-label">{t('common.signedInSite')}</span>
        {view.current
          ? <StatusBadge label={view.current.name} tone="ok" />
          : <StatusBadge label={t('common.notSelected')} tone="neutral" />}
      </div>
      {view.invalidSelection && <p role="status">{t('common.theOriginalSiteIsInvalidOrInaccessibleChooseAgain')}</p>}
      {state.phase === 'loading' && <p role="status">{t('common.loadingJiraSites')}</p>}
      {state.error && <p role="alert">{t(jiraSiteMessages[state.error.code])}</p>}
      {state.phase === 'uncertain' && <p role="status">{t('common.mayBeSavedButNeedsConfirmationCheckAgain')}</p>}
      {state.snapshot && state.snapshot.sites.length === 0 && <p>{t('common.noJiraSitesAvailable')}</p>}
      {state.snapshot && state.snapshot.sites.length > 0 && <>
        <label htmlFor="sd-jira-site-choice">{t('common.chooseJiraSite')}</label>
        <select id="sd-jira-site-choice" value={state.draft}
          disabled={state.phase !== 'ready' || view.waiting} onChange={(event) => choose(event.target.value)}>
          <option value="" disabled>{t('common.chooseASiteExplicitly')}</option>
          {view.invalidSelection && <option value={state.snapshot.selectedCloudId ?? ''} disabled>{t('common.savedSiteIsInvalid')}</option>}
          {state.snapshot.sites.map((site) => <option key={site.cloudId} value={site.cloudId}>{site.name}</option>)}
        </select>
        {view.pending && <p role="status">{t('common.pendingSaveTheServerValueRemainsAuthoritative')}</p>}
        <button type="button" onClick={() => void save()} disabled={!view.canSave}>
          {state.phase === 'saving' ? t('common.saving') : t('common.saveJiraSite')}
        </button>
      </>}
      {state.saved && <p role="status">{t('common.jiraSiteSavedAndConfirmed')}</p>}
      <button type="button" onClick={() => void reload()} disabled={!view.canReload}>{state.phase === 'loading' ? t('common.checkJiraApiAgain') : t('common.checkSignInJiraApiAgain')}</button>
    </section>
  )
}
