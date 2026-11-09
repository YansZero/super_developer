import { useCallback, useEffect, useState } from 'react'
import type { ProviderId, ProviderSummary } from '../../shared/types/domain'
import { useI18n } from '../../shared/i18n'
import { useProviderModelSelection } from '../../shared/providers/useProviderModelSelection'
import { startPromptTranslation } from '../projects/detail/dispatchClient'
import { startTrackedDispatch } from '../projects/detail/dispatchJobStore'
import { PromptAssist } from './PromptAssist'
import { PromptsPreview } from './PromptsPreview'
import '../settings/rules/RulesSettingsPage.css'
import './PromptsPage.css'
import './PromptsPage.scss'

type Language = 'zhTW' | 'en' | 'es'
const languages: Language[] = ['zhTW', 'en', 'es']

export function PromptsPage({ providers }: { providers: ProviderSummary[] }) {
  const { t } = useI18n()
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [chosen, setChosen] = useState<Language[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const translationModel = useProviderModelSelection()
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState('')

  const request = async (url: string, init?: RequestInit) => {
    const res = await fetch(url, init)
    const data = await res.json()
    if (!res.ok || !data.ok) throw new Error(data.message || t('prompts.failed'))
    return data
  }
  const reload = useCallback(async () => {
    try {
      const response = await fetch('/api/prompts')
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.message)
      setFiles(data.files)
      return data.files as string[]
    } catch { setMessage(t('prompts.loadFailed')); return null }
  }, [t])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])
  const open = async (file: string) => {
    try {
      const data = await request(`/api/prompts/${encodeURIComponent(file)}`)
      setSelected(file); setName(file); setContent(data.content); setCreating(false); setEditing(false); setChosen([]); setOverwrite(false); setMessage('')
    } catch (error) { setMessage(error instanceof Error ? error.message : t('prompts.failed')) }
  }
  const refresh = async () => {
    setRefreshing(true)
    setMessage('')
    try {
      const updatedFiles = await reload()
      if (!updatedFiles) return
      if (selected && !editing) {
        if (updatedFiles.includes(selected)) await open(selected)
        else { setSelected(''); setContent(''); setMessage(t('prompts.removed')) }
      }
    } finally { setRefreshing(false) }
  }
  const saveFile = async (file: string, text: string, create: boolean) => request(`/api/prompts/${encodeURIComponent(file)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text, create }) })
  const save = async () => {
    const filename = name.endsWith('.md') ? name : `${name}.md`
    const base = filename.replace(/(?:_zhTW|_en|_es)?\.md$/, '')
    setBusy(true); setMessage('')
    const completed: string[] = []
    try {
      for (const language of chosen) {
        const target = `${base}_${language}.md`
        if (!overwrite && (target === filename || files.includes(target))) throw new Error(t('prompts.exists', { name: target }))
      }
      await saveFile(filename, content, creating)
      completed.push(filename)
      setSelected(filename); setName(filename); setCreating(false); setEditing(false)
      for (const language of chosen) {
        const target = `${base}_${language}.md`
        const start = await startTrackedDispatch({
          taskType: 'library-skill', projectId: 'library-prompt', projectPath: 'library/prompt', projectName: `Prompt: ${filename}`,
          providerId: translationModel.selectedProviderId, modelId: translationModel.selectedModelId, effort: translationModel.selectedEffort,
          branchName: null, prompt: content, jiraTicketTitle: `${t('prompts.translationJob')}: ${target}`,
        }, undefined, undefined, (input) => startPromptTranslation(input, filename, language))
        let result
        do {
          await new Promise((resolve) => setTimeout(resolve, 1500))
          result = await request(`/api/prompts/translation/${encodeURIComponent(start.id)}`)
        } while (result.job.status === 'queued' || result.job.status === 'running')
        if (result.job.status !== 'succeeded' || !result.job.content) throw new Error(result.job.error || t('prompts.translationFailed'))
        await saveFile(target, result.job.content, !(overwrite && (target === filename || files.includes(target))))
        if (target === filename) setContent(result.job.content)
        completed.push(target)
      }
      setChosen([]); setOverwrite(false); setMessage(t('prompts.saved', { files: completed.join(', ') }))
    } catch (error) {
      const reason = error instanceof Error ? error.message : t('prompts.failed')
      setMessage(completed.length ? `${t('prompts.saved', { files: completed.join(', ') })} ${reason}` : reason)
    }
    finally { await reload(); setBusy(false) }
  }
  return <div className="sd-rules-workspace" data-testid="prompts-page">
    <header className="sd-rules-workspace__header"><h1>{t('prompts.title')}</h1><p>{t('prompts.description')}</p></header>
    <section className="sd-rules-workspace__section">
      <div className="sd-rules-workspace__section-head"><div><h2>{t('prompts.title')}</h2><p>library/prompt</p></div><div className="sd-rules-workspace__actions"><button className="sd-rules-workspace__button" disabled={busy || refreshing} onClick={() => void refresh()}>{t('prompts.refresh')}</button><button className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={busy || refreshing} onClick={() => { setCreating(true); setEditing(true); setSelected(''); setName(''); setContent(''); setChosen([]); setOverwrite(false); setMessage('') }}>{t('prompts.create')}</button></div></div>
      {message && <div className="sd-rules-workspace__notice" role="status">{message}</div>}
      <div className={`sd-rules-workspace__grid sd-prompts-grid${editing ? ' sd-prompts-grid--editing' : ''}`}>
        <div className="sd-rules-workspace__list-pane"><header><h3>{t('prompts.files')}</h3><span>{files.length}</span></header><ul>{files.map((file) => <li key={file} className={selected === file ? 'is-selected' : ''}><button className="sd-rules-workspace__rule-select" disabled={busy || refreshing} onClick={() => void open(file)}><strong>{file}</strong></button></li>)}</ul></div>
        <div className="sd-rules-workspace__preview">
          {editing ? <><label className="sd-rules-workspace__direct-add-field">{t('prompts.filename')}<input value={name} disabled={!creating || busy} onChange={(event) => setName(event.target.value)} /></label><label className="sd-rules-workspace__direct-add-field">{t('prompts.content')}<textarea rows={16} value={content} disabled={busy} onChange={(event) => setContent(event.target.value)} /></label>
            <fieldset className="sd-rules-workspace__kind-picker sd-prompts-translation"><legend>{t('prompts.translate')}</legend>
              <div className="sd-prompts-translation__row"><div className="sd-prompts-translation__languages">{languages.map((language) => <label key={language}><input type="checkbox" disabled={busy} checked={chosen.includes(language)} onChange={(event) => setChosen(event.target.checked ? [...chosen, language] : chosen.filter((item) => item !== language))} />{t(`prompts.${language}`)}</label>)}</div><label><input type="checkbox" checked={overwrite} disabled={busy} onChange={(event) => setOverwrite(event.target.checked)} />{t('prompts.overwrite')}</label></div>
              <div className="sd-prompts-translation__models">
                <label className="sd-rules-workspace__direct-add-field">AI Provider<select value={translationModel.selectedProviderId} disabled={busy || !chosen.length} onChange={(event) => { translationModel.setSelectedProviderId(event.target.value as ProviderId); translationModel.setSelectedModelId('default'); translationModel.setSelectedEffort('default') }}>{providers.filter((item) => item.isBuiltin).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label className="sd-rules-workspace__direct-add-field">Model<select value={translationModel.selectedModelId} disabled={busy || !chosen.length || translationModel.providerModelLoading || translationModel.providerModelCatalog.providerId !== translationModel.selectedProviderId} onChange={(event) => { translationModel.setSelectedModelId(event.target.value); translationModel.setSelectedEffort('default') }}>{translationModel.providerModelCatalog.models.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
                <label className="sd-rules-workspace__direct-add-field">Effort<select value={translationModel.selectedEffort} disabled={busy || !chosen.length || !translationModel.providerModelCatalog.models.find((item) => item.id === translationModel.selectedModelId)?.efforts.length} onChange={(event) => translationModel.setSelectedEffort(event.target.value)}><option value="default">{t('common.cliDefault')}</option>{translationModel.providerModelCatalog.models.find((item) => item.id === translationModel.selectedModelId)?.efforts.map((effort) => <option key={effort} value={effort}>{effort}</option>)}</select></label>
              </div>
            </fieldset>
            <div className="sd-rules-workspace__actions"><button className="sd-rules-workspace__button sd-rules-workspace__button--primary" disabled={busy || refreshing || !name.trim() || !content.trim() || (chosen.length > 0 && (translationModel.providerModelLoading || translationModel.providerModelCatalog.providerId !== translationModel.selectedProviderId))} onClick={() => void save()}>{busy ? t('prompts.translating') : t('prompts.save')}</button><button className="sd-rules-workspace__button" disabled={busy || refreshing} onClick={() => selected ? void open(selected) : (setEditing(false), setCreating(false))}>{t('prompts.cancel')}</button></div></> : selected ? <><header><strong>{selected}</strong><button className="sd-rules-workspace__button" disabled={refreshing} onClick={() => setEditing(true)}>{t('prompts.edit')}</button></header><PromptsPreview content={content} /></> : <p>{t('prompts.select')}</p>}
        </div>
        {editing && <PromptAssist key={selected || 'new'} providers={providers} content={content} onApply={setContent} />}
      </div>
    </section>
  </div>
}
