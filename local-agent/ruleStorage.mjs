import { agentMessage } from './requestI18n.mjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  MAX_RULES_COUNT,
  RULE_ERROR_CODES,
  isPlainObject,
  validateRuleContent,
  validateRuleCreateInput,
  validateRuleFileName,
  validateRuleApplicationInput,
  validateRuleIdParam,
  validateRuleHookEvents,
  validateRuleKind,
  validateRuleReorderInput,
  validateRuleUpdateInput,
} from './ruleContracts.mjs'

export function resolveDefaultRuleConfigPath(env = process.env) {
  const xdgConfigHome =
    typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim().startsWith('/')
      ? env.XDG_CONFIG_HOME.trim()
      : path.join(os.homedir(), '.config')
  return path.join(xdgConfigHome, 'super-developer', 'rules.config.json')
}

function createEmptyRulesDocument() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    rules: [],
  }
}

export function writeRuleFileAtomicallyRestricted(filePath, contentString) {
  const dirPath = path.dirname(filePath)
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 })
  try {
    fs.chmodSync(dirPath, 0o700)
  } catch {
    // Ignore chmod error on filesystems that do not support directory chmod
  }

  const randomSuffix = crypto.randomBytes(6).toString('hex')
  const tmpFilePath = `${filePath}.${process.pid}.${randomSuffix}.tmp`
  let fd
  try {
    fd = fs.openSync(tmpFilePath, 'wx', 0o600)
    fs.writeFileSync(fd, contentString, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.chmodSync(tmpFilePath, 0o600)
    fs.renameSync(tmpFilePath, filePath)
    fs.chmodSync(filePath, 0o600)
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        // Ignore close error
      }
    }
    if (fs.existsSync(tmpFilePath)) {
      try {
        fs.unlinkSync(tmpFilePath)
      } catch {
        // Ignore cleanup error
      }
    }
  }
}

function formatRuleLoadedAtLabel(isoString) {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return agentMessage('agent.rule.savedToLocalAgent')
  }
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return agentMessage('agent.rule.savedToLocalAgentTime', { time: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}` })
}

function toRuleRecord(persistedItem) {
  const updatedAt =
    typeof persistedItem.updatedAt === 'string'
      ? persistedItem.updatedAt
      : new Date().toISOString()
  return {
    id: persistedItem.id,
    fileName: persistedItem.fileName,
    extension: persistedItem.extension,
    sizeBytes: persistedItem.sizeBytes,
    content: persistedItem.content,
    enabled: Boolean(persistedItem.enabled),
    kind: persistedItem.kind || 'rule',
    hookEvents: Array.isArray(persistedItem.hookEvents) ? [...persistedItem.hookEvents] : [],
    appliedProviderIds: Array.isArray(persistedItem.appliedProviderIds) ? [...persistedItem.appliedProviderIds] : [],
    installedHookProviderIds: Array.isArray(persistedItem.installedHookProviderIds) ? [...persistedItem.installedHookProviderIds] : [],
    updatedAt,
    loadedAtLabel: formatRuleLoadedAtLabel(updatedAt),
  }
}

export function createRuleStorage(options = {}) {
  const configFilePath = options.configFilePath || resolveDefaultRuleConfigPath()

  function readStorageDocument() {
    if (!fs.existsSync(configFilePath)) {
      return createEmptyRulesDocument()
    }
    try {
      const rawText = fs.readFileSync(configFilePath, 'utf8')
      const parsed = JSON.parse(rawText)
      if (!isPlainObject(parsed) || !Array.isArray(parsed.rules)) {
        return createEmptyRulesDocument()
      }

      const validRules = []
      const seenIds = new Set()
      for (const item of parsed.rules.slice(0, MAX_RULES_COUNT)) {
        if (!isPlainObject(item)) continue
        const idCheck = validateRuleIdParam(item.id)
        const nameCheck = validateRuleFileName(item.fileName)
        const contentCheck = validateRuleContent(item.content)
        const kindCheck = validateRuleKind(item.kind)
        const hookEventsCheck = validateRuleHookEvents(item.hookEvents, kindCheck.ok ? kindCheck.value : 'rule')
        if (!idCheck.ok || !nameCheck.ok || !contentCheck.ok || !kindCheck.ok || !hookEventsCheck.ok) continue
        if (seenIds.has(idCheck.value)) continue
        seenIds.add(idCheck.value)
        validRules.push({
          id: idCheck.value,
          fileName: nameCheck.value,
          extension: nameCheck.extension,
          sizeBytes: contentCheck.sizeBytes,
          content: contentCheck.value,
          enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
          kind: kindCheck.value,
          hookEvents: hookEventsCheck.value,
          appliedProviderIds: Array.isArray(item.appliedProviderIds) ? item.appliedProviderIds.filter((id) => typeof id === 'string') : [],
          installedHookProviderIds: Array.isArray(item.installedHookProviderIds) ? item.installedHookProviderIds.filter((id) => typeof id === 'string') : [],
          updatedAt:
            typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
        })
      }

      return {
        version: 1,
        updatedAt:
          typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        rules: validRules,
      }
    } catch {
      return createEmptyRulesDocument()
    }
  }

  function persistStorageDocument(doc) {
    const nextDoc = {
      version: 1,
      updatedAt: new Date().toISOString(),
      rules: doc.rules || [],
    }
    writeRuleFileAtomicallyRestricted(configFilePath, `${JSON.stringify(nextDoc, null, 2)}\n`)
    return nextDoc
  }

  function listRules() {
    const doc = readStorageDocument()
    return doc.rules.map(toRuleRecord)
  }

  function getRuleById(ruleId) {
    const idCheck = validateRuleIdParam(ruleId)
    if (!idCheck.ok) {
      return null
    }
    const all = listRules()
    return all.find((item) => item.id === idCheck.value) || null
  }

  function addRule(rawInput) {
    const createCheck = validateRuleCreateInput(rawInput)
    if (!createCheck.ok) {
      return createCheck
    }

    const doc = readStorageDocument()
    if (doc.rules.length >= MAX_RULES_COUNT) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.RULE_MAX_COUNT_EXCEEDED,
        message: agentMessage('agent.rule.ruleLimitReachedMax', { max: MAX_RULES_COUNT }),
      }
    }

    const slugBase =
      createCheck.value.fileName
        .toLowerCase()
        .replace(/\.(md|txt)$/i, '')
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'doc'
    const uniqueSuffix = crypto.randomBytes(4).toString('hex')
    const newId = `rule-${slugBase}-${uniqueSuffix}`
    const nowIso = new Date().toISOString()

    const newItem = {
      id: newId,
      fileName: createCheck.value.fileName,
      extension: createCheck.value.extension,
      sizeBytes: createCheck.value.sizeBytes,
      content: createCheck.value.content,
      enabled: createCheck.value.enabled,
      kind: createCheck.value.kind,
      hookEvents: createCheck.value.hookEvents,
      appliedProviderIds: [],
      installedHookProviderIds: [],
      updatedAt: nowIso,
    }

    doc.rules.push(newItem)
    persistStorageDocument(doc)

    const all = doc.rules.map(toRuleRecord)
    const created = all.find((r) => r.id === newId)
    return {
      ok: true,
      rule: created,
      rules: all,
    }
  }

  function updateRule(ruleId, rawInput) {
    const idCheck = validateRuleIdParam(ruleId)
    if (!idCheck.ok) {
      return idCheck
    }
    const updateCheck = validateRuleUpdateInput(rawInput)
    if (!updateCheck.ok) {
      return updateCheck
    }

    const doc = readStorageDocument()
    const index = doc.rules.findIndex((r) => r.id === idCheck.value)
    if (index === -1) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: agentMessage('agent.rule.notFound'),
      }
    }

    const existing = doc.rules[index]
    const updatedItem = {
      ...existing,
      ...(updateCheck.value.enabled !== undefined
        ? { enabled: updateCheck.value.enabled }
        : {}),
      ...(updateCheck.value.fileName !== undefined
        ? {
            fileName: updateCheck.value.fileName,
            extension: updateCheck.value.extension,
          }
        : {}),
      ...(updateCheck.value.content !== undefined
        ? {
            content: updateCheck.value.content,
            sizeBytes: updateCheck.value.sizeBytes,
          }
        : {}),
      updatedAt: new Date().toISOString(),
    }
    if (updateCheck.value.kind !== undefined) {
      updatedItem.kind = updateCheck.value.kind
      updatedItem.hookEvents = updateCheck.value.kind === 'hook' ? (updateCheck.value.hookEvents ?? existing.hookEvents) : []
      if (updateCheck.value.kind !== 'hook') updatedItem.installedHookProviderIds = []
    } else if (updateCheck.value.hookEvents !== undefined) {
      updatedItem.hookEvents = updateCheck.value.hookEvents
    }

    doc.rules[index] = updatedItem
    persistStorageDocument(doc)

    const all = doc.rules.map(toRuleRecord)
    const updated = all.find((r) => r.id === idCheck.value)
    return {
      ok: true,
      rule: updated,
      rules: all,
    }
  }

  function reorderRules(rawInput) {
    const reorderCheck = validateRuleReorderInput(rawInput)
    if (!reorderCheck.ok) {
      return reorderCheck
    }

    const doc = readStorageDocument()
    if (reorderCheck.value.mode === 'orderedIds') {
      const { orderedIds } = reorderCheck.value
      if (orderedIds.length !== doc.rules.length) {
        return {
          ok: false,
          errorCode: RULE_ERROR_CODES.INVALID_RULE_REORDER,
          message: agentMessage('agent.rule.orderLengthMismatch'),
        }
      }
      const byId = new Map(doc.rules.map((r) => [r.id, r]))
      const nextRules = []
      for (const id of orderedIds) {
        const found = byId.get(id)
        if (!found) {
          return {
            ok: false,
            errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
            message: agentMessage('agent.rule.orderNonExistentId'),
          }
        }
        nextRules.push(found)
      }
      doc.rules = nextRules
      persistStorageDocument(doc)
      return {
        ok: true,
        rules: doc.rules.map(toRuleRecord),
      }
    }

    const { ruleId, direction } = reorderCheck.value
    const currentIndex = doc.rules.findIndex((r) => r.id === ruleId)
    if (currentIndex === -1) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: agentMessage('agent.rule.notFound'),
      }
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    if (targetIndex >= 0 && targetIndex < doc.rules.length) {
      const current = doc.rules[currentIndex]
      doc.rules[currentIndex] = doc.rules[targetIndex]
      doc.rules[targetIndex] = current
      persistStorageDocument(doc)
    }

    return {
      ok: true,
      rules: doc.rules.map(toRuleRecord),
    }
  }

  function removeRule(ruleId) {
    const idCheck = validateRuleIdParam(ruleId)
    if (!idCheck.ok) {
      return idCheck
    }

    const doc = readStorageDocument()
    const index = doc.rules.findIndex((r) => r.id === idCheck.value)
    if (index === -1) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: agentMessage('agent.rule.notFound'),
      }
    }

    doc.rules.splice(index, 1)
    persistStorageDocument(doc)

    return {
      ok: true,
      removedId: idCheck.value,
      rules: doc.rules.map(toRuleRecord),
    }
  }

  function getRuleApplication(ruleId, providerId) {
    const applicationCheck = validateRuleApplicationInput({ providerId, action: 'apply' })
    if (!applicationCheck.ok) return applicationCheck
    const rule = getRuleById(ruleId)
    if (!rule) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: agentMessage('agent.rule.notFound'),
      }
    }
    const checkedProviderId = applicationCheck.value.providerId
    const applied = rule.appliedProviderIds.includes(checkedProviderId)
    const hookInstalled = rule.installedHookProviderIds.includes(checkedProviderId)
    return {
      ok: true,
      rule,
      application: {
        ruleId,
        providerId: checkedProviderId,
        applied,
        hookInstalled,
        effective: rule.enabled && (rule.kind === 'hook' ? hookInstalled : applied),
      },
    }
  }

  function applyRule(ruleId, rawInput) {
    const idCheck = validateRuleIdParam(ruleId)
    if (!idCheck.ok) return idCheck
    const applicationCheck = validateRuleApplicationInput(rawInput)
    if (!applicationCheck.ok) return applicationCheck

    const doc = readStorageDocument()
    const index = doc.rules.findIndex((item) => item.id === idCheck.value)
    if (index === -1) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.RULE_NOT_FOUND,
        message: agentMessage('agent.rule.notFound'),
      }
    }

    const existing = doc.rules[index]
    const { providerId, action } = applicationCheck.value
    if (action === 'install-hook' && existing.kind !== 'hook') {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.INVALID_RULE_APPLICATION,
        message: agentMessage('agent.rule.onlyHookCanInstallToHook'),
      }
    }
    const next = {
      ...existing,
      appliedProviderIds: [...new Set(existing.appliedProviderIds || [])],
      installedHookProviderIds: [...new Set(existing.installedHookProviderIds || [])],
      updatedAt: new Date().toISOString(),
    }
    if (action === 'apply') next.appliedProviderIds = [...new Set([...next.appliedProviderIds, providerId])]
    if (action === 'install-hook') {
      next.installedHookProviderIds = [...new Set([...next.installedHookProviderIds, providerId])]
      next.appliedProviderIds = [...new Set([...next.appliedProviderIds, providerId])]
    }
    doc.rules[index] = next
    persistStorageDocument(doc)
    const updated = toRuleRecord(next)
    return {
      ok: true,
      rule: updated,
      application: {
        ruleId,
        providerId,
        applied: updated.appliedProviderIds.includes(providerId),
        hookInstalled: updated.installedHookProviderIds.includes(providerId),
        effective: updated.enabled && (updated.kind === 'hook' ? updated.installedHookProviderIds.includes(providerId) : updated.appliedProviderIds.includes(providerId)),
      },
    }
  }

  function getEffectiveRules(providerId) {
    return listRules().filter((rule) => {
      if (!rule.enabled) return false
      return rule.kind === 'hook'
        ? rule.installedHookProviderIds.includes(providerId)
        : rule.appliedProviderIds.includes(providerId)
    })
  }

  return {
    configFilePath,
    listRules,
    getRuleById,
    addRule,
    updateRule,
    reorderRules,
    removeRule,
    getRuleApplication,
    applyRule,
    getEffectiveRules,
  }
}
