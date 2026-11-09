import type { ClipboardEvent } from 'react'
import { PromptImageAttachments, handlePromptImagePaste } from '../../../shared/components/PromptImageAttachments'
import type { ProjectItem, ProviderId, ProviderSummary } from '../../../shared/types/domain'
import type { ImageAttachment } from './dispatchClient'
import type { ProviderModelSelection } from './hooks/useProviderModelSelection'
import { useI18n } from '../../../shared/i18n'

interface Props {
  project: ProjectItem
  implementation?: {
    source: string
    selection: ProviderModelSelection
    providers: ProviderSummary[]
    prompt: string
    setPrompt: (prompt: string) => void
    imageAttachments?: ImageAttachment[]
    setImageAttachments?: (attachments: ImageAttachment[]) => void
    onAttachmentError?: (message: string | null) => void
    error: string | null
  }
  confirmationTaskType: 'jira' | 'architecture'
  confirmationProviderName: string
  confirmationModelLabel: string
  confirmationEffortLabel: string
  confirmationPrompt: string
  confirmationAttachments?: ImageAttachment[]
  confirmationStarting: boolean
  confirmationTitle?: string
  confirmationNotice?: string
  providerOptions?: ProviderSummary[]
  selectedProviderId?: ProviderId
  onProviderChange?: (providerId: ProviderId) => void
  onClose: () => void
  onConfirm: () => void
}

export function DispatchConfirmationDialog({
  project, confirmationTaskType, confirmationProviderName, confirmationModelLabel,
  confirmationEffortLabel, confirmationPrompt, confirmationAttachments = [], confirmationStarting, confirmationTitle, confirmationNotice,
  providerOptions, selectedProviderId, onProviderChange, onClose, onConfirm, implementation,
}: Props) {
  const { t } = useI18n()
  if (implementation) {
    const { selection, source, prompt, setPrompt, imageAttachments = [], setImageAttachments, onAttachmentError, error } = implementation
    const model = selection.providerModelCatalog.models.find((item) => item.id === selection.selectedModelId)
    const efforts = model?.efforts ?? []
    const handleImplementationPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
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
    return <div className="sd-detail__confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !confirmationStarting) onClose() }}>
      <section className="sd-detail__confirm-dialog sd-detail__implementation-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-implementation-title">
        <header className="sd-detail__implementation-header"><h2 id="sd-implementation-title">{t('progress.dispatchTitle')}</h2></header>
        <div className="sd-detail__implementation-source"><strong>{t('progress.source')}</strong><span>{source}</span></div>
        <label className="sd-detail__field-label">AI Provider
          <select className="sd-detail__select" value={selection.selectedProviderId} disabled={confirmationStarting} onChange={(event) => selection.setSelectedProviderId(event.target.value as ProviderId)}>
            {implementation.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
        </label>
        <label className="sd-detail__field-label">{t('progress.model')}
          <select className="sd-detail__select" value={selection.selectedModelId} disabled={confirmationStarting || selection.providerModelLoading || selection.providerModelCatalog.providerId !== selection.selectedProviderId} onChange={(event) => {
            const next = selection.providerModelCatalog.models.find((item) => item.id === event.target.value)
            selection.setSelectedModelId(event.target.value)
            selection.setSelectedEffort(next?.efforts.includes('medium') ? 'medium' : next?.efforts[0] ?? 'default')
          }}>{selection.providerModelCatalog.models.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select>
        </label>
        <label className="sd-detail__field-label">Effort
          <select className="sd-detail__select" value={selection.selectedEffort} disabled={confirmationStarting || selection.selectedModelId === 'default' || efforts.length === 0} onChange={(event) => selection.setSelectedEffort(event.target.value)}>
            {efforts.length && selection.selectedModelId !== 'default' ? efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>) : <option value="default">{t('common.cliDefault')}</option>}
          </select>
        </label>
        <label className="sd-detail__field-label">{t('progress.instruction')}
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onPaste={handleImplementationPaste} disabled={confirmationStarting} rows={9} />
        </label>
        <PromptImageAttachments
          attachments={imageAttachments}
          onRemove={(index) => setImageAttachments?.(imageAttachments.filter((_, i) => i !== index))}
          disabled={confirmationStarting}
        />
        {error ? <p role="alert" className="sd-detail__dispatch-error">{error}</p> : null}
        <div className="sd-detail__confirm-actions"><button type="button" className="sd-detail__confirm-cancel" disabled={confirmationStarting} onClick={onClose}>{t('common.cancel')}</button><button type="button" className="sd-detail__confirm-start" disabled={confirmationStarting || selection.providerModelLoading || !prompt.trim()} onClick={onConfirm}>{confirmationStarting ? t('common.starting') : t('common.confirmAndDispatch')}</button></div>
      </section>
    </div>
  }
  return (
<div className="sd-detail__confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
          <section className="sd-detail__confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="sd-dispatch-confirm-title">
            <h2 id="sd-dispatch-confirm-title">{confirmationTitle ?? (confirmationTaskType === 'jira' ? t('common.confirmJiraTicketAiDispatch') : t('common.confirmAiProjectArchitectureAnalysis'))}</h2>
            <p>{confirmationNotice ?? t('common.reviewTheTaskAndExecutionSettingsTheAiCliWillRunInThisProjectDirectory')}</p>
            {providerOptions && selectedProviderId && onProviderChange ? (
              <label className="sd-detail__field-label" htmlFor="sd-dispatch-confirm-provider">
                AI Provider：
                <select
                  id="sd-dispatch-confirm-provider"
                  className="sd-detail__select"
                  value={selectedProviderId}
                  onChange={(event) => onProviderChange(event.target.value as ProviderId)}
                >
                  {providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </select>
              </label>
            ) : null}
            <dl>
              <div><dt>{t('common.project')}</dt><dd>{project.name}</dd></div>
              <div><dt>{t('common.folder')}</dt><dd>{project.folderPath}</dd></div>
              <div><dt>{t('common.branchAlt')}</dt><dd>{project.git.branchName || t('common.notDetectedAlt')}</dd></div>
              <div><dt>Provider</dt><dd>{confirmationProviderName}</dd></div>
              <div><dt>Model / Effort</dt><dd>{confirmationModelLabel} / {confirmationEffortLabel}</dd></div>
            </dl>
            <label className="sd-detail__confirm-prompt" htmlFor="sd-dispatch-confirm-prompt">{t('common.taskAlt')}</label>
            <pre>{confirmationPrompt}</pre>
            <PromptImageAttachments attachments={confirmationAttachments} readOnly />
            <p className="sd-detail__preview-notice">{confirmationTaskType === 'jira' ? t('common.theAiCliWillProcessThisJiraTaskLocallyAndMayReadOrModifyProjectFilesReviewItBeforeStarting') : t('common.theCommandRequestsReadOnlyAnalysisTheCliCanStillAccessTheProjectDirectoryReviewItBeforeStarting')}</p>
            <div className="sd-detail__confirm-actions">
              <button type="button" className="sd-detail__mini-btn" disabled={confirmationStarting} onClick={() => onClose()}>{t('common.backToEdit')}</button>
              <button type="button" className="sd-detail__confirm-start" disabled={confirmationStarting} onClick={() => onConfirm()}>{confirmationStarting ? t('common.starting') : confirmationTaskType === 'jira' ? t('common.confirmAndDispatch') : t('common.confirmAndAnalyze')}</button>
            </div>
          </section>
        </div>
  )
}
