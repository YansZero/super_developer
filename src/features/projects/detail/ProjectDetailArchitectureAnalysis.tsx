import type { ClipboardEvent, RefObject } from 'react'
import { PromptImageAttachments, handlePromptImagePaste } from '../../../shared/components/PromptImageAttachments'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import type { ProjectArchitectureAnalysis, ProjectItem, ProviderId, ProviderSummary, SettingsTabId } from '../../../shared/types/domain'
import type { DispatchJob, ImageAttachment } from './dispatchClient'
import type { ProviderModelOption } from './providerModelClient'
import type { ProviderModelSelection } from './hooks/useProviderModelSelection'
import type { TrackedDispatchJob } from './dispatchJobStore'
import { useI18n } from '../../../shared/i18n'
import { getProviderStatusKey } from '../../../shared/providers/providerPresentation'

interface Props {
  project: ProjectItem
  architectureAnalysisSectionRef: RefObject<HTMLElement | null>
  providers: ProviderSummary[]
  modelSelection: ProviderModelSelection
  architectureCatalogCurrent: boolean
  architectureEffortOptions: string[]
  architectureSelectedModel: ProviderModelOption | undefined
  architectureSelectedEffortLabel: string
  architectureProviderSupportsDispatch: boolean
  dispatchPreview: { branchLabel: string }
  savedArchitectureAnalysis: ProjectArchitectureAnalysis | null | undefined
  architectureDispatchError: string | null
  architectureDispatchStarting: boolean
  architectureDispatchRunning: boolean
  architectureDispatchJob: DispatchJob | null
  architectureDispatchRecord: TrackedDispatchJob | null
  architectureSaveError: string | null
  hasSavedArchitectureAnalysis: boolean
  promptText: string
  setPromptText: (prompt: string) => void
  imageAttachments?: ImageAttachment[]
  setImageAttachments?: (attachments: ImageAttachment[]) => void
  onAttachmentError?: (message: string | null) => void
  stopDispatch: (jobId: string, taskType: 'jira' | 'architecture') => Promise<void>
  retryArchitectureSave: (jobId: string) => Promise<void>
  onRequestDispatch: () => void
  onOpenSettingsTab: (tab: SettingsTabId) => void
  onShowSavedAnalysis: () => void
}

export function ProjectDetailArchitectureAnalysis({
  project, architectureAnalysisSectionRef, providers, modelSelection,
  architectureCatalogCurrent, architectureEffortOptions, architectureSelectedModel,
  architectureSelectedEffortLabel, architectureProviderSupportsDispatch, dispatchPreview, savedArchitectureAnalysis,
  architectureDispatchError, architectureDispatchStarting, architectureDispatchRunning,
  architectureDispatchJob, architectureDispatchRecord, architectureSaveError,
  hasSavedArchitectureAnalysis, promptText, setPromptText, imageAttachments = [], setImageAttachments, onAttachmentError, stopDispatch, retryArchitectureSave,
  onRequestDispatch, onOpenSettingsTab, onShowSavedAnalysis,
}: Props) {
  const { t } = useI18n()
  const architectureModelSelection = modelSelection
  const architectureDispatchRecordForView = architectureDispatchRecord
  const handlePromptPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!setImageAttachments) return
    handlePromptImagePaste(event, {
      current: imageAttachments,
      onChange: (next) => {
        onAttachmentError?.(null)
        setImageAttachments(next)
      },
      onError: (msg) => onAttachmentError?.(msg),
      messages: {
        tooLarge: t('aiWork.imageAttachmentTooLarge'),
        maxCount: t('aiWork.imageAttachmentMaxCount'),
      },
    })
  }
  return (
<section ref={architectureAnalysisSectionRef} className="sd-detail__section" aria-label={t('common.aiProjectArchitectureAnalysis')}>
          <header className="sd-detail__section-head">
            <div>
              <h2 className="sd-detail__section-title">{t('common.aiProjectArchitectureAnalysis')}</h2>
              <p className="sd-detail__section-sub">
                {t('common.readThisProjectSFrontendBackendAndAppStructureThenSummarizeItsModulesTechnologiesAndEntryPointsResultsAppearOnTheRight')}
              </p>
            </div>
            <StatusBadge label={t('common.theAiCliStartsOnlyAfterConfirmation')} tone="ok" />
          </header>

          <div className="sd-detail__analysis-workspace">
            <div className="sd-detail__pane">
              <h3 className="sd-detail__subhead">{t('common.analysisScope')}</h3>
              <p className="sd-detail__section-sub">
                {t('common.theAnalysisCommandDefaultsToReadOnlyInspectionAndUsesTheRelativePathsItActuallyReads')}
              </p>
              <ul className="sd-detail__analysis-list">
                <li>{t('common.mainDirectoriesAndEntryFilesForTheFrontendBackendAndApp')}</li>
                <li>{t('common.languagesFrameworksDependencyConfigurationAndBuildMethod')}</li>
                <li>{t('common.relationshipsBetweenMajorModulesAndArchitectureCharacteristics')}</li>
                <li>{t('common.areasWithInsufficientInformationOrRequiringManualConfirmation')}</li>
              </ul>
              {architectureDispatchError ? <div className="sd-detail__dispatch-error" role="alert">{architectureDispatchError}</div> : null}
              {architectureDispatchJob ? (
                <section className="sd-detail__dispatch-job" aria-label={t('common.aiArchitectureAnalysisStatus')}>
                  <div className="sd-detail__dispatch-job-head">
                    <strong>{t('common.analysisStatus')}{t(({ queued: 'common.queued', running: 'common.analyzing', succeeded: 'common.completed', failed: 'common.failed', cancelled: 'common.cancelled', timed_out: 'common.timedOut' } as Record<string, string>)[architectureDispatchJob.status] ?? architectureDispatchJob.status)}</strong>
                    {['queued', 'running'].includes(architectureDispatchJob.status) ? (
                      <button type="button" className="sd-detail__mini-btn" onClick={() => void stopDispatch(architectureDispatchJob.id, 'architecture')}>{t('common.cancelAnalysis')}</button>
                    ) : null}
                  </div>
                  {architectureDispatchJob.error ? <p className="sd-detail__dispatch-error">{architectureDispatchJob.error}</p> : null}
                  {architectureSaveError ? <div className="sd-detail__dispatch-error" role="alert">{architectureSaveError} <button type="button" className="sd-detail__mini-btn" onClick={() => void retryArchitectureSave(architectureDispatchJob.id)}>{t('common.retrySave')}</button></div> : null}
                  {architectureDispatchJob.status === 'succeeded' && architectureDispatchRecordForView?.architectureSaved ? (
                    <p className="sd-detail__section-sub">{t('common.analysisIsCompleteTheFullResultIsShownInTheArchitectureTreeAbove')}</p>
                  ) : architectureDispatchRecordForView?.architectureSaving ? (
                    <p className="sd-detail__section-sub">{t('common.analysisFinishedSavingResult')}</p>
                  ) : (
                    <pre className="sd-detail__dispatch-output">{architectureDispatchJob.output || (['queued', 'running'].includes(architectureDispatchJob.status) ? t('common.waitingForAnalysisResults') : t('common.theAiCliProducedNoOutput'))}</pre>
                  )}
                </section>
              ) : hasSavedArchitectureAnalysis ? (
                <div className="sd-detail__analysis-empty" role="status">
                  <strong>{t('common.aSavedProjectStructureAnalysisExists')}</strong>
                  <p>{t('common.latestAnalysis')}{savedArchitectureAnalysis?.analyzedAt ? new Date(savedArchitectureAnalysis.analyzedAt).toLocaleString() : t('common.timeUnavailable')}</p>
                  <button
                    type="button"
                    className="sd-detail__mini-btn"
                    onClick={onShowSavedAnalysis}
                  >
                    {t('common.viewSavedAnalysis')}
                  </button>
                </div>
              ) : (
                <div className="sd-detail__analysis-empty" role="status">{t('common.projectStructureAnalysisHasNotBeenRunAlt')}</div>
              )}
            </div>

            <div className="sd-detail__pane">
              <h3 className="sd-detail__subhead">{t('common.aiAnalysisSettings')}</h3>
              <div className="sd-detail__dispatch-form">
                <label className="sd-detail__field-label" htmlFor="sd-dispatch-provider">
                  AI Provider：
                </label>
                <select
                  id="sd-dispatch-provider"
                  className="sd-detail__select"
                  value={architectureModelSelection.selectedProviderId}
                  onChange={(e) => {
                    architectureModelSelection.setSelectedProviderId(e.target.value as ProviderId)
                    architectureModelSelection.setSelectedModelId('default')
                    architectureModelSelection.setSelectedEffort('default')
                    architectureModelSelection.setProviderModelLoading(true)
                  }}
                >
                  {providers.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.name} — {getProviderStatusKey(prov) ? t(getProviderStatusKey(prov)!, { version: prov.version ?? '' }) : t(prov.statusText)}
                    </option>
                  ))}
                </select>

                <div className="sd-detail__model-controls">
                  <label className="sd-detail__field-label" htmlFor="sd-dispatch-model">
                    Model：
                    <select
                      id="sd-dispatch-model"
                      className="sd-detail__select"
                      value={architectureModelSelection.selectedModelId}
                      disabled={architectureModelSelection.providerModelLoading || !architectureCatalogCurrent}
                      onChange={(event) => {
                        const model = architectureModelSelection.providerModelCatalog.models.find((item) => item.id === event.target.value)
                        architectureModelSelection.setSelectedModelId(event.target.value)
                        architectureModelSelection.setSelectedEffort(model?.efforts.includes('medium') ? 'medium' : model?.efforts[0] ?? 'default')
                      }}
                    >
                      {architectureModelSelection.providerModelCatalog.models.map((model: ProviderModelOption) => (
                        <option key={model.id} value={model.id}>{t(model.label)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="sd-detail__field-label" htmlFor="sd-dispatch-effort">
                    Effort：
                    <select
                      id="sd-dispatch-effort"
                      className="sd-detail__select"
                      value={architectureModelSelection.selectedEffort}
                      disabled={architectureModelSelection.selectedModelId === 'default' || architectureEffortOptions.length === 0}
                      onChange={(event) => architectureModelSelection.setSelectedEffort(event.target.value)}
                    >
                      {architectureModelSelection.selectedModelId === 'default' || architectureEffortOptions.length === 0 ? (
                        <option value="default">{t('common.cliDefault')}</option>
                      ) : architectureEffortOptions.map((effort) => (
                        <option key={effort} value={effort}>{effort}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="sd-detail__model-note" role="status">
                  {architectureModelSelection.providerModelLoading || !architectureCatalogCurrent
                    ? t('common.loadingAvailableModelsForThisProvider')
                    : architectureModelSelection.providerModelError ?? t(architectureModelSelection.providerModelCatalog.message)}
                </p>

                <label className="sd-detail__field-label" htmlFor="sd-dispatch-prompt">
                  {t('common.projectStructureAnalysisPrompt')}
                </label>
                <textarea
                  id="sd-dispatch-prompt"
                  className="sd-detail__textarea"
                  rows={5}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onPaste={handlePromptPaste}
                  placeholder={t('common.enterTheProjectStructureAndFocusAreasForTheAiToAnalyze')}
                />
                <PromptImageAttachments
                  attachments={imageAttachments}
                  onRemove={(index) => setImageAttachments?.(imageAttachments.filter((_, i) => i !== index))}
                  disabled={architectureDispatchStarting || architectureDispatchRunning}
                />
              </div>

              <div className="sd-detail__dispatch-preview">
                <div className="sd-detail__preview-row">
                  <span className="sd-detail__meta-key">{t('common.projectAlt')}</span>
                  <span>{project.name}</span>
                </div>
                <div className="sd-detail__preview-row">
                  <span className="sd-detail__meta-key">{t('common.currentBranch')}</span>
                  <code>{dispatchPreview.branchLabel}</code>
                </div>
                <div className="sd-detail__preview-row">
                  <span className="sd-detail__meta-key">Model / Effort：</span>
                  <span>{architectureSelectedModel ? t(architectureSelectedModel.label) : t('common.cliDefault')} / {architectureSelectedEffortLabel}</span>
                </div>
                <p className="sd-detail__preview-notice">
                  {t('common.theAnalysisCommandIsReadOnlyAndWillNotModifyFilesTheAiCliCanStillAccessTheLocalProjectDirectoryReviewItBeforeStarting')}
                </p>
                <div className="sd-detail__preview-actions">
                  <button
                    type="button"
                    className="sd-detail__mini-btn sd-detail__analysis-action-btn"
                    disabled={!promptText.trim() || !project.folderPath || !architectureProviderSupportsDispatch || architectureDispatchStarting || architectureDispatchRunning || architectureModelSelection.providerModelLoading || !architectureCatalogCurrent}
                    onClick={onRequestDispatch}
                  >
                    {t('common.confirmAndStartAiStructureAnalysis')}
                  </button>
                  {!architectureProviderSupportsDispatch ? <span className="sd-detail__model-note">{t('common.thisCustomProviderDoesNotProvideASupportedFixedCliExecutionMethod')}</span> : null}
                  <button
                    type="button"
                    className="sd-detail__mini-btn sd-detail__analysis-action-btn"
                    onClick={() => onOpenSettingsTab('rules')}
                  >
                    {t('common.chooseAiRuleFiles')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
  )
}
