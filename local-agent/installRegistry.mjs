import fs from 'node:fs'
import { ensureLibraryDirectories } from './libraryPaths.mjs'
import { writeFileAtomicallyRestricted } from './providerStorage.mjs'
import { isPlainObject } from './providerContracts.mjs'

function readRegistryFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { version: 1, updatedAt: new Date().toISOString(), items: {} }
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!isPlainObject(parsed) || !isPlainObject(parsed.items)) {
      return { version: 1, updatedAt: new Date().toISOString(), items: {} }
    }
    const items = {}
    for (const [name, entry] of Object.entries(parsed.items)) {
      if (!isPlainObject(entry)) continue
      const targets = Array.isArray(entry.targets)
        ? entry.targets.filter((t) => typeof t === 'string')
        : []
      items[name] = {
        targets: [...new Set(targets)],
        lastCheck: isPlainObject(entry.lastCheck) ? entry.lastCheck : null,
      }
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      items,
    }
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: {} }
  }
}

function writeRegistryFile(filePath, doc) {
  const nextDoc = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: doc.items || {},
  }
  writeFileAtomicallyRestricted(filePath, `${JSON.stringify(nextDoc, null, 2)}\n`)
  return nextDoc
}

export function createInstallRegistry(options = {}) {
  const dirs = ensureLibraryDirectories(options)

  function getFilePath(kind) {
    return kind === 'mcp' ? dirs.mcpInstallsPath : dirs.skillInstallsPath
  }

  function getManagedTargets(kind, itemName) {
    const doc = readRegistryFile(getFilePath(kind))
    return doc.items[itemName]?.targets ?? []
  }

  function isManagedByUs(kind, itemName, targetId) {
    return getManagedTargets(kind, itemName).includes(targetId)
  }

  function markInstalled(kind, itemName, targetId) {
    const filePath = getFilePath(kind)
    const doc = readRegistryFile(filePath)
    const existing = doc.items[itemName] || { targets: [], lastCheck: null }
    if (!existing.targets.includes(targetId)) {
      existing.targets.push(targetId)
    }
    doc.items[itemName] = existing
    writeRegistryFile(filePath, doc)
  }

  function markUninstalled(kind, itemName, targetId) {
    const filePath = getFilePath(kind)
    const doc = readRegistryFile(filePath)
    const existing = doc.items[itemName]
    if (!existing) return
    existing.targets = existing.targets.filter((id) => id !== targetId)
    doc.items[itemName] = existing
    writeRegistryFile(filePath, doc)
  }

  function renameItem(kind, oldName, newName) {
    if (oldName === newName) return
    const filePath = getFilePath(kind)
    const doc = readRegistryFile(filePath)
    if (doc.items[oldName]) {
      doc.items[newName] = doc.items[oldName]
      delete doc.items[oldName]
      writeRegistryFile(filePath, doc)
    }
  }

  function removeItemRecord(kind, itemName) {
    const filePath = getFilePath(kind)
    const doc = readRegistryFile(filePath)
    if (doc.items[itemName]) {
      delete doc.items[itemName]
      writeRegistryFile(filePath, doc)
    }
  }

  function saveLastCheck(kind, itemName, checkSnapshot) {
    const filePath = getFilePath(kind)
    const doc = readRegistryFile(filePath)
    const existing = doc.items[itemName] || { targets: [], lastCheck: null }
    existing.lastCheck = checkSnapshot
    doc.items[itemName] = existing
    writeRegistryFile(filePath, doc)
  }

  function getLastCheck(kind, itemName) {
    const doc = readRegistryFile(getFilePath(kind))
    return doc.items[itemName]?.lastCheck ?? null
  }

  return {
    getManagedTargets,
    isManagedByUs,
    markInstalled,
    markUninstalled,
    renameItem,
    removeItemRecord,
    saveLastCheck,
    getLastCheck,
  }
}
