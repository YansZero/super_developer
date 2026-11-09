import { useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  CustomProviderCreatePayload,
  ProviderAgentState,
  ProviderConfigUpdatePayload,
  ProviderId,
  ProviderLoginOutcome,
  ProviderSummary,
} from '../../../shared/types/domain'
import { getProviderPresentation, getProviderStatusKey } from '../../../shared/providers/providerPresentation'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import {
  formatAuthStatusLabel,
  formatCheckedAtLabel,
  formatCliStatusLabel,
  formatErrorCodeLabel,
  validateClientProviderInput,
} from './providerClient'
import type { ProviderFeedbackMessage } from './useProviderSettings'
import { ProviderBadgeIcon } from './ProviderBadgeIcon'
import { fetchProviderModelCatalog, type ProviderModelCatalog } from '../../projects/detail/providerModelClient'
import { SidebarNavIcon } from '../../../app/SidebarNavIcon'
import './ProviderSettingsPage.css'
import { useI18n } from '../../../shared/i18n'
import { DispatchNotificationSettingsSection } from './DispatchNotificationSettingsSection'
import type { DispatchNotificationSettings } from '../../ai-work-center/dispatchNotificationSettings'

export interface ProviderSettingsPageProps {
  providers: ProviderSummary[]
  notificationSettings?: DispatchNotificationSettings | null
  onSaveNotificationSettings?: (settings: DispatchNotificationSettings) => void
  agentState?: ProviderAgentState
  agentError?: string | null
  busyProviderIds?: Record<string, boolean>
  isProbingAll?: boolean
  focusedProviderId?: ProviderId | null
  feedback?: ProviderFeedbackMessage | null
  onClearFeedback?: () => void
  onReloadProviders?: () => Promise<void>
  onProbeProvider?: (providerId: ProviderId) => Promise<void>
  onProbeAllProviders?: () => Promise<void>
  onSaveProviderConfig?: (providerId: ProviderId, payload: ProviderConfigUpdatePayload) => Promise<boolean>
  onCreateCustomProvider?: (payload: CustomProviderCreatePayload) => Promise<boolean>
  onDeleteCustomProvider?: (providerId: ProviderId) => Promise<boolean>
  onTriggerProviderLogin?: (providerId: ProviderId) => Promise<ProviderLoginOutcome | null>
}

interface ProviderDraft { name: string; cliPath: string }

export function ProviderSettingsPage({
  providers,
  notificationSettings,
  onSaveNotificationSettings,
  agentState = 'offline',
  agentError = null,
  busyProviderIds = {},
  isProbingAll = false,
  focusedProviderId = null,
  feedback = null,
  onClearFeedback,
  onReloadProviders,
  onProbeProvider,
  onProbeAllProviders,
  onSaveProviderConfig,
  onCreateCustomProvider,
  onDeleteCustomProvider,
  onTriggerProviderLogin,
}: ProviderSettingsPageProps) {
  const { t } = useI18n()
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [modelCatalogs, setModelCatalogs] = useState<Record<string, ProviderModelCatalog>>({})
  const [modelErrors, setModelErrors] = useState<Record<string, string>>({})
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({})
  const [loginOutcomes, setLoginOutcomes] = useState<Record<string, ProviderLoginOutcome>>({})
  const [confirmDeleteId, setConfirmDeleteId] = useState<ProviderId | null>(null)
  const [newProvider, setNewProvider] = useState({ name: '', command: '', cliPath: '' })
  const [newProviderError, setNewProviderError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false)
  const pathRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (focusedProviderId) pathRefs.current[focusedProviderId]?.focus()
  }, [focusedProviderId])

  const getDraft = (provider: ProviderSummary): ProviderDraft => drafts[provider.id] ?? {
    name: provider.name,
    cliPath: provider.cliPath,
  }

  const updateDraft = (provider: ProviderSummary, field: keyof ProviderDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [provider.id]: { ...getDraft(provider), [field]: value },
    }))
    setErrors((current) => ({ ...current, [provider.id]: '' }))
  }

  const saveProvider = async (provider: ProviderSummary) => {
    const draft = getDraft(provider)
    const error = validateClientProviderInput(draft.name, draft.cliPath)
    if (error) return setErrors((current) => ({ ...current, [provider.id]: error }))
    if (await onSaveProviderConfig?.(provider.id, { name: draft.name.trim(), cliPath: draft.cliPath.trim() })) {
      setDrafts((current) => { const next = { ...current }; delete next[provider.id]; return next })
      setModelCatalogs((current) => { const next = { ...current }; delete next[provider.id]; return next })
    }
  }

  const loadModels = async (providerId: ProviderId) => {
    setLoadingModels((current) => ({ ...current, [providerId]: true }))
    setModelErrors((current) => ({ ...current, [providerId]: '' }))
    try {
      const catalog = await fetchProviderModelCatalog(providerId)
      setModelCatalogs((current) => ({ ...current, [providerId]: catalog }))
    } catch (error) {
      setModelErrors((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : t('common.unableToLoadTheModelList'),
      }))
    } finally {
      setLoadingModels((current) => ({ ...current, [providerId]: false }))
    }
  }

  const createProvider = async (event: FormEvent) => {
    event.preventDefault()
    const error = validateClientProviderInput(newProvider.name, newProvider.cliPath)
    if (error) return setNewProviderError(error)
    if (!onCreateCustomProvider) return
    setIsCreating(true)
    setNewProviderError(null)
    try {
      const payload: CustomProviderCreatePayload = {
        name: newProvider.name.trim(),
        cliPath: newProvider.cliPath.trim(),
        ...(newProvider.command.trim() ? { cliCommand: newProvider.command.trim() } : {}),
      }
      if (await onCreateCustomProvider(payload)) setNewProvider({ name: '', command: '', cliPath: '' })
    } finally {
      setIsCreating(false)
    }
  }

  const agentLabel = agentState === 'online' ? t('common.localAgentConnected')
    : agentState === 'checking' ? t('common.checkingLocalAgentConnection') : t('common.localAgentOffline')
  const configuredCount = providers.filter((provider) => provider.cliPath.trim()).length

  return (
    <section className="sd-provider-workspace" aria-label={t('common.aiProviderSettings')}>
      <header className="sd-provider-workspace__heading">
        <div className="sd-provider-workspace__heading-top">
          <div className="sd-provider-workspace__settings-label">
            <SidebarNavIcon kind="ai-agent" />
            <h1>{t('common.aiSettings')}</h1>
          </div>
          <div className="sd-provider-workspace__summary">
            <span>{t('common.localProviders')}{configuredCount}</span>
            <StatusBadge label={agentLabel} tone={agentState === 'online' ? 'ok' : agentState === 'checking' ? 'accent' : 'warn'} />
          </div>
        </div>
        <div className="sd-provider-workspace__title-row">
          <div>
            <p>{t('common.manageLocalAiClisSignInStateAndAvailableModelsProviderSettingsStayLocalAndDoNotUseCloudApiKeys')}</p>
          </div>
          <div className="sd-provider-workspace__actions">
            <button type="button" className="sd-provider-workspace__button" onClick={() => void onReloadProviders?.()}>{t('common.reloadAlt')}</button>
            <button type="button" className="sd-provider-workspace__button sd-provider-workspace__button--primary" disabled={isProbingAll} onClick={() => void onProbeAllProviders?.()}>
              {isProbingAll ? t('common.checking') : t('common.checkAllConnections')}
            </button>
          </div>
        </div>
      </header>

      {onSaveNotificationSettings ? <DispatchNotificationSettingsSection settings={notificationSettings ?? null} onSave={onSaveNotificationSettings} /> : null}

      {agentState === 'offline' ? <div className="sd-provider-workspace__alert" role="alert">
        <strong>{t('common.localAgentIsNotConnected')}</strong><span>{agentError ?? t('common.startTheLocalAgentAndReloadProviders')}</span>
        <button type="button" className="sd-provider-workspace__button" onClick={() => void onReloadProviders?.()}>{t('common.reconnect')}</button>
      </div> : null}
      {feedback ? <div className={`sd-provider-workspace__feedback is-${feedback.tone}`} role="status">
        <span>{feedback.text}</span>{onClearFeedback ? <button type="button" onClick={onClearFeedback} aria-label={t('common.closeNotification')}>×</button> : null}
      </div> : null}

      <section className="sd-provider-workspace__section" aria-labelledby="sd-provider-list-title">
        <header className="sd-provider-workspace__section-head">
          <div>
            <h2 id="sd-provider-list-title">{t('common.aiProvidersAndCustomCliSettings')}</h2>
            <p>{t('common.configureBuiltInAndCustomCliExecutablesSignInConnectionChecksAndModels')}</p>
          </div>
          <span>{providers.length} {t('common.providersConfigured')}</span>
        </header>
        <div className="sd-provider-workspace__list">
          {providers.map((provider) => {
            const presentation = getProviderPresentation(provider)
            const draft = getDraft(provider)
            const dirty = draft.name.trim() !== provider.name || draft.cliPath.trim() !== provider.cliPath
            const busy = Boolean(busyProviderIds[provider.id]) || isProbingAll
            const modelCatalog = modelCatalogs[provider.id]
            const providerErrorMessage = provider.errorMessage
            const statusKey = getProviderStatusKey(provider)
            return <article className="sd-provider-workspace__provider" key={provider.id} id={`provider-card-${provider.id}`} aria-label={`${provider.name} 設定卡`}>
              <div className="sd-provider-workspace__identity">
                <ProviderBadgeIcon id={provider.id} isBuiltin={provider.isBuiltin} />
                <div>
                  <div className="sd-provider-workspace__name-line">
                    <h3>{provider.name}</h3>
                    {provider.version ? <code className="sd-provider-workspace__version">v{provider.version}</code> : null}
                    <span className={`sd-provider-workspace__status is-${presentation.visualKind}`}>{statusKey ? t(statusKey, { version: provider.version ?? '' }) : t(presentation.statusText)}</span>
                  </div>
                  <span className="sd-provider-workspace__provider-kind">{provider.isBuiltin ? t('common.builtInCliProvider') : t('common.customCliProvider')} · {provider.shortLabel}</span>
                  <span className="sd-provider-workspace__auth">{t(formatAuthStatusLabel(provider.authStatus, provider.supportsAuthProbe))}</span>
                  {presentation.errorMessage ? <span className="sd-provider-workspace__auth-note" role="status">{t(presentation.errorMessage)}</span> : null}
                </div>
              </div>

              <div className="sd-provider-workspace__config">
                    <label htmlFor={`provider-path-${provider.id}`}>{t('common.localCliExecutable')}</label>
                <div className="sd-provider-workspace__path-row">
                  <input
                    ref={(element) => { pathRefs.current[provider.id] = element }}
                    id={`provider-path-${provider.id}`}
                    value={draft.cliPath}
                    maxLength={512}
                    onChange={(event) => updateDraft(provider, 'cliPath', event.target.value)}
                    aria-label={t('common.cliPath')}
                  />
                  <button type="button" disabled={busy || !dirty} onClick={() => void saveProvider(provider)}>{t('common.saveSettings')}</button>
                </div>
                <div className="sd-provider-workspace__telemetry">
                  <span>{t('common.cli')}{t(formatCliStatusLabel(provider.cliStatus))}</span>
                  <span>{t('common.version')}{provider.version ? `v${provider.version}` : t('common.unavailable')}</span>
                  <span>{t('common.checked')}{provider.checkedAt ? formatCheckedAtLabel(provider.checkedAt) : t('common.noCheckHasRunYet')}</span>
                </div>
                {provider.errorCode && !presentation.errorMessage ? <p className="sd-provider-workspace__error">{t(formatErrorCodeLabel(provider.errorCode) ?? '')}{providerErrorMessage ? ` · ${t(providerErrorMessage)}` : ''}</p> : null}
                {errors[provider.id] ? <p className="sd-provider-workspace__error" role="alert">{t(errors[provider.id])}</p> : null}
              </div>

              <div className="sd-provider-workspace__row-actions">
                <button type="button" className="sd-provider-workspace__button sd-provider-workspace__button--primary" disabled={busy} onClick={() => void onProbeProvider?.(provider.id)}>
                  {busyProviderIds[provider.id] ? t('common.checking') : t('common.testConnectionCheckAgain')}
                </button>
                <button type="button" className="sd-provider-workspace__button" disabled={busy || loadingModels[provider.id]} onClick={() => void loadModels(provider.id)}>
                  {loadingModels[provider.id] ? t('common.loadingModels') : t('common.loadAvailableModels')}
                </button>
                {!provider.isBuiltin ? <button type="button" className="sd-provider-workspace__button sd-provider-workspace__button--danger" disabled={busy} onClick={() => setConfirmDeleteId(provider.id)}>{t('common.removeCustomProvider')}</button> : null}
                <details className="sd-provider-workspace__login">
                  <summary>{t('common.providerSignInOfficialGuide')}</summary>
                  <p>{t(provider.loginGuideText)}</p>
                  <code>{provider.loginCommandHint}</code>
                  {loginOutcomes[provider.id] ? <p role="status">{t('common.loginOperation')}{loginOutcomes[provider.id].outcome}{t('common.text19afouy')}{t(loginOutcomes[provider.id].message)}</p> : null}
                  {provider.supportsLoginCommand ? <button type="button" className="sd-provider-workspace__button" disabled={busy} onClick={async () => {
                    const outcome = await onTriggerProviderLogin?.(provider.id)
                    if (outcome) setLoginOutcomes((current) => ({ ...current, [provider.id]: outcome }))
                  }}>{t('common.confirmLocalCliSignInCheck')}</button> : null}
                  <button type="button" className="sd-provider-workspace__button" disabled={busy} onClick={() => void onProbeProvider?.(provider.id)}>{t('common.iAmSignedInCheckAgain')}</button>
                </details>
              </div>

              {modelCatalog || modelErrors[provider.id] ? <div className="sd-provider-workspace__models" role="status">
                <strong>{t('common.availableModels')}</strong>
                {modelCatalog ? <><span>{modelCatalog.source === 'cli' ? t('common.reportedByLocalCli') : t('common.cliDefaultModel')}</span><div>{modelCatalog.models.map((model) => <code key={model.id}>{t(model.label)}</code>)}</div><small>{t(modelCatalog.message)}</small></> : null}
                {modelErrors[provider.id] ? <span className="sd-provider-workspace__error">{t(modelErrors[provider.id])}</span> : null}
              </div> : null}

              {confirmDeleteId === provider.id ? <div className="sd-provider-workspace__confirm" role="alertdialog" aria-label={`確認移除 ${provider.name}`}>
                <span>{t('common.remove')}{provider.name}{t('common.fromLocalSettingsTheCliFileWillNotBeDeleted')}</span>
                <button type="button" className="sd-provider-workspace__button sd-provider-workspace__button--danger" disabled={busy} onClick={async () => {
                  if (await onDeleteCustomProvider?.(provider.id)) setConfirmDeleteId(null)
                }}>{t('common.confirmRemoval')}</button>
                <button type="button" className="sd-provider-workspace__button" onClick={() => setConfirmDeleteId(null)}>{t('common.cancel')}</button>
              </div> : null}
            </article>
          })}
        </div>
        <button
          type="button"
          className="sd-provider-workspace__button sd-provider-workspace__add-trigger"
          aria-expanded={isAddProviderOpen}
          aria-controls="sd-provider-custom-form"
          onClick={() => setIsAddProviderOpen((open) => !open)}
        >
          ＋ {t('common.addCustomCliProvider')}
        </button>
        {isAddProviderOpen ? <form id="sd-provider-custom-form" className="sd-provider-workspace__add" aria-label={t('common.addCustomCliProviderForm')} onSubmit={(event) => void createProvider(event)}>
          <label>{t('common.customProviderName')}<input value={newProvider.name} maxLength={64} placeholder={t('common.exampleAider')} onChange={(event) => { setNewProvider((current) => ({ ...current, name: event.target.value })); setNewProviderError(null) }} /></label>
          <label>{t('common.commandAliasOptional')}<input value={newProvider.command} maxLength={32} placeholder={t('common.exampleAiderAlt')} onChange={(event) => { setNewProvider((current) => ({ ...current, command: event.target.value })); setNewProviderError(null) }} /></label>
          <label className="sd-provider-workspace__add-path">{t('common.cliExecutablePathOrCommand')}<input value={newProvider.cliPath} maxLength={512} placeholder={t('common.usrLocalBinAiderOrAider')} onChange={(event) => { setNewProvider((current) => ({ ...current, cliPath: event.target.value })); setNewProviderError(null) }} /></label>
          <button type="submit" className="sd-provider-workspace__button sd-provider-workspace__button--primary" disabled={isCreating}>{isCreating ? t('common.addingAlt') : `＋ ${t('common.addAndSaveCustomProvider')}`}</button>
          {newProviderError ? <p className="sd-provider-workspace__error" role="alert">{t(newProviderError)}</p> : null}
        </form> : null}
      </section>
    </section>
  )
}
