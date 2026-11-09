import { useState, type FormEvent } from 'react'
import type { CustomProviderCreatePayload } from '../../../shared/types/domain'
import { validateClientProviderInput } from './providerClient'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { useI18n } from '../../../shared/i18n'

export function CustomProviderForm({ onCreate }: { onCreate?: (payload: CustomProviderCreatePayload) => Promise<boolean> }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateClientProviderInput(name, path)
    if (validationError) return setError(validationError)
    if (!onCreate) return

    setBusy(true)
    setError(null)
    try {
      if (await onCreate({ name: name.trim(), cliPath: path.trim(), ...(command.trim() ? { cliCommand: command.trim() } : {}) })) {
        setName('')
        setCommand('')
        setPath('')
      }
    } finally {
      setBusy(false)
    }
  }

  return <form className="sd-providers__add-card" onSubmit={(event) => void submit(event)} aria-label={t('common.addCustomCliProviderForm')}>
    <div className="sd-providers__card-head"><div><h2 className="sd-providers__card-title">＋ {t('common.addCustomCliProviderAlt')}</h2><p className="sd-providers__demo-note">{t('common.addAnyLocalAiCliToolTheSystemVerifiesFileExistenceExecutablePermissionAndReadOnly')}<code>--version</code>{t('common.versionOutputAndNeverGuessesOrAutomaticallyRunsUnknownAuthenticationCommands')}</p></div><StatusBadge label={t('common.persistedInLocalSettings')} tone="neutral" /></div>
    <div className="sd-providers__edit-grid">
      <div className="sd-providers__field"><label className="sd-providers__label" htmlFor="sd-new-provider-name">{t('common.customProviderName')}</label><input id="sd-new-provider-name" type="text" className="sd-providers__input" placeholder={t('common.exampleCustomAiderCli')} value={name} maxLength={64} onChange={(event) => { setName(event.target.value); setError(null) }} /></div>
      <div className="sd-providers__field"><label className="sd-providers__label" htmlFor="sd-new-provider-cmd">{t('common.commandAliasOptional')}</label><input id="sd-new-provider-cmd" type="text" className="sd-providers__input" placeholder={t('common.exampleAiderAlt')} value={command} maxLength={32} onChange={(event) => { setCommand(event.target.value); setError(null) }} /></div>
      <div className="sd-providers__field sd-providers__field--path"><label className="sd-providers__label" htmlFor="sd-new-provider-path">{t('common.cliExecutablePathOrCommand')}</label><input id="sd-new-provider-path" type="text" className="sd-providers__input" placeholder={t('common.exampleUsrLocalBinAiderOrAider')} value={path} maxLength={512} onChange={(event) => { setPath(event.target.value); setError(null) }} /></div>
    </div>
    {error ? <div className="sd-providers__inline-error" role="alert">{error}</div> : null}
    <div className="sd-providers__actions"><button type="submit" className="sd-providers__btn sd-providers__btn--primary" disabled={busy}>{busy ? t('common.adding') : `＋ ${t('common.addAndSaveCustomProvider')}`}</button></div>
  </form>
}
