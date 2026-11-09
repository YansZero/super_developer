export const RUNNING_ANIMALS = ['mix', 'black', 'cat', 'siamese', 'dog', 'fox', 'rabbit'] as const
export type RunningAnimalId = typeof RUNNING_ANIMALS[number]
export const RUNNING_ANIMAL_STORAGE_KEY = 'super_developer.runningAnimal'
export const RUNNING_ANIMAL_BACKGROUND_STORAGE_KEY = 'super_developer.runningAnimalBackground'
export const MAX_RUNNING_ANIMALS = 5
export const RUNNING_ANIMAL_BACKGROUNDS = ['plain', 'meadow', 'sunset', 'night'] as const
export type RunningAnimalBackgroundId = typeof RUNNING_ANIMAL_BACKGROUNDS[number]

function normalizeRunningAnimals(value: unknown): RunningAnimalId[] {
  const values = Array.isArray(value) ? value : [value]
  const animals = values.filter((animal): animal is RunningAnimalId => RUNNING_ANIMALS.includes(animal as RunningAnimalId))
  return [...new Set(animals)].slice(0, MAX_RUNNING_ANIMALS)
}

export function loadRunningAnimals(): RunningAnimalId[] {
  try {
    const stored = window.localStorage.getItem(RUNNING_ANIMAL_STORAGE_KEY)
    if (!stored) return ['cat']
    try {
      const parsed = JSON.parse(stored) as unknown
      const animals = normalizeRunningAnimals(parsed)
      return animals.length > 0 ? animals : ['cat']
    } catch {
      const animals = normalizeRunningAnimals(stored)
      return animals.length > 0 ? animals : ['cat']
    }
  } catch {
    return ['cat']
  }
}

export function loadRunningAnimal(): RunningAnimalId {
  return loadRunningAnimals()[0]
}

export function storeRunningAnimal(animal: RunningAnimalId): void {
  storeRunningAnimals([animal])
}

export function storeRunningAnimals(animals: RunningAnimalId[]): void {
  try {
    const normalized = normalizeRunningAnimals(animals)
    window.localStorage.setItem(RUNNING_ANIMAL_STORAGE_KEY, JSON.stringify(normalized.length > 0 ? normalized : ['cat']))
  } catch {
    // Keep the selection usable for this session when storage is unavailable.
  }
}

export function loadRunningAnimalBackground(): RunningAnimalBackgroundId {
  try {
    const stored = window.localStorage.getItem(RUNNING_ANIMAL_BACKGROUND_STORAGE_KEY)
    return RUNNING_ANIMAL_BACKGROUNDS.find((background) => background === stored) ?? 'plain'
  } catch {
    return 'plain'
  }
}

export function storeRunningAnimalBackground(background: RunningAnimalBackgroundId): void {
  try {
    window.localStorage.setItem(RUNNING_ANIMAL_BACKGROUND_STORAGE_KEY, background)
  } catch {
    // Keep the selection usable for this session when storage is unavailable.
  }
}
