import { useState, type ChangeEvent } from 'react'
import type { ProviderId, ProviderSummary, RuleAgentState, RuleApplicationAction, RuleApplicationStatus, RuleCreatePayload, RuleDocument, RuleHookEvent, RuleKind, RuleUpdatePayload } from '../../../shared/types/domain'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { MAX_RULES_COUNT, readUploadedFileText, validateCandidateRuleFile, type CandidateRuleFileValidationSuccess } from './rulesHelpers'
import type { RuleFeedbackMessage } from './useAIRules'
import { SidebarNavIcon } from '../../../app/SidebarNavIcon'
import './RulesSettingsPage.css'
import { useI18n } from '../../../shared/i18n'

export interface AIRulesSettingsPageProps {
  rules: RuleDocument[]
  agentState?: RuleAgentState
  agentError?: string | null
  isBusy?: boolean
  feedback?: RuleFeedbackMessage | null
  onClearFeedback?: () => void
  onReloadRules?: () => Promise<boolean>
  onReloadSingleRule?: (ruleId: string) => Promise<RuleDocument | null>
  onAddRule?: (payload: RuleCreatePayload) => Promise<RuleDocument | null>
  onToggleRule?: (ruleId: string, nextEnabled: boolean) => Promise<boolean>
  onMoveRule?: (ruleId: string, direction: 'up' | 'down') => Promise<boolean>
  onRemoveRule?: (ruleId: string) => Promise<boolean>
  onUpdateRule?: (ruleId: string, payload: RuleUpdatePayload) => Promise<RuleDocument | null>
  providers?: ProviderSummary[]
  onCheckRuleApplication?: (ruleId: string, providerId: ProviderId) => Promise<RuleApplicationStatus | null>
  onApplyRule?: (ruleId: string, providerId: ProviderId, action: RuleApplicationAction) => Promise<RuleApplicationStatus | null>
}

export function AIRulesSettingsPage({
  rules,
  agentState = 'online',
  agentError = null,
  isBusy = false,
  feedback = null,
  onClearFeedback,
  onReloadRules,
  onReloadSingleRule,
  onAddRule,
  onToggleRule,
  onMoveRule,
  onRemoveRule,
  onUpdateRule,
  providers = [],
  onCheckRuleApplication,
  onApplyRule,
}: AIRulesSettingsPageProps) {
  const { t } = useI18n()
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)
  const [stagedFile, setStagedFile] = useState<CandidateRuleFileValidationSuccess | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [stagedKind, setStagedKind] = useState<RuleKind>('rule')
  const [stagedHookEvents, setStagedHookEvents] = useState<RuleHookEvent[]>([])
  const [directAddOpen, setDirectAddOpen] = useState(false)
  const [directFileName, setDirectFileName] = useState('new-rule.md')
  const [directContent, setDirectContent] = useState('')
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [applicationRuleId, setApplicationRuleId] = useState<string | null>(null)
  const [applicationProviderIds, setApplicationProviderIds] = useState<ProviderId[]>([])
  const [applicationStatuses, setApplicationStatuses] = useState<Record<string, RuleApplicationStatus>>({})
  const [applicationBusy, setApplicationBusy] = useState(false)
  const activePreviewRule = rules.find((rule) => rule.id === selectedRuleId) ?? rules[0] ?? null
  const enabledRules = rules.filter((rule) => rule.enabled)
  const ruleKindLabel = (kind: RuleKind) => kind === 'guidance' ? t('common.guidanceReferenceOnly') : kind === 'hook' ? t('common.hook') : t('common.ruleMustBeFollowed')
  const ruleKindTone = (kind: RuleKind): 'accent' | 'warn' | 'err' => kind === 'guidance' ? 'accent' : kind === 'hook' ? 'err' : 'warn'
  const agentBadgeLabel = agentState === 'online' ? t('common.localAgentConnected')
    : agentState === 'checking' ? t('common.checkingLocalAgent') : t('common.localAgentOfflineUnavailable')

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    setLocalError(null)
    onClearFeedback?.()
    try {
      const content = await readUploadedFileText(file)
      const validation = validateCandidateRuleFile({
        fileName: file.name,
        rawSizeBytes: typeof file.size === 'number' && file.size > 0 ? file.size : undefined,
        content,
        currentRuleCount: rules.length,
      })
      if (!validation.ok) {
        setStagedFile(null)
        setLocalError(validation.message)
        return
      }
      setStagedFile(validation)
    } catch {
      setStagedFile(null)
      setLocalError(t('common.failedToReadTheSelectedRuleFileChooseAValidMdOrTxtFileAgain'))
    }
  }

  const handleConfirmAdd = async () => {
    if (!stagedFile || !onAddRule) return
    if (stagedKind === 'hook' && stagedHookEvents.length === 0) {
      setLocalError(t('common.selectAtLeastOneHookTiming'))
      return
    }
    setLocalError(null)
    const created = await onAddRule({ fileName: stagedFile.fileName, content: stagedFile.content, enabled: true, kind: stagedKind, hookEvents: stagedHookEvents })
    if (created) {
      setStagedFile(null)
      setSelectedRuleId(created.id)
      setStagedKind('rule')
      setStagedHookEvents([])
    }
  }

  const openDirectAdd = () => {
    setLocalError(null)
    onClearFeedback?.()
    setDirectFileName('new-rule.md')
    setDirectContent('')
    setStagedKind('rule')
    setStagedHookEvents([])
    setDirectAddOpen(true)
  }

  const handleConfirmDirectAdd = async () => {
    if (!onAddRule) return
    if (stagedKind === 'hook' && stagedHookEvents.length === 0) {
      setLocalError(t('common.selectAtLeastOneHookTiming'))
      return
    }
    const validation = validateCandidateRuleFile({
      fileName: directFileName,
      content: directContent,
      currentRuleCount: rules.length,
    })
    if (!validation.ok) {
      setLocalError(validation.message)
      return
    }
    setLocalError(null)
    const created = await onAddRule({
      fileName: validation.fileName,
      content: validation.content,
      enabled: true,
      kind: stagedKind,
      hookEvents: stagedHookEvents,
    })
    if (created) {
      setDirectAddOpen(false)
      setSelectedRuleId(created.id)
    }
  }

  const openEditRule = (rule: RuleDocument) => {
    setLocalError(null)
    onClearFeedback?.()
    setEditingRuleId(rule.id)
    setEditingContent(rule.content)
  }

  const handleConfirmEdit = async (rule: RuleDocument) => {
    if (!onUpdateRule) return
    const validation = validateCandidateRuleFile({
      fileName: rule.fileName,
      content: editingContent,
      currentRuleCount: Math.max(0, rules.length - 1),
    })
    if (!validation.ok) {
      setLocalError(validation.message)
      return
    }
    setLocalError(null)
    const updated = await onUpdateRule(rule.id, { content: validation.content })
    if (updated) {
      setEditingRuleId(null)
      setSelectedRuleId(updated.id)
    }
  }

  const openApplication = (rule: RuleDocument) => {
    setApplicationRuleId(rule.id)
    const alreadyApplied = providers
      .filter((provider) => rule.appliedProviderIds.includes(provider.id) || rule.installedHookProviderIds.includes(provider.id))
      .map((provider) => provider.id)
    setApplicationProviderIds(alreadyApplied.length > 0 ? alreadyApplied : providers[0]?.id ? [providers[0].id] : [])
    setApplicationStatuses({})
  }

  const handleCheckApplication = async () => {
    if (!applicationRuleId || !onCheckRuleApplication || applicationProviderIds.length === 0) return
    setApplicationBusy(true)
    try {
      const results = await Promise.all(applicationProviderIds.map(async (providerId) => [providerId, await onCheckRuleApplication(applicationRuleId, providerId)] as const))
      setApplicationStatuses((current) => {
        const next = { ...current }
        for (const [providerId, status] of results) if (status) next[providerId] = status
        return next
      })
    } finally {
      setApplicationBusy(false)
    }
  }

  const handleApply = async (action: RuleApplicationAction) => {
    if (!applicationRuleId || !onApplyRule || applicationProviderIds.length === 0) return
    setApplicationBusy(true)
    try {
      for (const providerId of applicationProviderIds) {
        const status = await onApplyRule(applicationRuleId, providerId, action)
        if (status) setApplicationStatuses((current) => ({ ...current, [providerId]: status }))
      }
    } finally {
      setApplicationBusy(false)
    }
  }

  const toggleApplicationProvider = (providerId: ProviderId, checked: boolean) => {
    setApplicationProviderIds((current) => checked
      ? [...new Set([...current, providerId])]
      : current.filter((id) => id !== providerId))
  }

  const renderApplicationStatus = (rule: RuleDocument, provider: ProviderSummary) => {
    const status = applicationStatuses[provider.id]
    if (!status) return t('common.notChecked')
    if (status.effective) return rule.kind === 'hook' ? t('common.hookInstalled') : t('common.ruleApplied')
    return t('common.ruleNotApplied')
  }

  const renderApplicationSummary = (rule: RuleDocument) => applicationProviderIds.map((providerId) => {
    const provider = providers.find((item) => item.id === providerId)
    return `${provider?.name ?? providerId}: ${provider ? renderApplicationStatus(rule, provider) : t('common.notChecked')}`
  }).join(' · ')

  const renderApplicationPanel = (applicationRule: RuleDocument) => applicationRuleId === applicationRule.id ? <div className="sd-rules-workspace__application" role="dialog" aria-modal="true" aria-labelledby="sd-rule-application-title">
    <div className="sd-rules-workspace__application-head"><div><span>{t('common.applyThisRule')}</span><h2 id="sd-rule-application-title">{applicationRule.fileName}</h2></div><button type="button" className="sd-rules-workspace__button" onClick={() => setApplicationRuleId(null)} aria-label={t('common.close')}>×</button></div>
    <div className="sd-rules-workspace__provider-picker">
      <strong>AI Provider</strong>
      <div className="sd-rules-workspace__provider-options" aria-label={t('common.providerApplicationOptions')}>
        {providers.map((provider) => <label key={provider.id} className="sd-rules-workspace__provider-option">
          <input type="checkbox" checked={applicationProviderIds.includes(provider.id)} onChange={(event) => toggleApplicationProvider(provider.id, event.target.checked)} disabled={applicationBusy} aria-label={`${t('common.applyToProvider')} ${provider.name}`} />
          <span><strong>{provider.name}</strong><small>{renderApplicationStatus(applicationRule, provider)}</small></span>
        </label>)}
      </div>
    </div>
    <p className="sd-rules-workspace__application-note">{t('common.providerRuleApplicationNotice')}</p>
    {Object.keys(applicationStatuses).length > 0 ? <p className="sd-rules-workspace__application-status" role="status">{renderApplicationSummary(applicationRule)}</p> : null}
    <div className="sd-rules-workspace__actions">
      <button type="button" className="sd-rules-workspace__button" disabled={applicationBusy || applicationProviderIds.length === 0} onClick={() => void handleCheckApplication()}>{t('common.checkSelectedProviders')}</button>
      {applicationRule.kind === 'hook' ? <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={applicationBusy || applicationProviderIds.length === 0} onClick={() => void handleApply('install-hook')}>{t('common.installSelectedHooks')}</button> : <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={applicationBusy || applicationProviderIds.length === 0} onClick={() => void handleApply('apply')}>{t('common.applySelectedProviders')}</button>}
    </div>
  </div> : null

  const setHookEvent = (event: RuleHookEvent, checked: boolean) => {
    setStagedHookEvents((current) => checked ? [...new Set<RuleHookEvent>([...current, event])] : current.filter((item) => item !== event))
  }

  const handleReloadSingle = async (ruleId: string) => {
    setLocalError(null)
    const reloaded = await onReloadSingleRule?.(ruleId)
    if (reloaded) setSelectedRuleId(reloaded.id)
  }

  return (
    <section className="sd-rules-workspace" aria-label={t('common.aiRulesSettingsPage')}>
      <header className="sd-rules-workspace__heading">
        <div className="sd-rules-workspace__heading-top">
          <div className="sd-rules-workspace__settings-label">
            <SidebarNavIcon kind="rules" />
            <h1>{t('common.aiRulesAndInstructions')}</h1>
          </div>
        </div>
        <div className="sd-rules-workspace__heading-row">
          <div>
            <p className="sd-rules-workspace__description">{t('common.selectRuleFilesExplicitlyReviewTheirContentsAndSaveThemToTheLocalAgentRulesAreNeverScannedOrUploadedAutomatically')}</p>
          </div>
          <div className="sd-rules-workspace__heading-actions">
            <span className="sd-rules-workspace__sr-only" aria-live="polite">{agentBadgeLabel}</span>
            <button type="button" className="sd-rules-workspace__button" disabled={isBusy} onClick={() => void onReloadRules?.()}>↻ {t('common.reloadAlt')}</button>
          </div>
        </div>
      </header>

      {agentState === 'offline' ? <div className="sd-rules-workspace__notice is-error" role="alert">
        <div><strong>{t('common.theLocalRulesServiceLocalAgentIsOfflineOrUnavailable')}</strong><span>{agentError ?? t('common.confirmTheLocalServiceIsRunningThenReconnect')}</span></div>
        <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={isBusy} onClick={() => void onReloadRules?.()}>↻ {t('common.reconnectAndLoadRules')}</button>
      </div> : null}
      {localError ? <div className="sd-rules-workspace__notice is-error" role="alert"><span>{localError}</span><button type="button" className="sd-rules-workspace__button" onClick={() => setLocalError(null)}>{t('common.close')}</button></div> : null}
      {feedback ? <div className={`sd-rules-workspace__notice is-${feedback.tone}`} role={feedback.tone === 'err' ? 'alert' : 'status'}><span>{feedback.text}</span>{onClearFeedback ? <button type="button" className="sd-rules-workspace__button" onClick={onClearFeedback}>{t('common.close')}</button> : null}</div> : null}

      <section className="sd-rules-workspace__section" aria-labelledby="sd-rules-section-title">
        <header className="sd-rules-workspace__section-head">
          <div>
            <h2 id="sd-rules-section-title">{t('common.rulesAndInstructions')}</h2>
            <p>{t('common.manageTheRulesAppliedToAiDispatchOnlyExplicitlySelectedMdTxtFilesAreAcceptedAndContentIsPreviewedBeforeSaving')}</p>
          </div>
          <div><span>{t('common.saved')}{rules.length} / {MAX_RULES_COUNT}</span><span>{t('common.enabledAlt')}{enabledRules.length}</span></div>
        </header>

        <div className="sd-rules-workspace__upload">
          <div>
            <h3>{t('common.loadRuleFiles')}</h3>
            <p>{t('common.onlyExplicitlySelectedMdTxtFilesAreAcceptedEachFileIsLimitedTo256KibAndItsCommandsAreNeverExecuted')}</p>
          </div>
          <div className="sd-rules-workspace__upload-actions">
            <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={isBusy || rules.length >= MAX_RULES_COUNT} onClick={openDirectAdd}>＋ {t('common.addRuleDocument')}</button>
            <label className="sd-rules-workspace__button" htmlFor="sd-rule-file-input">
              ↥ {t('common.importRuleDocument')}
              <input id="sd-rule-file-input" type="file" className="sd-rules-workspace__file-input" accept=".md,.txt,text/markdown,text/plain" onChange={(event) => void handleFileChange(event)} />
            </label>
          </div>
        </div>

        {directAddOpen ? <div className="sd-rules-workspace__direct-add" role="dialog" aria-modal="true" aria-labelledby="sd-direct-rule-title">
          <div className="sd-rules-workspace__direct-add-head">
            <div><span>{t('common.addRuleDocument')}</span><h3 id="sd-direct-rule-title">{t('common.createRuleDocument')}</h3></div>
            <button type="button" className="sd-rules-workspace__button" onClick={() => setDirectAddOpen(false)} aria-label={t('common.close')}>×</button>
          </div>
          <label className="sd-rules-workspace__direct-add-field">{t('common.ruleFileName')}
            <input value={directFileName} onChange={(event) => setDirectFileName(event.target.value)} placeholder="example.md" />
          </label>
          <label className="sd-rules-workspace__direct-add-field">{t('common.ruleContent')}
            <textarea value={directContent} onChange={(event) => setDirectContent(event.target.value)} rows={8} placeholder={t('common.ruleContentPlaceholder')} />
          </label>
          <fieldset className="sd-rules-workspace__kind-picker">
            <legend>{t('common.ruleDocumentType')}</legend>
            <label><input type="radio" name="sd-direct-rule-kind" value="guidance" checked={stagedKind === 'guidance'} onChange={() => { setStagedKind('guidance'); setStagedHookEvents([]) }} />{t('common.guidanceReferenceOnly')}</label>
            <label><input type="radio" name="sd-direct-rule-kind" value="rule" checked={stagedKind === 'rule'} onChange={() => { setStagedKind('rule'); setStagedHookEvents([]) }} />{t('common.ruleMustBeFollowed')}</label>
            <label><input type="radio" name="sd-direct-rule-kind" value="hook" checked={stagedKind === 'hook'} onChange={() => setStagedKind('hook')} />{t('common.hook')}</label>
          </fieldset>
          {stagedKind === 'hook' ? <fieldset className="sd-rules-workspace__kind-picker">
            <legend>{t('common.hookTiming')}</legend>
            <label><input type="checkbox" checked={stagedHookEvents.includes('before-command')} onChange={(event) => setHookEvent('before-command', event.target.checked)} />{t('common.beforeCommandExecution')}</label>
            <label><input type="checkbox" checked={stagedHookEvents.includes('before-completion')} onChange={(event) => setHookEvent('before-completion', event.target.checked)} />{t('common.beforeCommandCompletion')}</label>
          </fieldset> : null}
          <div className="sd-rules-workspace__actions">
            <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={isBusy} onClick={() => void handleConfirmDirectAdd()}>{t('common.addRule')}</button>
            <button type="button" className="sd-rules-workspace__button" disabled={isBusy} onClick={() => setDirectAddOpen(false)}>{t('common.cancel')}</button>
          </div>
        </div> : null}

        {stagedFile ? <div className="sd-rules-workspace__staged" role="region" aria-label={t('common.ruleFilePreviewToAdd')}>
          <div className="sd-rules-workspace__staged-head">
            <div><strong>待加入文件：{stagedFile.fileName}</strong><span>{stagedFile.sizeBytes} bytes · {stagedFile.extension} · 尚未保存</span></div>
            <div className="sd-rules-workspace__actions">
              <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={isBusy} onClick={() => void handleConfirmAdd()}>{t('common.addRule')}</button>
              <button type="button" className="sd-rules-workspace__button" disabled={isBusy} onClick={() => setStagedFile(null)}>{t('common.discardPreview')}</button>
            </div>
          </div>
          <fieldset className="sd-rules-workspace__kind-picker">
            <legend>{t('common.ruleDocumentType')}</legend>
            <label><input type="radio" name="sd-rule-kind" value="guidance" checked={stagedKind === 'guidance'} onChange={() => { setStagedKind('guidance'); setStagedHookEvents([]) }} />{t('common.guidanceReferenceOnly')}</label>
            <label><input type="radio" name="sd-rule-kind" value="rule" checked={stagedKind === 'rule'} onChange={() => { setStagedKind('rule'); setStagedHookEvents([]) }} />{t('common.ruleMustBeFollowed')}</label>
            <label><input type="radio" name="sd-rule-kind" value="hook" checked={stagedKind === 'hook'} onChange={() => setStagedKind('hook')} />{t('common.hook')}</label>
          </fieldset>
          {stagedKind === 'hook' ? <fieldset className="sd-rules-workspace__kind-picker">
            <legend>{t('common.hookTiming')}</legend>
            <label><input type="checkbox" checked={stagedHookEvents.includes('before-command')} onChange={(event) => setHookEvent('before-command', event.target.checked)} />{t('common.beforeCommandExecution')}</label>
            <label><input type="checkbox" checked={stagedHookEvents.includes('before-completion')} onChange={(event) => setHookEvent('before-completion', event.target.checked)} />{t('common.beforeCommandCompletion')}</label>
          </fieldset> : null}
          <pre className="sd-rules-workspace__content"><code>{stagedFile.content}</code></pre>
        </div> : null}

        {rules.length === 0 ? <div className="sd-rules-workspace__empty" role="status">
          <strong>{t('common.noAiRuleFilesSelectedYet')}</strong>
          <p>{t('common.selectAMdOrTxtFilePreviewItThenAddItToTheLocalRuleLibrary')}</p>
        </div> : <div className="sd-rules-workspace__grid">
          <section className="sd-rules-workspace__list-pane" aria-label={t('common.savedRules')}>
            <header><h3>{t('common.savedRulesAlt')}</h3><span>{rules.length} {t('common.itemsAlt')}</span></header>
            <ul>
              {rules.map((rule, index) => {
                const selected = activePreviewRule?.id === rule.id
                return <li key={rule.id} className={`sd-rules-workspace__rule-item${selected ? ' is-selected' : ''}`} onClick={() => setSelectedRuleId(rule.id)}>
                  <div className="sd-rules-workspace__rule-main">
                    <button type="button" className="sd-rules-workspace__rule-select" onClick={() => setSelectedRuleId(rule.id)} aria-current={selected ? 'true' : undefined}>
                      <strong>{rule.fileName}</strong>
                      <span>#{index + 1} · <StatusBadge label={ruleKindLabel(rule.kind)} tone={ruleKindTone(rule.kind)} /> · {rule.sizeBytes} bytes · {rule.enabled ? t('common.enabled') : t('common.disabled')}</span>
                    </button>
                    <label className="sd-rules-workspace__toggle"><input type="checkbox" checked={rule.enabled} disabled={isBusy} onChange={() => void onToggleRule?.(rule.id, !rule.enabled)} aria-label={`${t('common.enableRule')} ${rule.fileName}`} /><span>{rule.enabled ? t('common.enable') : t('common.disable')}</span></label>
                  </div>
                  <div className="sd-rules-workspace__rule-actions">
                    <button type="button" disabled={index === 0 || isBusy} onClick={() => void onMoveRule?.(rule.id, 'up')} aria-label={`上移 ${rule.fileName}`}>↑</button>
                    <button type="button" disabled={index === rules.length - 1 || isBusy} onClick={() => void onMoveRule?.(rule.id, 'down')} aria-label={`下移 ${rule.fileName}`}>↓</button>
                    <button type="button" disabled={isBusy} onClick={() => void handleReloadSingle(rule.id)} aria-label={`${t('common.reload')} ${rule.fileName}`}>{t('common.reload')}</button>
                    <button type="button" disabled={isBusy} onClick={() => openEditRule(rule)}>{t('common.editRuleDocument')}</button>
                    <button type="button" disabled={isBusy} onClick={() => openApplication(rule)}>{t('common.applyThisRule')}</button>
                    <button type="button" disabled={isBusy} onClick={() => setConfirmRemoveId(rule.id)} aria-label={`${t('common.removeAlt')} ${rule.fileName}`}>{t('common.removeAlt')}</button>
                  </div>
                  {editingRuleId === rule.id ? <div className="sd-rules-workspace__direct-add" role="dialog" aria-modal="true" aria-labelledby="sd-edit-rule-title">
                    <div className="sd-rules-workspace__direct-add-head">
                      <div><span>{t('common.editRuleDocument')}</span><h3 id="sd-edit-rule-title">{rule.fileName}</h3></div>
                      <button type="button" className="sd-rules-workspace__button" onClick={() => setEditingRuleId(null)} aria-label={t('common.close')}>×</button>
                    </div>
                    <label className="sd-rules-workspace__direct-add-field">{t('common.ruleContent')}
                      <textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} rows={10} />
                    </label>
                    <div className="sd-rules-workspace__actions">
                      <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={isBusy} onClick={() => void handleConfirmEdit(rule)}>{t('common.saveChanges')}</button>
                      <button type="button" className="sd-rules-workspace__button" disabled={isBusy} onClick={() => setEditingRuleId(null)}>{t('common.cancel')}</button>
                    </div>
                  </div> : null}
                  {renderApplicationPanel(rule)}
                  {confirmRemoveId === rule.id ? <div className="sd-rules-workspace__confirm" role="alertdialog" aria-label={`確認移除 ${rule.fileName}`}>
                    <strong>{t('common.remove2')}{rule.fileName}{t('common.text16pjbr9')}</strong><span>{t('common.thisDeletesTheFileFromTheLocalRuleLibrary')}</span>
                    <button type="button" className="sd-rules-workspace__button sd-rules-workspace__button--danger" disabled={isBusy} onClick={async () => { if (await onRemoveRule?.(rule.id)) { setConfirmRemoveId(null); if (selectedRuleId === rule.id) setSelectedRuleId(null) } }}>{t('common.confirmRemoval')}</button>
                    <button type="button" className="sd-rules-workspace__button" disabled={isBusy} onClick={() => setConfirmRemoveId(null)}>{t('common.cancel')}</button>
                  </div> : null}
                </li>
              })}
            </ul>
          </section>
          <div className="sd-rules-workspace__detail">
            <section className="sd-rules-workspace__preview" aria-label={t('common.ruleFileContentPreview')}>
              {activePreviewRule ? <>
                <header><div><h3>{t('common.viewRule')}</h3><strong>{activePreviewRule.fileName}</strong><span>{activePreviewRule.sizeBytes} bytes · {activePreviewRule.loadedAtLabel} · {activePreviewRule.enabled ? t('common.includedInDispatchSummary') : t('common.disabled')}</span></div><div className="sd-rules-workspace__preview-badges"><StatusBadge label={ruleKindLabel(activePreviewRule.kind)} tone={ruleKindTone(activePreviewRule.kind)} /><StatusBadge label={activePreviewRule.extension} tone="accent" mono /></div></header>
                <pre className="sd-rules-workspace__content"><code>{activePreviewRule.content}</code></pre>
              </> : <div className="sd-rules-workspace__empty">{t('common.selectARuleToViewItsContent')}</div>}
            </section>
          </div>
        </div>}
      </section>
    </section>
  )
}
