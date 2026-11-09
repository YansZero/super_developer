import { agentMessage } from './requestI18n.mjs'
import { resolveExecutableFile, runAllowlistedSubprocess } from './providerAdapter.mjs'

const DEFAULT_MODEL = Object.freeze({
  id: 'default',
  get label() { return agentMessage('agent.provider.cliDefault') },
  efforts: Object.freeze([]),
})

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra'])
const MODEL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,119}$/
const CODEX_CATALOG_MAX_LENGTH = 1024 * 1024
const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']

function createDefaultCatalog(providerId, message) {
  return {
    providerId,
    source: 'default',
    models: [{ ...DEFAULT_MODEL, efforts: [] }],
    message,
  }
}

export function parseAntigravityModelCatalog(output) {
  if (typeof output !== 'string' || output.length > 4096) return []

  const modelsById = new Map()
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s*([a-zA-Z0-9][a-zA-Z0-9._/-]{0,119})\s*(?:\t+|\s{2,}|:\s+)(.*?)\s*$/.exec(line)
    if (!match) continue

    const listedId = match[1]
    const label = match[2].slice(0, 160)
    if (!MODEL_ID_PATTERN.test(listedId) || !label) continue

    const effortMatch = /-(low|medium|high|xhigh|max|ultra)$/i.exec(listedId)
    const effort = effortMatch?.[1]?.toLowerCase()
    const modelId = effort ? listedId.slice(0, -effortMatch[0].length) : listedId
    if (!modelId || (effort && !EFFORTS.has(effort))) continue

    const baseLabel = effort
      ? label.replace(/\s*\((?:low|medium|high|xhigh|max|ultra)\)\s*$/i, '')
      : label
    const existing = modelsById.get(modelId) ?? {
      id: modelId,
      label: baseLabel,
      efforts: new Set(),
    }
    if (effort) existing.efforts.add(effort)
    modelsById.set(modelId, existing)
  }

  return [...modelsById.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((model) => ({
      id: model.id,
      label: model.label,
      efforts: EFFORT_ORDER.filter((effort) => model.efforts.has(effort)),
    }))
}

export function parseCodexModelCatalog(output) {
  if (typeof output !== 'string' || output.length === 0 || output.length > CODEX_CATALOG_MAX_LENGTH) {
    return []
  }

  let catalog
  try {
    catalog = JSON.parse(output)
  } catch {
    return []
  }
  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.models)) return []

  const modelsById = new Map()
  for (const item of catalog.models) {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof item.slug !== 'string' ||
      !MODEL_ID_PATTERN.test(item.slug) ||
      typeof item.display_name !== 'string' ||
      !item.display_name.trim() ||
      item.visibility !== 'list' ||
      item.supported_in_api !== true
    ) {
      continue
    }

    const efforts = Array.isArray(item.supported_reasoning_levels)
      ? item.supported_reasoning_levels
          .map((level) => level && typeof level === 'object' ? level.effort : null)
          .filter((effort) => typeof effort === 'string' && EFFORTS.has(effort))
      : []
    modelsById.set(item.slug, {
      id: item.slug,
      label: item.display_name.trim().slice(0, 160),
      efforts: EFFORT_ORDER.filter((effort) => efforts.includes(effort)),
    })
  }

  return [...modelsById.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function getProviderModelCatalog(provider, options = {}) {
  if (!provider || typeof provider.id !== 'string') {
    return createDefaultCatalog('unknown', agentMessage('agent.provider.catalogProviderNotFound'))
  }
  if (provider.id !== 'antigravity' && provider.id !== 'codex') {
    return createDefaultCatalog(
      provider.id,
      agentMessage('agent.provider.catalogCannotEnumerate'),
    )
  }

  const executable = resolveExecutableFile(provider.cliPath, options)
  if (!executable.ok) {
    const cliName = provider.id === 'codex' ? 'Codex' : 'Antigravity'
    return createDefaultCatalog(provider.id, agentMessage('agent.provider.catalogCannotEnumerateCli', { cliName }))
  }

  const operation = 'models'
  const args = provider.id === 'codex' ? ['debug', 'models'] : ['models']
  const result = runAllowlistedSubprocess(
    provider.id,
    operation,
    executable.resolvedPath,
    args,
    { ...options, timeoutMs: provider.id === 'codex' ? 10_000 : 5000 },
  )
  if (!result.ok || result.status !== 0) {
    return createDefaultCatalog(provider.id, agentMessage('agent.provider.catalogCannotGet'))
  }

  const models = provider.id === 'codex'
    ? parseCodexModelCatalog(result.stdoutText)
    : parseAntigravityModelCatalog(result.stdoutText)
  if (models.length === 0) {
    return createDefaultCatalog(provider.id, agentMessage('agent.provider.catalogNoModels'))
  }

  return {
    providerId: provider.id,
    source: 'cli',
    models: [{ ...DEFAULT_MODEL, efforts: [] }, ...models],
    message: provider.id === 'codex'
      ? agentMessage('agent.provider.catalogCodexNotice')
      : agentMessage('agent.provider.catalogAgyNotice'),
  }
}
