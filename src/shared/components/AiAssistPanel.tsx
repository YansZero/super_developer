import { useEffect, useState } from 'react'
import type { ClipboardEvent } from 'react'
import type { ProviderId, ProviderSummary } from '../types/domain'
import type { ProviderModelOption } from '../../features/projects/detail/providerModelClient'
import type { ProviderModelSelection } from '../providers/useProviderModelSelection'
import { getProviderStatusKey } from '../providers/providerPresentation'
import { useI18n } from '../i18n'
import { createAiJob, updateAiJob, updateAiJobFailure, resolveDispatchErrorMessage, DispatchClientError, type DispatchJob, type ImageAttachment } from '../../features/projects/detail/dispatchClient'
import { PromptImageAttachments, handlePromptImagePaste } from './PromptImageAttachments'
import './AiAssistPanel.css'

export interface LibraryAssistStartInput {
  jobId?: string
  kind: 'skill' | 'mcp'
  mode: 'create' | 'edit'
  name?: string
  description?: string
  instruction: string
  providerId: ProviderId
  modelId: string
  effort: string
  currentContent?: string
  imageAttachment?: ImageAttachment
  imageAttachments?: ImageAttachment[]
}

export interface LibraryAssistPollResponse<TDraft> {
  ok: boolean
  job: DispatchJob
  draft: TDraft | null
  parseError: string | null
  message?: string
}

interface AiAssistPanelProps<TDraft> {
  kind: 'skill' | 'mcp'
  mode: 'create' | 'edit'
  itemName: string
  itemDescription?: string
  currentContent?: string
  fixedLibraryPathLabel: string
  providers: ProviderSummary[]
  modelSelection: ProviderModelSelection
  defaultInstructionPlaceholder: string
  renderDraftPreview: (draft: TDraft) => React.ReactNode
  onApplyDraft: (draft: TDraft) => void
  fetcher?: typeof fetch
}

export function AiAssistPanel<TDraft>({
  kind,
  mode,
  itemName,
  itemDescription = '',
  currentContent = '',
  fixedLibraryPathLabel,
  providers,
  modelSelection,
  defaultInstructionPlaceholder,
  renderDraftPreview,
  onApplyDraft,
  fetcher = fetch,
}: AiAssistPanelProps<TDraft>) {
  const { t } = useI18n()
  const [instruction, setInstruction] = useState('')
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([])
  const [runningJob, setRunningJob] = useState<DispatchJob | null>(null)
  const [draft, setDraft] = useState<TDraft | null>(null)
  const [assistError, setAssistError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [historyJobId, setHistoryJobId] = useState<string | null>(null)

  const handlePromptPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    handlePromptImagePaste(event, {
      current: imageAttachments,
      onChange: (next) => {
        setAssistError(null)
        setImageAttachments(next)
      },
      onError: setAssistError,
      messages: {
        tooLarge: t('aiWork.imageAttachmentTooLarge'),
        maxCount: t('aiWork.imageAttachmentMaxCount'),
      },
    })
  }

  const builtinProviders = providers.filter((p) => p.isBuiltin)
  const catalogCurrent =
    modelSelection.providerModelCatalog.providerId === modelSelection.selectedProviderId
  const selectedModel = modelSelection.providerModelCatalog.models.find(
    (m) => m.id === modelSelection.selectedModelId,
  )
  const effortOptions = selectedModel?.efforts ?? []
  const selectedEffortLabel =
    modelSelection.selectedEffort === 'default'
      ? t('common.cliDefault')
      : modelSelection.selectedEffort

  useEffect(() => {
    if (!runningJob || !['queued', 'running'].includes(runningJob.status)) return
    let cancelled = false
    const timer = setInterval(() => {
      fetcher(`/api/library-assist/${encodeURIComponent(runningJob.id)}`)
        .then((res) => res.json() as Promise<LibraryAssistPollResponse<TDraft>>)
        .then((data) => {
          if (cancelled || !data.ok) return
          setRunningJob(data.job)
          if (historyJobId) void updateAiJob(historyJobId, data.job, fetcher).catch(() => undefined)
          if (data.job.status === 'succeeded') {
            if (data.draft) {
              setDraft(data.draft)
              setAssistError(null)
            } else {
              setAssistError(data.parseError || t('library.aiDraftParseFailed'))
            }
          } else if (data.job.status === 'failed' || data.job.status === 'timed_out') {
            setAssistError(data.job.error || t('common.failed'))
          }
        })
        .catch(() => {
          // ignore transient poll error
        })
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [fetcher, historyJobId, runningJob, t])

  const handleStartAssist = async () => {
    if (!instruction.trim()) {
      setAssistError(t('library.pleaseEnterAiInstruction'))
      return
    }
    setIsStarting(true)
    setAssistError(null)
    setDraft(null)
    setHistoryJobId(null)
    const jobTitle = `${kind === 'skill' ? t('library.skillDraftJobTitle') : t('library.mcpDraftJobTitle')}：${itemName || t('library.draftName')}`
    let historyRecordId: string | null = null
    try {
      const historyRecord = await createAiJob({
        taskType: kind === 'skill' ? 'library-skill' : 'library-mcp',
        projectId: `library-${kind}`,
        projectPath: fixedLibraryPathLabel,
        projectName: jobTitle,
        branchName: null,
        providerId: modelSelection.selectedProviderId,
        modelId: modelSelection.selectedModelId,
        effort: modelSelection.selectedEffort,
        prompt: instruction.trim(),
        jiraTicketTitle: jobTitle,
      }, fetcher)
      historyRecordId = historyRecord.id
      setHistoryJobId(historyRecord.id)

      const res = await fetcher('/api/library-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: historyRecord.id,
          kind,
          mode,
          name: itemName,
          description: itemDescription,
          instruction: instruction.trim(),
          providerId: modelSelection.selectedProviderId,
          modelId: modelSelection.selectedModelId,
          effort: modelSelection.selectedEffort,
          currentContent,
          ...(imageAttachments.length > 0 ? { imageAttachment: imageAttachments[0], imageAttachments } : {}),
        } satisfies LibraryAssistStartInput),
      })
      const data = (await res.json()) as { ok: boolean; job?: DispatchJob; message?: string; code?: string; errorCode?: string }
      if (!res.ok || !data.ok || !data.job) {
        const errorObj = new DispatchClientError(data.message || t('library.aiAssistStartFailed'), res.status, data.code || data.errorCode)
        const message = resolveDispatchErrorMessage(errorObj, t)
        await updateAiJobFailure(historyRecord.id, message, fetcher).catch(() => undefined)
        setAssistError(message)
      } else {
        const startedJob = data.job
        setRunningJob(startedJob)
        await updateAiJob(historyRecord.id, startedJob, fetcher)
      }
    } catch (error) {
      const message = resolveDispatchErrorMessage(error, t)
      if (historyRecordId) await updateAiJobFailure(historyRecordId, message, fetcher).catch(() => undefined)
      setAssistError(message)
    } finally {
      setIsStarting(false)
    }
  }

  const handleCancelAssist = async () => {
    if (!runningJob) return
    try {
      const res = await fetcher(`/api/library-assist/${encodeURIComponent(runningJob.id)}`, {
        method: 'DELETE',
      })
      const data = (await res.json()) as { ok: boolean; job?: DispatchJob }
      if (data.job) {
        setRunningJob(data.job)
        if (historyJobId) void updateAiJob(historyJobId, data.job, fetcher).catch(() => undefined)
      }
    } catch {
      // ignore
    }
  }

  const isRunning = Boolean(runningJob && ['queued', 'running'].includes(runningJob.status))

  return (
    <aside className="sd-ai-assist" aria-label={t('library.aiAssistTitle')}>
      <h3 className="sd-ai-assist__title">{t('library.aiAssistTitle')}</h3>

      <div className="sd-ai-assist__form">
        <label className="sd-ai-assist__label" htmlFor={`sd-assist-provider-${kind}`}>
          AI Provider：
        </label>
        <select
          id={`sd-assist-provider-${kind}`}
          className="sd-ai-assist__select"
          value={modelSelection.selectedProviderId}
          onChange={(e) => {
            modelSelection.setSelectedProviderId(e.target.value as ProviderId)
            modelSelection.setSelectedModelId('default')
            modelSelection.setSelectedEffort('default')
            modelSelection.setProviderModelLoading(true)
          }}
        >
          {(builtinProviders.length > 0 ? builtinProviders : providers).map((prov) => (
            <option key={prov.id} value={prov.id}>
              {prov.name} —{' '}
              {getProviderStatusKey(prov)
                ? t(getProviderStatusKey(prov)!, { version: prov.version ?? '' })
                : t(prov.statusText)}
            </option>
          ))}
        </select>

        <div className="sd-ai-assist__model-row">
          <label className="sd-ai-assist__label" htmlFor={`sd-assist-model-${kind}`}>
            Model：
            <select
              id={`sd-assist-model-${kind}`}
              className="sd-ai-assist__select"
              value={modelSelection.selectedModelId}
              disabled={modelSelection.providerModelLoading || !catalogCurrent}
              onChange={(event) => {
                const model = modelSelection.providerModelCatalog.models.find(
                  (item) => item.id === event.target.value,
                )
                modelSelection.setSelectedModelId(event.target.value)
                modelSelection.setSelectedEffort(
                  model?.efforts.includes('medium') ? 'medium' : model?.efforts[0] ?? 'default',
                )
              }}
            >
              {modelSelection.providerModelCatalog.models.map((model: ProviderModelOption) => (
                <option key={model.id} value={model.id}>
                  {t(model.label)}
                </option>
              ))}
            </select>
          </label>

          <label className="sd-ai-assist__label" htmlFor={`sd-assist-effort-${kind}`}>
            Effort：
            <select
              id={`sd-assist-effort-${kind}`}
              className="sd-ai-assist__select"
              value={modelSelection.selectedEffort}
              disabled={
                modelSelection.selectedModelId === 'default' || effortOptions.length === 0
              }
              onChange={(event) => modelSelection.setSelectedEffort(event.target.value)}
            >
              {modelSelection.selectedModelId === 'default' || effortOptions.length === 0 ? (
                <option value="default">{t('common.cliDefault')}</option>
              ) : (
                effortOptions.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <p className="sd-ai-assist__model-note" role="status">
          {modelSelection.providerModelLoading || !catalogCurrent
            ? t('common.loadingAvailableModelsForThisProvider')
            : modelSelection.providerModelError ??
              t(modelSelection.providerModelCatalog.message)}
        </p>

        <label className="sd-ai-assist__label" htmlFor={`sd-assist-prompt-${kind}`}>
          {kind === 'skill' ? t('library.skillAssistPromptLabel') : t('library.mcpAssistPromptLabel')}
        </label>
        <textarea
          id={`sd-assist-prompt-${kind}`}
          className="sd-ai-assist__textarea"
          rows={5}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onPaste={handlePromptPaste}
          placeholder={defaultInstructionPlaceholder}
        />
        <PromptImageAttachments
          attachments={imageAttachments}
          onRemove={(index) => setImageAttachments((prev) => prev.filter((_, i) => i !== index))}
          disabled={isStarting || isRunning}
        />
      </div>

      <div className="sd-ai-assist__preview-box">
        <div className="sd-ai-assist__meta-row">
          <span className="sd-ai-assist__meta-key">{t('library.lockedDirectory')}：</span>
          <code>{fixedLibraryPathLabel}</code>
        </div>
        <div className="sd-ai-assist__meta-row">
          <span className="sd-ai-assist__meta-key">Model / Effort：</span>
          <span>
            {selectedModel ? t(selectedModel.label) : t('common.cliDefault')} /{' '}
            {selectedEffortLabel}
          </span>
        </div>
        <div className="sd-ai-assist__notice">{t('library.aiReadOnlyDraftNotice')}</div>

        <div className="sd-ai-assist__actions">
          <button
            type="button"
            className="sd-ai-assist__primary-btn"
            disabled={isStarting || isRunning}
            onClick={() => void handleStartAssist()}
          >
            {isStarting || isRunning ? t('library.generatingDraft') : t('library.generateAiDraft')}
          </button>
          {isRunning ? (
            <button
              type="button"
              className="sd-ai-assist__secondary-btn"
              onClick={() => void handleCancelAssist()}
            >
              {t('common.cancel')}
            </button>
          ) : null}
        </div>
      </div>

      {assistError ? (
        <div className="sd-ai-assist__error" role="alert">
          {assistError}
        </div>
      ) : null}

      {draft ? (
        <div className="sd-ai-assist__draft-card" role="region" aria-label={t('library.aiDraftPreview')}>
          <div className="sd-ai-assist__draft-head">
            <strong>{t('library.aiDraftPreview')}</strong>
            <div className="sd-ai-assist__draft-btns">
              <button
                type="button"
                className="sd-ai-assist__apply-btn"
                onClick={() => {
                  onApplyDraft(draft)
                  setDraft(null)
                }}
              >
                {t('library.applyToEditor')}
              </button>
              <button
                type="button"
                className="sd-ai-assist__secondary-btn"
                onClick={() => setDraft(null)}
              >
                {t('library.discardDraft')}
              </button>
            </div>
          </div>
          <div className="sd-ai-assist__draft-body">{renderDraftPreview(draft)}</div>
        </div>
      ) : null}
    </aside>
  )
}
