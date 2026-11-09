import type { ThemeId } from '../../../shared/types/domain'
import { THEME_OPTIONS } from '../../../shared/data/fixtures'
import { THEME_STORAGE_KEY } from '../../../shared/theme/themeStorage'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import { SidebarNavIcon } from '../../../app/SidebarNavIcon'
import { useI18n } from '../../../shared/i18n'
import {
  MAX_RUNNING_ANIMALS,
  RUNNING_ANIMAL_BACKGROUNDS,
  RUNNING_ANIMALS,
  type RunningAnimalBackgroundId,
  type RunningAnimalId,
} from '../../../shared/appearance/runningAnimal'
import { RunningAnimal } from '../../../shared/components/RunningAnimal'
import './ThemeSettingsPage.css'

interface ThemeSettingsPageProps {
  runningAnimals: RunningAnimalId[]
  onSelectAnimals: (animals: RunningAnimalId[]) => void
  runningAnimalBackground: RunningAnimalBackgroundId
  onSelectAnimalBackground: (background: RunningAnimalBackgroundId) => void
  activeTheme: ThemeId
  onSelectTheme: (theme: ThemeId) => void
}

function ThemePreviewThumbnail({ themeId }: { themeId: ThemeId }) {
  return (
    <div className={`sd-theme__thumb sd-theme__thumb--${themeId}`} aria-hidden="true">
      <div className="sd-theme__thumb-sidebar">
        <span className="sd-theme__thumb-brand" />
        <span className="sd-theme__thumb-nav sd-theme__thumb-nav--active" />
        <span className="sd-theme__thumb-nav" />
        <span className="sd-theme__thumb-nav" />
        <span className="sd-theme__thumb-dot" />
      </div>
      <div className="sd-theme__thumb-canvas">
        <div className="sd-theme__thumb-topbar">
          <span className="sd-theme__thumb-title" />
          <span className="sd-theme__thumb-cta" />
        </div>
        <div className="sd-theme__thumb-cards">
          <div className="sd-theme__thumb-card">
            <span className="sd-theme__thumb-card-line" />
            <span className="sd-theme__thumb-bar sd-theme__thumb-bar--primary" />
            <span className="sd-theme__thumb-bar sd-theme__thumb-bar--secondary" />
          </div>
          <div className="sd-theme__thumb-card">
            <span className="sd-theme__thumb-card-line" />
            <span className="sd-theme__thumb-bar sd-theme__thumb-bar--primary" />
            <span className="sd-theme__thumb-bar sd-theme__thumb-bar--secondary" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function ThemeSettingsPage({
  runningAnimals,
  onSelectAnimals,
  runningAnimalBackground,
  onSelectAnimalBackground,
  activeTheme,
  onSelectTheme,
}: ThemeSettingsPageProps) {
  const { t } = useI18n()
  const isAtAnimalLimit = runningAnimals.length >= MAX_RUNNING_ANIMALS
  const toggleAnimal = (animal: RunningAnimalId) => {
    if (runningAnimals.includes(animal)) {
      onSelectAnimals(runningAnimals.filter((selected) => selected !== animal))
      return
    }
    if (!isAtAnimalLimit) onSelectAnimals([...runningAnimals, animal])
  }
  return (
    <section className="sd-theme" aria-label={t('theme.pageLabel')}>
      <header className="sd-theme__head">
        <div className="sd-theme__head-top">
          <div className="sd-theme__settings-label">
            <SidebarNavIcon kind="theme" />
            <h1 className="sd-theme__title">{t('theme.title')}</h1>
          </div>
        </div>
        <div className="sd-theme__head-row">
          <p className="sd-theme__subtitle">
            {t('theme.descriptionPrefix')}<code>localStorage</code>{t('theme.descriptionSuffix')}
            <code>{THEME_STORAGE_KEY}</code>）。
          </p>
        </div>
        <span className="sd-theme__sr-only" aria-live="polite">{t('theme.currentPrefix')}{activeTheme}</span>
      </header>

      <fieldset className="sd-theme__animals">
        <legend>{t('animals.title')}</legend>
        <p className="sd-theme__animals-description">{t('animals.description')}</p>
        <div className="sd-theme__animal-grid">
          {RUNNING_ANIMALS.map((animal) => (
            <label key={animal} className={`sd-theme__animal-option${runningAnimals.includes(animal) ? ' sd-theme__animal-option--active' : ''}`}>
              <RunningAnimal animal={animal} />
              <span>
                <input
                  type="checkbox"
                  name="running-animal"
                  value={animal}
                  checked={runningAnimals.includes(animal)}
                  disabled={
                    (runningAnimals.length === 1 && runningAnimals.includes(animal)) ||
                    (isAtAnimalLimit && !runningAnimals.includes(animal))
                  }
                  onChange={() => toggleAnimal(animal)}
                />
                {t(`animals.${animal}`)}
              </span>
            </label>
          ))}
        </div>
        <p className="sd-theme__animals-current" role="status">{t('animals.current', { animal: runningAnimals.map((animal) => t(`animals.${animal}`)).join('、') })}</p>
        <label className="sd-theme__animal-background">
          <span>{t('animals.backgroundTitle')}</span>
          <select value={runningAnimalBackground} onChange={(event) => onSelectAnimalBackground(event.target.value as RunningAnimalBackgroundId)}>
            {RUNNING_ANIMAL_BACKGROUNDS.map((background) => (
              <option key={background} value={background}>{t(`animals.background.${background}`)}</option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="sd-theme__grid" role="radiogroup" aria-label={t('theme.choose')}>
        {THEME_OPTIONS.map((item) => {
          const isSelected = item.id === activeTheme
          return (
            <article
              key={item.id}
              className={`sd-theme__card ${isSelected ? 'sd-theme__card--active' : ''}`}
            >
              <div className="sd-theme__card-top">
                <div className="sd-theme__name-group">
                  <span className="sd-theme__card-name">{t(item.name)}</span>
                  <StatusBadge
                    label={isSelected ? t('theme.active') : item.id}
                    tone={isSelected ? 'ok' : 'neutral'}
                    mono
                  />
                </div>
                <span
                  className={`sd-theme__radio-indicator ${isSelected ? 'sd-theme__radio-indicator--active' : ''}`}
                  aria-hidden="true"
                />
              </div>

              <ThemePreviewThumbnail themeId={item.id} />

              <p className="sd-theme__card-desc">{t(item.subtitle)}</p>
              <dl className="sd-theme__specs">
                <div className="sd-theme__spec-row">
                  <dt>{t('theme.palette')}</dt>
                  <dd>{t(item.paletteSummary)}</dd>
                </div>
                <div className="sd-theme__spec-row">
                  <dt>{t('theme.characteristics')}</dt>
                  <dd>{t(item.effectSummary)}</dd>
                </div>
              </dl>
              <button
                type="button"
                className={`sd-theme__apply-btn ${isSelected ? 'sd-theme__apply-btn--active' : ''}`}
                onClick={() => onSelectTheme(item.id)}
                aria-pressed={isSelected}
              >
                {isSelected ? `✓ ${t('theme.appliedPrefix')}${item.id}` : `${t('theme.switchToPrefix')}${item.id}`}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
