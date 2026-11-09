import { useEffect, useState, type CSSProperties } from 'react'
import type { RunningAnimalBackgroundId, RunningAnimalId } from '../../../shared/appearance/runningAnimal'
import { RunningAnimal } from '../../../shared/components/RunningAnimal'
import { useI18n } from '../../../shared/i18n'
import {
  formatSystemTime,
  getGreetingConfig,
  getGreetingPeriod,
} from './greetingHelpers'

function getAnimalMotion(animal: RunningAnimalId, index: number) {
  const seed = [...animal].reduce((total, character) => total + character.charCodeAt(0), index * 17)
  const baseDuration = 10 + (seed % 7)
  const slowdown = 1.5 + ((seed % 14) * 0.1)
  return {
    duration: `${Math.round(baseDuration * slowdown)}s`,
    delay: `${-((seed % 16) / 2)}s`,
  }
}

export interface GreetingBannerProps {
  currentTime?: Date
  animals?: RunningAnimalId[]
  animal?: RunningAnimalId
  background?: RunningAnimalBackgroundId
}

export function GreetingBanner({ currentTime, animals, animal = 'cat', background = 'plain' }: GreetingBannerProps) {
  const { t } = useI18n()
  const [internalTime, setInternalTime] = useState(() => new Date())
  const [animalPaused, setAnimalPaused] = useState(false)
  const selectedAnimals = animals?.length ? animals.slice(0, 5) : [animal]
  const animalLabel = selectedAnimals.map((selected) => t(`animals.${selected}`)).join('、')
  const animalMotions = selectedAnimals.map(getAnimalMotion)

  useEffect(() => {
    if (currentTime) return

    const timer = setInterval(() => {
      setInternalTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [currentTime])

  const activeDate = currentTime ?? internalTime
  const period = getGreetingPeriod(activeDate.getHours())
  const config = getGreetingConfig(period)
  const formattedTime = formatSystemTime(activeDate)

  return (
    <aside
      className={`sd-overview__greeting-banner sd-overview__greeting-banner--${config.period}`}
      aria-label={t('overview.greeting.systemTime')}
    >
      <div className="sd-overview__greeting-content">
        <span className="sd-overview__greeting-icon" aria-hidden="true">
          {config.icon}
        </span>
        <div className="sd-overview__greeting-text">
          <strong className="sd-overview__greeting-title">{t(config.titleKey)}</strong>
          <p className="sd-overview__greeting-message">{t(config.messageKey)}</p>
        </div>
      </div>
      <button
        type="button"
        className={`sd-overview__animal-track sd-overview__animal-track--${background}`}
        aria-label={t('overview.greeting.pauseAnimal', { animal: animalLabel })}
        aria-pressed={animalPaused}
        title={t(animalPaused ? 'overview.greeting.resumeAnimal' : 'overview.greeting.pauseAnimal', { animal: animalLabel })}
        onClick={() => setAnimalPaused((paused) => !paused)}
      >
        <span className={`sd-overview__animal-travel sd-overview__animal-travel--count-${selectedAnimals.length}`}>
          {selectedAnimals.map((selectedAnimal, index) => (
            <span
              className="sd-overview__animal-direction"
              key={`${selectedAnimal}-${index}`}
              style={{
                '--animal-duration': animalMotions[index].duration,
                '--animal-delay': animalMotions[index].delay,
              } as CSSProperties}
            >
              <span className="sd-overview__animal-facing">
                <RunningAnimal animal={selectedAnimal} animated />
              </span>
            </span>
          ))}
        </span>
      </button>
      <div className="sd-overview__greeting-clock">
        <span className="sd-overview__clock-label">{t('overview.greeting.systemTime')}</span>
        <time className="sd-overview__clock-time" dateTime={activeDate.toISOString()}>
          {formattedTime}
        </time>
      </div>
    </aside>
  )
}
