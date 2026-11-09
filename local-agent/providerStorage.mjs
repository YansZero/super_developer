import { agentMessage } from './requestI18n.mjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  BUILTIN_PROVIDER_DESCRIPTORS,
  MAX_CUSTOM_PROVIDERS,
  createUnprobedProviderRecord,
  isPlainObject,
  validateCustomProviderCreateInput,
  validateExecutablePathSyntax,
  validateProviderConfigUpdateInput,
  validateProviderIdParam,
  validateProviderName,
} from './providerContracts.mjs'

export function resolveDefaultProviderConfigPath(env = process.env) {
  const xdgConfigHome =
    typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim().startsWith('/')
      ? env.XDG_CONFIG_HOME.trim()
      : path.join(os.homedir(), '.config')
  return path.join(xdgConfigHome, 'super-developer', 'providers.config.json')
}

function createEmptyStorageDocument() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    builtinOverrides: {},
    customProviders: [],
    probeSnapshots: {},
  }
}

function sanitizePersistedProbeSnapshot(rawSnapshot, expectedCliPath) {
  if (!isPlainObject(rawSnapshot)) {
    return null
  }
  if (rawSnapshot.cliPath !== expectedCliPath) {
    return null
  }
  const statusKind =
    rawSnapshot.statusKind === 'normal' ||
    rawSnapshot.statusKind === 'missing' ||
    rawSnapshot.statusKind === 'unknown'
      ? rawSnapshot.statusKind
      : 'unknown'

  return {
    cliPath: expectedCliPath,
    statusKind,
    statusText:
      typeof rawSnapshot.statusText === 'string'
        ? rawSnapshot.statusText.slice(0, 160)
        : agentMessage('agent.provider.uninspectedClickToTest'),
    cliStatus:
      typeof rawSnapshot.cliStatus === 'string' ? rawSnapshot.cliStatus.slice(0, 48) : 'unprobed',
    authStatus:
      typeof rawSnapshot.authStatus === 'string' ? rawSnapshot.authStatus.slice(0, 48) : 'unknown',
    version:
      typeof rawSnapshot.version === 'string' ? rawSnapshot.version.slice(0, 48) : null,
    checkedAt:
      typeof rawSnapshot.checkedAt === 'string' ? rawSnapshot.checkedAt.slice(0, 64) : null,
    errorCode:
      typeof rawSnapshot.errorCode === 'string' ? rawSnapshot.errorCode.slice(0, 64) : null,
    errorMessage:
      typeof rawSnapshot.errorMessage === 'string' ? rawSnapshot.errorMessage.slice(0, 240) : null,
  }
}

export function writeFileAtomicallyRestricted(filePath, contentString) {
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

export function createProviderStorage(options = {}) {
  const configFilePath = options.configFilePath || resolveDefaultProviderConfigPath()

  function readStorageDocument() {
    if (!fs.existsSync(configFilePath)) {
      return createEmptyStorageDocument()
    }
    try {
      const rawText = fs.readFileSync(configFilePath, 'utf8')
      const parsed = JSON.parse(rawText)
      if (!isPlainObject(parsed)) {
        return createEmptyStorageDocument()
      }

      const builtinOverrides = {}
      if (isPlainObject(parsed.builtinOverrides)) {
        for (const descriptor of BUILTIN_PROVIDER_DESCRIPTORS) {
          const entry = parsed.builtinOverrides[descriptor.id]
          if (isPlainObject(entry)) {
            const pathCheck = validateExecutablePathSyntax(entry.cliPath)
            const nameCheck =
              entry.name !== undefined ? validateProviderName(entry.name) : { ok: false }
            if (pathCheck.ok) {
              builtinOverrides[descriptor.id] = {
                cliPath: pathCheck.value,
                ...(nameCheck.ok ? { name: nameCheck.value } : {}),
              }
            }
          }
        }
      }

      const customProviders = []
      if (Array.isArray(parsed.customProviders)) {
        for (const item of parsed.customProviders.slice(0, MAX_CUSTOM_PROVIDERS)) {
          if (!isPlainObject(item)) continue
          const idCheck = validateProviderIdParam(item.id)
          const createCheck = validateCustomProviderCreateInput({
            name: item.name,
            cliCommand: item.cliCommand,
            cliPath: item.cliPath,
          })
          if (
            idCheck.ok &&
            idCheck.value.startsWith('custom-') &&
            createCheck.ok &&
            !BUILTIN_PROVIDER_DESCRIPTORS.some((b) => b.id === idCheck.value)
          ) {
            customProviders.push({
              id: idCheck.value,
              name: createCheck.value.name,
              cliCommand: createCheck.value.cliCommand,
              cliPath: createCheck.value.cliPath,
              createdAt:
                typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
            })
          }
        }
      }

      const probeSnapshots = isPlainObject(parsed.probeSnapshots) ? parsed.probeSnapshots : {}
      return {
        version: 1,
        updatedAt:
          typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        builtinOverrides,
        customProviders,
        probeSnapshots,
      }
    } catch {
      return createEmptyStorageDocument()
    }
  }

  function persistStorageDocument(doc) {
    const nextDoc = {
      version: 1,
      updatedAt: new Date().toISOString(),
      builtinOverrides: doc.builtinOverrides || {},
      customProviders: doc.customProviders || [],
      probeSnapshots: doc.probeSnapshots || {},
    }
    writeFileAtomicallyRestricted(configFilePath, `${JSON.stringify(nextDoc, null, 2)}\n`)
    return nextDoc
  }

  function buildProvidersListFromDocument(doc) {
    const builtinList = BUILTIN_PROVIDER_DESCRIPTORS.map((descriptor) => {
      const override = doc.builtinOverrides[descriptor.id]
      const cliPath = override?.cliPath || descriptor.defaultCliPath
      const effectiveDescriptor = {
        ...descriptor,
        name: override?.name || descriptor.name,
      }
      const snapshot = sanitizePersistedProbeSnapshot(
        doc.probeSnapshots[descriptor.id],
        cliPath,
      )
      return createUnprobedProviderRecord(effectiveDescriptor, cliPath, snapshot)
    })

    const customList = doc.customProviders.map((custom) => {
      const customDescriptor = {
        id: custom.id,
        name: custom.name,
        shortLabel: custom.cliCommand.slice(0, 10),
        cliCommand: custom.cliCommand,
        defaultCliPath: custom.cliPath,
        isBuiltin: false,
        authModeLabel: agentMessage('agent.provider.customAuthModeLabel'),
        supportsAuthProbe: false,
        supportsLoginCommand: false,
        loginCommandHint: custom.cliCommand,
        loginGuideText:
          agentMessage('agent.provider.customLoginGuideText'),
      }
      const snapshot = sanitizePersistedProbeSnapshot(
        doc.probeSnapshots[custom.id],
        custom.cliPath,
      )
      return createUnprobedProviderRecord(customDescriptor, custom.cliPath, snapshot)
    })

    return [...builtinList, ...customList]
  }

  function listProviders() {
    const doc = readStorageDocument()
    return buildProvidersListFromDocument(doc)
  }

  function getProviderById(providerId) {
    const idCheck = validateProviderIdParam(providerId)
    if (!idCheck.ok) {
      return null
    }
    const all = listProviders()
    return all.find((item) => item.id === idCheck.value) || null
  }

  function updateProviderConfig(providerId, rawInput) {
    const idCheck = validateProviderIdParam(providerId)
    if (!idCheck.ok) {
      return idCheck
    }
    const inputCheck = validateProviderConfigUpdateInput(rawInput)
    if (!inputCheck.ok) {
      return inputCheck
    }

    const doc = readStorageDocument()
    const builtinDesc = BUILTIN_PROVIDER_DESCRIPTORS.find((b) => b.id === idCheck.value)

    if (builtinDesc) {
      const prevOverride = doc.builtinOverrides[builtinDesc.id]
      const prevPath = prevOverride?.cliPath || builtinDesc.defaultCliPath
      const nextName = inputCheck.value.name ?? prevOverride?.name ?? builtinDesc.name
      doc.builtinOverrides[builtinDesc.id] = {
        cliPath: inputCheck.value.cliPath,
        name: nextName,
      }
      if (prevPath !== inputCheck.value.cliPath) {
        delete doc.probeSnapshots[builtinDesc.id]
      }
      persistStorageDocument(doc)
      const updated = buildProvidersListFromDocument(doc).find((p) => p.id === builtinDesc.id)
      return { ok: true, provider: updated }
    }

    const customIndex = doc.customProviders.findIndex((c) => c.id === idCheck.value)
    if (customIndex === -1) {
      return {
        ok: false,
        errorCode: 'PROVIDER_NOT_FOUND',
        message: agentMessage('agent.provider.providerNotFound'),
      }
    }

    const existingCustom = doc.customProviders[customIndex]
    const prevPath = existingCustom.cliPath
    doc.customProviders[customIndex] = {
      ...existingCustom,
      name: inputCheck.value.name ?? existingCustom.name,
      cliPath: inputCheck.value.cliPath,
    }
    if (prevPath !== inputCheck.value.cliPath) {
      delete doc.probeSnapshots[existingCustom.id]
    }
    persistStorageDocument(doc)
    const updated = buildProvidersListFromDocument(doc).find((p) => p.id === existingCustom.id)
    return { ok: true, provider: updated }
  }

  function addCustomProvider(rawInput) {
    const createCheck = validateCustomProviderCreateInput(rawInput)
    if (!createCheck.ok) {
      return createCheck
    }

    const doc = readStorageDocument()
    if (doc.customProviders.length >= MAX_CUSTOM_PROVIDERS) {
      return {
        ok: false,
        errorCode: 'MAX_CUSTOM_PROVIDERS_EXCEEDED',
        message: agentMessage('agent.provider.customProviderLimit', { max: MAX_CUSTOM_PROVIDERS }),
      }
    }

    const slugBase = createCheck.value.cliCommand
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'cli'
    const uniqueSuffix = crypto.randomBytes(3).toString('hex')
    const newId = `custom-${slugBase}-${uniqueSuffix}`

    doc.customProviders.push({
      id: newId,
      name: createCheck.value.name,
      cliCommand: createCheck.value.cliCommand,
      cliPath: createCheck.value.cliPath,
      createdAt: new Date().toISOString(),
    })

    persistStorageDocument(doc)
    const created = buildProvidersListFromDocument(doc).find((p) => p.id === newId)
    return { ok: true, provider: created }
  }

  function removeCustomProvider(providerId) {
    const idCheck = validateProviderIdParam(providerId)
    if (!idCheck.ok) {
      return idCheck
    }
    if (BUILTIN_PROVIDER_DESCRIPTORS.some((b) => b.id === idCheck.value)) {
      return {
        ok: false,
        errorCode: 'CANNOT_REMOVE_BUILTIN',
        message: agentMessage('agent.provider.builtinCannotRemove'),
      }
    }

    const doc = readStorageDocument()
    const index = doc.customProviders.findIndex((c) => c.id === idCheck.value)
    if (index === -1) {
      return {
        ok: false,
        errorCode: 'PROVIDER_NOT_FOUND',
        message: agentMessage('agent.provider.customProviderNotFound'),
      }
    }

    doc.customProviders.splice(index, 1)
    delete doc.probeSnapshots[idCheck.value]
    persistStorageDocument(doc)
    return { ok: true, removedId: idCheck.value, providers: buildProvidersListFromDocument(doc) }
  }

  function saveProbeResult(providerId, probeResult) {
    const idCheck = validateProviderIdParam(providerId)
    if (!idCheck.ok) {
      return null
    }
    const doc = readStorageDocument()
    const currentProviders = buildProvidersListFromDocument(doc)
    const target = currentProviders.find((p) => p.id === idCheck.value)
    if (!target) {
      return null
    }

    doc.probeSnapshots[idCheck.value] = sanitizePersistedProbeSnapshot(
      {
        ...probeResult,
        cliPath: target.cliPath,
      },
      target.cliPath,
    )
    persistStorageDocument(doc)
    return buildProvidersListFromDocument(doc).find((p) => p.id === idCheck.value) || null
  }

  return {
    configFilePath,
    listProviders,
    getProviderById,
    updateProviderConfig,
    addCustomProvider,
    removeCustomProvider,
    saveProbeResult,
  }
}
