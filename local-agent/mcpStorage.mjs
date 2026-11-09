import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import {
  ensureLibraryDirectories,
  resolveInsideLibrary,
  validateLibraryItemName,
} from './libraryPaths.mjs'
import { createInstallRegistry } from './installRegistry.mjs'
import { createTargetAdapters } from './targetAdapters.mjs'
import { writeFileAtomicallyRestricted } from './providerStorage.mjs'
import { isPlainObject } from './providerContracts.mjs'
import {
  MAX_MCP_COUNT,
  MCP_ERROR_CODES,
  isSecretPlaceholder,
  makeSecretPlaceholder,
  maskSecretValue,
  validateMcpDefinitionInput,
} from './mcpContracts.mjs'

function readSecretsDocument(filePath) {
  if (!fs.existsSync(filePath)) {
    return { version: 1, updatedAt: new Date().toISOString(), servers: {} }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!isPlainObject(parsed) || !isPlainObject(parsed.servers)) {
      return { version: 1, updatedAt: new Date().toISOString(), servers: {} }
    }
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      servers: parsed.servers,
    }
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), servers: {} }
  }
}

function writeSecretsDocument(filePath, doc) {
  const nextDoc = {
    version: 1,
    updatedAt: new Date().toISOString(),
    servers: doc.servers || {},
  }
  writeFileAtomicallyRestricted(filePath, `${JSON.stringify(nextDoc, null, 2)}\n`)
  return nextDoc
}

export function createMcpStorage(options = {}) {
  const dirs = ensureLibraryDirectories(options)
  const registry = options.registry || createInstallRegistry(options)
  const adapters = options.adapters || createTargetAdapters({ ...options, registry })

  function getServerSecrets(serverName) {
    const doc = readSecretsDocument(dirs.mcpSecretsPath)
    const entry = doc.servers[serverName]
    if (!isPlainObject(entry)) {
      return { env: {}, headers: {} }
    }
    return {
      env: isPlainObject(entry.env) ? { ...entry.env } : {},
      headers: isPlainObject(entry.headers) ? { ...entry.headers } : {},
    }
  }

  function saveServerSecrets(serverName, nextSecretEnv, nextSecretHeaders) {
    const doc = readSecretsDocument(dirs.mcpSecretsPath)
    const prev = getServerSecrets(serverName)
    const mergedEnv = {}
    for (const [k, v] of Object.entries(nextSecretEnv || {})) {
      // If UI sends back the masked string unchanged, keep previous secret
      if (v.startsWith('••••') && prev.env[k]) {
        mergedEnv[k] = prev.env[k]
      } else {
        mergedEnv[k] = v
      }
    }
    const mergedHeaders = {}
    for (const [k, v] of Object.entries(nextSecretHeaders || {})) {
      if (v.startsWith('••••') && prev.headers[k]) {
        mergedHeaders[k] = prev.headers[k]
      } else {
        mergedHeaders[k] = v
      }
    }
    doc.servers[serverName] = { env: mergedEnv, headers: mergedHeaders }
    writeSecretsDocument(dirs.mcpSecretsPath, doc)
    return { env: mergedEnv, headers: mergedHeaders }
  }

  function deleteServerSecrets(serverName) {
    const doc = readSecretsDocument(dirs.mcpSecretsPath)
    if (doc.servers[serverName]) {
      delete doc.servers[serverName]
      writeSecretsDocument(dirs.mcpSecretsPath, doc)
    }
  }

  function renameServerSecrets(oldName, newName) {
    if (oldName === newName) return
    const doc = readSecretsDocument(dirs.mcpSecretsPath)
    if (doc.servers[oldName]) {
      doc.servers[newName] = doc.servers[oldName]
      delete doc.servers[oldName]
      writeSecretsDocument(dirs.mcpSecretsPath, doc)
    }
  }

  function resolveRuntimeConfig(serverName, def) {
    const secrets = getServerSecrets(serverName)
    const resolvedEnv = {}
    const maskedSecretEnv = {}
    const plainEnv = {}
    const missingSecrets = []

    for (const [k, v] of Object.entries(def.env || {})) {
      if (isSecretPlaceholder(v)) {
        const realVal = secrets.env[k] ?? ''
        if (!realVal) missingSecrets.push(`env.${k}`)
        resolvedEnv[k] = realVal
        maskedSecretEnv[k] = maskSecretValue(realVal)
      } else {
        resolvedEnv[k] = v
        plainEnv[k] = v
      }
    }

    const resolvedHeaders = {}
    const maskedSecretHeaders = {}
    const plainHeaders = {}

    for (const [k, v] of Object.entries(def.headers || {})) {
      if (isSecretPlaceholder(v)) {
        const realVal = secrets.headers[k] ?? ''
        if (!realVal) missingSecrets.push(`headers.${k}`)
        resolvedHeaders[k] = realVal
        maskedSecretHeaders[k] = maskSecretValue(realVal)
      } else {
        resolvedHeaders[k] = v
        plainHeaders[k] = v
      }
    }

    return {
      resolvedEnv,
      resolvedHeaders,
      plainEnv,
      plainHeaders,
      maskedSecretEnv,
      maskedSecretHeaders,
      missingSecrets,
    }
  }

  function readRawDefinition(serverName) {
    const fileCheck = resolveInsideLibrary(options, 'mcps', `${serverName}.json`)
    if (!fileCheck.ok) return null
    if (!fs.existsSync(fileCheck.path) || !fs.statSync(fileCheck.path).isFile()) {
      return null
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(fileCheck.path, 'utf8'))
      if (!isPlainObject(parsed)) return null
      const stat = fs.statSync(fileCheck.path)
      return { def: parsed, updatedAt: stat.mtime.toISOString(), filePath: fileCheck.path }
    } catch {
      return null
    }
  }

  function buildMcpRecord(serverName) {
    const raw = readRawDefinition(serverName)
    if (!raw) return null
    const { def, updatedAt } = raw
    const runtime = resolveRuntimeConfig(serverName, def)
    const targets = adapters
      .listTargets()
      .map((t) =>
        adapters.inspectMcpOnTarget(
          serverName,
          def,
          runtime.resolvedEnv,
          runtime.resolvedHeaders,
          t,
        ),
      )

    return {
      name: serverName,
      description: typeof def.description === 'string' ? def.description : '',
      transport: def.transport === 'http' ? 'http' : 'stdio',
      command: def.transport === 'stdio' ? def.command || '' : null,
      args: def.transport === 'stdio' && Array.isArray(def.args) ? def.args : [],
      url: def.transport === 'http' ? def.url || '' : null,
      env: runtime.plainEnv,
      headers: runtime.plainHeaders,
      secretEnv: runtime.maskedSecretEnv,
      secretHeaders: runtime.maskedSecretHeaders,
      missingSecrets: runtime.missingSecrets,
      targets,
      lastCheck: registry.getLastCheck('mcp', serverName),
      updatedAt,
    }
  }

  function buildDefinitionFileObject(validatedInput) {
    const { name, description, transport, command, args, url, env, headers, secretEnv, secretHeaders } =
      validatedInput
    const fileEnv = { ...env }
    for (const k of Object.keys(secretEnv || {})) {
      fileEnv[k] = makeSecretPlaceholder(name, 'env', k)
    }
    const fileHeaders = { ...headers }
    for (const k of Object.keys(secretHeaders || {})) {
      fileHeaders[k] = makeSecretPlaceholder(name, 'headers', k)
    }
    return {
      name,
      description: description || '',
      transport,
      command: transport === 'stdio' ? command : null,
      args: transport === 'stdio' ? args : [],
      url: transport === 'http' ? url : null,
      env: fileEnv,
      headers: fileHeaders,
    }
  }

  function listMcpServers() {
    ensureLibraryDirectories(options)
    const entries = fs.readdirSync(dirs.mcpsDir, { withFileTypes: true })
    const servers = []
    const managedNames = new Set()
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !entry.isFile() || !entry.name.endsWith('.json')) continue
      const baseName = entry.name.slice(0, -5)
      const nameCheck = validateLibraryItemName(baseName)
      if (!nameCheck.ok) continue
      const record = buildMcpRecord(nameCheck.value)
      if (record) {
        servers.push(record)
        managedNames.add(record.name)
      }
    }
    servers.sort((a, b) => a.name.localeCompare(b.name))
    const externalServers = adapters.listExternalMcpServers(managedNames)
    return { servers, externalServers }
  }

  function getMcpServer(rawName) {
    const nameCheck = validateLibraryItemName(rawName)
    if (!nameCheck.ok) return nameCheck
    const record = buildMcpRecord(nameCheck.value)
    if (!record) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MCP_NOT_FOUND,
        message: agentMessage('agent.mcp.notFound', { name: nameCheck.value }),
      }
    }
    return { ok: true, server: record }
  }

  function createMcpServer(payload) {
    const check = validateMcpDefinitionInput(payload)
    if (!check.ok) return check

    const existing = listMcpServers().servers
    if (existing.length >= MAX_MCP_COUNT) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MAX_MCP_EXCEEDED,
        message: agentMessage('agent.mcp.limitReached', { max: MAX_MCP_COUNT }),
      }
    }

    const fileCheck = resolveInsideLibrary(options, 'mcps', `${check.value.name}.json`)
    if (!fileCheck.ok) return fileCheck
    if (fs.existsSync(fileCheck.path)) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MCP_ALREADY_EXISTS,
        message: agentMessage('agent.mcp.alreadyExists', { name: check.value.name }),
      }
    }

    const defObj = buildDefinitionFileObject(check.value)
    saveServerSecrets(check.value.name, check.value.secretEnv, check.value.secretHeaders)
    writeFileAtomicallyRestricted(fileCheck.path, `${JSON.stringify(defObj, null, 2)}\n`)

    return { ok: true, server: buildMcpRecord(check.value.name) }
  }

  function updateMcpServer(rawCurrentName, payload) {
    const currentCheck = validateLibraryItemName(rawCurrentName)
    if (!currentCheck.ok) return currentCheck

    const oldFileCheck = resolveInsideLibrary(options, 'mcps', `${currentCheck.value}.json`)
    if (!oldFileCheck.ok) return oldFileCheck
    if (!fs.existsSync(oldFileCheck.path)) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MCP_NOT_FOUND,
        message: agentMessage('agent.mcp.notFound', { name: currentCheck.value }),
      }
    }

    const updateCheck = validateMcpDefinitionInput(payload, currentCheck.value)
    if (!updateCheck.ok) return updateCheck

    const nextName = updateCheck.value.name
    const isRenaming = nextName !== currentCheck.value
    let targetFilePath = oldFileCheck.path

    const installedTargetIds = registry.getManagedTargets('mcp', currentCheck.value)

    if (isRenaming) {
      const newFileCheck = resolveInsideLibrary(options, 'mcps', `${nextName}.json`)
      if (!newFileCheck.ok) return newFileCheck
      if (fs.existsSync(newFileCheck.path)) {
        return {
          ok: false,
          errorCode: MCP_ERROR_CODES.MCP_ALREADY_EXISTS,
          message: agentMessage('agent.mcp.alreadyExists', { name: nextName }),
        }
      }

      for (const targetId of installedTargetIds) {
        adapters.uninstallMcpFromTarget(currentCheck.value, targetId)
      }

      renameServerSecrets(currentCheck.value, nextName)
      registry.renameItem('mcp', currentCheck.value, nextName)
      fs.rmSync(oldFileCheck.path, { force: true })
      targetFilePath = newFileCheck.path
    }

    const defObj = buildDefinitionFileObject(updateCheck.value)
    saveServerSecrets(nextName, updateCheck.value.secretEnv, updateCheck.value.secretHeaders)
    writeFileAtomicallyRestricted(targetFilePath, `${JSON.stringify(defObj, null, 2)}\n`)

    // Automatically re-sync all targets where this MCP is installed
    const runtime = resolveRuntimeConfig(nextName, defObj)
    for (const targetId of installedTargetIds) {
      adapters.installMcpToTarget(
        nextName,
        defObj,
        runtime.resolvedEnv,
        runtime.resolvedHeaders,
        targetId,
      )
    }

    return { ok: true, server: buildMcpRecord(nextName) }
  }

  function deleteMcpServer(rawName) {
    const nameCheck = validateLibraryItemName(rawName)
    if (!nameCheck.ok) return nameCheck

    const fileCheck = resolveInsideLibrary(options, 'mcps', `${nameCheck.value}.json`)
    if (!fileCheck.ok) return fileCheck
    if (!fs.existsSync(fileCheck.path)) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MCP_NOT_FOUND,
        message: agentMessage('agent.mcp.notFound', { name: nameCheck.value }),
      }
    }

    for (const target of adapters.listTargets()) {
      const state = adapters.inspectMcpOnTarget(nameCheck.value, null, null, null, target)
      if (state.managed) {
        adapters.uninstallMcpFromTarget(nameCheck.value, target.id)
      }
    }

    fs.rmSync(fileCheck.path, { force: true })
    deleteServerSecrets(nameCheck.value)
    registry.removeItemRecord('mcp', nameCheck.value)
    return { ok: true, deletedName: nameCheck.value }
  }

  function installMcp(rawName, targetId) {
    const nameCheck = validateLibraryItemName(rawName)
    if (!nameCheck.ok) return nameCheck
    const raw = readRawDefinition(nameCheck.value)
    if (!raw) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MCP_NOT_FOUND,
        message: agentMessage('agent.mcp.notFound', { name: nameCheck.value }),
      }
    }
    const runtime = resolveRuntimeConfig(nameCheck.value, raw.def)
    if (runtime.missingSecrets.length > 0) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MISSING_SECRETS,
        message: agentMessage('agent.mcp.missingSecrets', { secrets: runtime.missingSecrets.join(', ') }),
      }
    }
    const res = adapters.installMcpToTarget(
      nameCheck.value,
      raw.def,
      runtime.resolvedEnv,
      runtime.resolvedHeaders,
      targetId,
    )
    if (!res.ok) return res
    return { ok: true, server: buildMcpRecord(nameCheck.value) }
  }

  function uninstallMcp(rawName, targetId) {
    const nameCheck = validateLibraryItemName(rawName)
    if (!nameCheck.ok) return nameCheck
    const raw = readRawDefinition(nameCheck.value)
    if (!raw) {
      return {
        ok: false,
        errorCode: MCP_ERROR_CODES.MCP_NOT_FOUND,
        message: agentMessage('agent.mcp.notFound', { name: nameCheck.value }),
      }
    }
    const res = adapters.uninstallMcpFromTarget(nameCheck.value, targetId)
    if (!res.ok) return res
    return { ok: true, server: buildMcpRecord(nameCheck.value) }
  }

  return {
    listMcpServers,
    getMcpServer,
    createMcpServer,
    updateMcpServer,
    deleteMcpServer,
    installMcp,
    uninstallMcp,
    readRawDefinition,
    resolveRuntimeConfig,
  }
}
