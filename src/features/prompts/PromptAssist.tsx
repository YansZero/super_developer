import { useEffect, useState } from 'react'
import type { ClipboardEvent } from 'react'
import { PromptImageAttachments, handlePromptImagePaste } from '../../shared/components/PromptImageAttachments'
import type { ProviderId, ProviderSummary } from '../../shared/types/domain'
import { useProviderModelSelection } from '../../shared/providers/useProviderModelSelection'
import { useI18n } from '../../shared/i18n'
import { DispatchClientError, resolveDispatchErrorMessage, type ImageAttachment } from '../projects/detail/dispatchClient'
import { MarkdownAnalysisOutput } from '../projects/detail/ProjectDetailArchitectureTree'
import '../../shared/components/AiAssistPanel.css'

export function PromptAssist({ providers, content, onApply }: { providers: ProviderSummary[]; content: string; onApply: (value: string) => void }) {
  const { t } = useI18n()
  const model = useProviderModelSelection()
  const [instruction, setInstruction] = useState('')
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([])
  const [jobId, setJobId] = useState('')
  const [source, setSource] = useState('')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)

  const handlePromptPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    handlePromptImagePaste(event, {
      current: imageAttachments,
      onChange: (next) => {
        setError('')
        setImageAttachments(next)
      },
      onError: setError,
      messages: {
        tooLarge: t('aiWork.imageAttachmentTooLarge'),
        maxCount: t('aiWork.imageAttachmentMaxCount'),
      },
    })
  }

  useEffect(() => {
    if (!jobId) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const response = await fetch(`/api/prompts/translation/${encodeURIComponent(jobId)}`)
        const data = await response.json()
        if (!response.ok || !data.ok) throw new Error(data.message || t('prompts.assistFailed'))
        if (!active) return
        if (data.job.status === 'queued' || data.job.status === 'running') timer = setTimeout(poll, 1500)
        else {
          setJobId('')
          if (data.job.status === 'succeeded' && data.job.content) setDraft(data.job.content)
          else setError(data.job.error || t('prompts.assistFailed'))
        }
      } catch (err) {
        if (active) { setJobId(''); setError(err instanceof Error ? err.message : t('prompts.assistFailed')) }
      }
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [jobId, t])

  const start = async () => {
    setStarting(true); setError(''); setDraft('')
    try {
      const response = await fetch('/api/prompts/draft.md', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'assist',
          content,
          instruction,
          providerId: model.selectedProviderId,
          modelId: model.selectedModelId,
          effort: model.selectedEffort,
          ...(imageAttachments.length > 0 ? { imageAttachment: imageAttachments[0], imageAttachments } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.ok || !data.id) {
        throw new DispatchClientError(data.message || t('prompts.assistFailed'), response.status, data.code || data.errorCode)
      }
      setSource(content); setJobId(data.id)
    } catch (err) { setError(resolveDispatchErrorMessage(err, t)) }
    finally { setStarting(false) }
  }
  const selectedModel = model.providerModelCatalog.models.find((item) => item.id === model.selectedModelId)
  const builtin = providers.filter((item) => item.isBuiltin)
  return <aside className="sd-ai-assist" aria-label={t('prompts.assistTitle')}>
    <h3 className="sd-ai-assist__title">{t('prompts.assistTitle')}</h3>
    <div className="sd-ai-assist__form">
      <label className="sd-ai-assist__label">AI Provider<select className="sd-ai-assist__select" value={model.selectedProviderId} onChange={(event) => model.setSelectedProviderId(event.target.value as ProviderId)}>{(builtin.length ? builtin : providers).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="sd-ai-assist__model-row">
        <label className="sd-ai-assist__label">Model<select className="sd-ai-assist__select" value={model.selectedModelId} disabled={model.providerModelLoading || model.providerModelCatalog.providerId !== model.selectedProviderId} onChange={(event) => { model.setSelectedModelId(event.target.value); model.setSelectedEffort('default') }}>{model.providerModelCatalog.models.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
        <label className="sd-ai-assist__label">Effort<select className="sd-ai-assist__select" value={model.selectedEffort} disabled={!selectedModel?.efforts.length} onChange={(event) => model.setSelectedEffort(event.target.value)}><option value="default">{t('common.cliDefault')}</option>{selectedModel?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
      </div>
      <label className="sd-ai-assist__label">{t('prompts.assistInstruction')}<textarea className="sd-ai-assist__textarea" rows={5} value={instruction} onChange={(event) => setInstruction(event.target.value)} onPaste={handlePromptPaste} placeholder={t('prompts.assistPlaceholder')} /></label>
      <PromptImageAttachments
        attachments={imageAttachments}
        onRemove={(index) => setImageAttachments((prev) => prev.filter((_, i) => i !== index))}
        disabled={starting || Boolean(jobId)}
      />
    </div>
    <p>{t('prompts.assistNotice')}</p>
    <button type="button" className="sd-ai-assist__primary-btn" disabled={starting || Boolean(jobId) || !instruction.trim() || !providers.length} onClick={() => void start()}>{starting || jobId ? t('library.generatingDraft') : t('library.generateAiDraft')}</button>
    {error && <div className="sd-ai-assist__error" role="alert">{error}</div>}
    {draft && <div className="sd-ai-assist__draft-card" role="region" aria-label={t('library.aiDraftPreview')}><div className="sd-ai-assist__draft-head"><strong>{t('library.aiDraftPreview')}</strong><button type="button" className="sd-ai-assist__apply-btn" disabled={content !== source} onClick={() => { onApply(draft); setDraft('') }}>{t('library.applyToEditor')}</button></div>{content !== source && <p role="status">{t('prompts.assistStale')}</p>}<div className="sd-ai-assist__draft-body"><MarkdownAnalysisOutput markdown={draft} /></div></div>}
  </aside>
}
