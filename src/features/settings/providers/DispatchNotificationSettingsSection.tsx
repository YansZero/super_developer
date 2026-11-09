import { useState } from 'react'
import { useI18n } from '../../../shared/i18n'
import { saveDispatchNotificationSettings, type DispatchNotificationSettings } from '../../ai-work-center/dispatchNotificationSettings'

export function DispatchNotificationSettingsSection({ settings, onSave }: {
  settings: DispatchNotificationSettings | null
  onSave: (settings: DispatchNotificationSettings) => void
}) {
  const { t } = useI18n()
  const [edits, setEdits] = useState<DispatchNotificationSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<'saved' | 'saveFailed' | null>(null)
  const draft = edits ?? settings
  const desktopAvailable = typeof Notification !== 'undefined' && window.isSecureContext

  const change = (option: keyof DispatchNotificationSettings, enabled: boolean) => {
    if (!draft) return
    setEdits({ ...draft, [option]: enabled })
    setFeedback(null)
  }

  const save = async () => {
    if (!draft || saving) return
    setSaving(true)
    setFeedback(null)
    try {
      if (draft.desktop && desktopAvailable && Notification.permission === 'default') {
        try { await Notification.requestPermission() } catch { /* The browser can still block delivery. */ }
      }
      await saveDispatchNotificationSettings(draft)
      onSave(draft)
      setEdits(null)
      setFeedback('saved')
    } catch {
      setFeedback('saveFailed')
    } finally {
      setSaving(false)
    }
  }

  return <section className="sd-provider-workspace__section" aria-labelledby="sd-dispatch-notification-settings">
    <header className="sd-provider-workspace__section-head">
      <h2 id="sd-dispatch-notification-settings">{t('aiWork.notifications.title')}</h2>
    </header>
    <div className="sd-provider-workspace__notification-settings">
      <label className="sd-provider-workspace__notification-option">
        <input type="checkbox" checked={draft?.inApp ?? false} disabled={!draft || saving} onChange={(event) => change('inApp', event.target.checked)} />
        {t('aiWork.notifications.enable')}
      </label>
      <label className="sd-provider-workspace__notification-option">
        <input type="checkbox" checked={draft?.desktop ?? false} disabled={!draft || saving} onChange={(event) => change('desktop', event.target.checked)} />
        {t('aiWork.notifications.desktop')}
      </label>
      <p>{t('aiWork.notifications.desktopDescription')}</p>
      {draft?.desktop && (!desktopAvailable || Notification.permission !== 'granted')
        ? <p role="status">{t(desktopAvailable ? 'aiWork.notifications.permissionNeeded' : 'aiWork.notifications.desktopUnavailable')}</p>
        : null}
      <div className="sd-provider-workspace__actions">
        <button type="button" className="sd-provider-workspace__button sd-provider-workspace__button--primary" disabled={!draft || saving} onClick={() => void save()}>
          {t(saving ? 'common.saving' : 'common.saveSettings')}
        </button>
        {feedback ? <span role={feedback === 'saveFailed' ? 'alert' : 'status'}>{t(`aiWork.notifications.${feedback}`)}</span> : null}
      </div>
    </div>
  </section>
}
