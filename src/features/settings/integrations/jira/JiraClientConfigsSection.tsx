import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createJiraClientConfigClient, JiraClientConfigError } from '../../../jira/jiraClientConfigClient'
import type { JiraClientConfigSummary } from '../../../jira/jiraClientConfigClient'
import './JiraClientConfigsSection.css'
import { useI18n } from '../../../../shared/i18n'

const client = createJiraClientConfigClient()

export function JiraClientConfigsSection() {
  const { t } = useI18n()
  const [clients, setClients] = useState<JiraClientConfigSummary[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const savingRef = useRef(false)
  const removingRef = useRef(false)
  const listRequest = useRef(0)
  const mutationVersion = useRef(0)
  const lifecycle = useRef<AbortController | null>(null)

  const reload = useCallback(() => {
    const request = ++listRequest.current
    const version = mutationVersion.current
    const signal = lifecycle.current?.signal
    return client.list().then((result) => {
      if (!signal?.aborted && request === listRequest.current && version === mutationVersion.current) {
        setClients(result)
        setMessage('')
      }
    }).catch((error: unknown) => {
      if (!signal?.aborted && request === listRequest.current && version === mutationVersion.current) {
        setMessage(error instanceof JiraClientConfigError && error.status === 401
          ? t('common.jiraIsNotSignedInOauthAppSettingsCanStillBeSaved')
          : t('common.unableToLoadOauthAppsConfirmTheBffIsRunning'))
      }
    }).finally(() => {
      if (!signal?.aborted && request === listRequest.current) setLoading(false)
    })
  }, [t])

  useEffect(() => {
    const controller = new AbortController()
    lifecycle.current = controller
    void reload()
    return () => controller.abort()
  }, [reload])

  function resetForm() {
    setEditingKey(null)
    setLabel('')
    setClientId('')
    setClientSecret('')
  }

  function beginEdit(item: JiraClientConfigSummary) {
    setEditingKey(item.key)
    setLabel(item.label)
    setClientId(item.clientId)
    setClientSecret('')
    setMessage(t('common.savingEditsSignsThisAppOutOfItsCurrentJiraSiteLeaveSecretBlankToKeepTheExistingValue'))
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setMessage('')
    try {
      if (editingKey) {
        const updated = await client.update(editingKey, { label, clientId, clientSecret })
        mutationVersion.current++
        setClients((current) => current.map((item) => item.key === editingKey ? updated : item))
        resetForm()
        setMessage(t('common.changesSavedAndTheAppWasSignedOutOfItsJiraSiteSignInAgainToTest'))
      } else {
        const created = await client.create({ label, clientId, clientSecret })
        mutationVersion.current++
        setClients((current) => [...current.filter((item) => item.key !== created.key), created])
        resetForm()
        setMessage(t('common.jiraOauthAppSavedUseTheRowSignInButtonToTestIt'))
      }
    } catch {
      setMessage(editingKey ? t('common.editFailedConfirmTheNameAndClientIdAreFilledIn') : t('common.createFailedConfirmTheNameClientIdAndClientSecretAreFilledIn'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function removeClient(key: string) {
    if (removingRef.current) return
    if (deletingKey !== key) {
      setDeletingKey(key)
      return
    }
    removingRef.current = true
    setRemoving(true)
    try {
      await client.remove(key)
      mutationVersion.current++
      setClients((current) => current.filter((item) => item.key !== key))
      if (editingKey === key) resetForm()
      setMessage(t('common.jiraOauthAppDeletedAndSignedOutOfItsJiraSite'))
    } catch {
      setMessage(t('common.deleteFailedCheckTheBffStatusAgain'))
    } finally {
      setDeletingKey(null)
      removingRef.current = false
      setRemoving(false)
    }
  }

  return <article className="sd-jira-client-configs" aria-label={t('common.multipleJiraOauthClients')}>
    <div className="sd-jira-client-configs__head">
      <div className="sd-jira-client-configs__heading">
        <span className="sd-integrations__step-number" aria-hidden="true">1</span>
        <div>
          <span className="sd-integrations__step-label">{t('common.step1')}</span>
          <h3>{t('common.jiraOauthApplication')}</h3>
        <p>{t('common.saveTheClientIdSecretFirstThenTestSignInPerRowTheSecretIsEncryptedByTheBffAndNeverReturnedToTheBrowser')}</p>
        </div>
      </div>
      <button type="button" onClick={() => { setLoading(true); void reload() }} disabled={loading}>{t('common.reloadAlt')}</button>
    </div>
    {message && <p role="status">{message}</p>}
    {clients.length === 0 && !loading && <p role="status">{t('common.noOauthAppsSavedFillInAndSaveTheSettingsBelow')}</p>}
    <ul className="sd-jira-client-configs__list">
      {clients.map((item) => <li key={item.key}>
        <div className="sd-jira-client-configs__identity">
          <div><strong>{item.label}</strong><small>{t('integration.clientId')}：<code>{item.clientId}</code></small></div>
        </div>
        <div className="sd-jira-client-configs__actions">
          <a href={`/auth/jira/login?client=${encodeURIComponent(item.key)}`}>{t('common.signInWithThisApp')}</a>
          {item.key.startsWith('db-') && <>
            <button
              type="button"
              className="sd-jira-client-configs__icon-button sd-jira-client-configs__edit"
              aria-label={`${t('common.edit')} ${item.label}`}
              title={`${t('common.edit')} ${item.label}`}
              disabled={saving || removing}
              onClick={() => beginEdit(item)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
                <path d="m4 13.8-.7 2.9 2.9-.7L15.8 6.4a1.8 1.8 0 0 0-2.5-2.5L4 13.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="m12.1 4.7 3.2 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`sd-jira-client-configs__icon-button sd-jira-client-configs__delete ${deletingKey === item.key ? 'sd-jira-client-configs__delete--confirm' : ''}`}
              aria-label={`${t(deletingKey === item.key ? 'common.confirmDelete' : 'common.delete')} ${item.label}`}
              title={`${t(deletingKey === item.key ? 'common.confirmDelete' : 'common.delete')} ${item.label}`}
              disabled={saving || removing}
              onClick={() => void removeClient(item.key)}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
                <path d="M4 6h12M8 6V4h4v2m3 0-.7 10H5.7L5 6m2.5 3v4m5-4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>}
        </div>
      </li>)}
    </ul>
    <form className="sd-jira-client-configs__form" onSubmit={(event) => void saveClient(event)}>
      <div className="sd-jira-client-configs__form-head">
        <strong>{editingKey ? t('common.editOauthApp') : t('common.addOauthApp')}</strong>
        {editingKey && <button type="button" onClick={resetForm} disabled={saving}>{t('common.cancelEdit')}</button>}
      </div>
      <label>{t('common.displayName')}<input value={label} onChange={(event) => setLabel(event.target.value)} required disabled={saving} /></label>
      <label>{t('integration.clientId')}<input value={clientId} onChange={(event) => setClientId(event.target.value)} required disabled={saving} /></label>
      <label>{t('integration.clientSecret')}<input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} required={!editingKey} autoComplete="new-password" disabled={saving} placeholder={editingKey ? t('common.leaveBlankToKeepCurrentValue') : undefined} /></label>
      <button type="submit" disabled={saving || removing}>{editingKey ? t('common.saveChangesAndSignOutOfThisSite') : t('common.saveOauthApp')}</button>
    </form>
  </article>
}
