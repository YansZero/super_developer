import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { ensureLibraryDirectories, getCanonicalHomeDir } from './libraryPaths.mjs'
import { createInstallRegistry } from './installRegistry.mjs'
import { createProviderStorage, writeFileAtomicallyRestricted } from './providerStorage.mjs'
import { isPlainObject } from './providerContracts.mjs'
import { resolveExecutableFile } from './providerAdapter.mjs'

function expandHomePath(rawPath, homeDir) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null
  const trimmed = rawPath.trim()
  if (trimmed === '~') return homeDir
  if (trimmed.startsWith('~/')) return path.join(homeDir, trimmed.slice(2))
  if (path.isAbsolute(trimmed)) return path.resolve(trimmed)
  return null
}

function escapeTomlString(str) {
  return JSON.stringify(String(str ?? ''))
}

function buildCodexTomlMcpBlock(name, def, resolvedEnv, resolvedHeaders) {
  const lines = []
  lines.push(`# >>> super-developer-mcp:${name} >>>`)
  lines.push(`[mcp_servers.${name}]`)
  if (def.transport === 'http') {
    lines.push(`url = ${escapeTomlString(def.url)}`)
    if (resolvedHeaders && Object.keys(resolvedHeaders).length > 0) {
      lines.push(`[mcp_servers.${name}.http_headers]`)
      for (const [k, v] of Object.entries(resolvedHeaders)) {
        lines.push(`${escapeTomlString(k)} = ${escapeTomlString(v)}`)
      }
    }
  } else {
    lines.push(`command = ${escapeTomlString(def.command)}`)
    const argsList = Array.isArray(def.args) ? def.args.map((a) => escapeTomlString(a)).join(', ') : ''
    lines.push(`args = [${argsList}]`)
    if (resolvedEnv && Object.keys(resolvedEnv).length > 0) {
      lines.push(`[mcp_servers.${name}.env]`)
      for (const [k, v] of Object.entries(resolvedEnv)) {
        lines.push(`${escapeTomlString(k)} = ${escapeTomlString(v)}`)
      }
    }
  }
  lines.push(`# <<< super-developer-mcp:${name} <<<`)
  return lines.join('\n')
}

function parseCodexTomlMcpNames(tomlContent) {
  const result = {}
  if (typeof tomlContent !== 'string') return result
  const sectionRegex = /^\s*\[mcp_servers\.([a-zA-Z0-9_-]+)\]\s*$/gm
  let match
  while ((match = sectionRegex.exec(tomlContent)) !== null) {
    const serverName = match[1]
    const markerPattern = new RegExp(
      `# >>> super-developer-mcp:${serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} >>>`,
    )
    result[serverName] = {
      managedMarker: markerPattern.test(tomlContent),
    }
  }
  return result
}

function removeCodexTomlMcpBlock(tomlContent, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const managedRegex = new RegExp(
    `\\n?# >>> super-developer-mcp:${escaped} >>>[\\s\\S]*?# <<< super-developer-mcp:${escaped} <<<\\n?`,
    'g',
  )
  if (managedRegex.test(tomlContent)) {
    return tomlContent.replace(managedRegex, '\n').replace(/\n{3,}/g, '\n\n')
  }
  return tomlContent
}

export function createTargetAdapters(options = {}) {
  const homeDir = getCanonicalHomeDir(options)
  const dirs = ensureLibraryDirectories(options)
  const registry = options.registry || createInstallRegistry(options)
  const providerStorage = options.providerStorage || createProviderStorage(options)
  const adapterOptions = {
    ...(options.adapterOptions || {}),
    ...(options._testLibraryRoot ? { _testLibraryRoot: options._testLibraryRoot } : {}),
  }

  function resolveMcpDefinitionForTarget(def) {
    if (!def || def.transport !== 'stdio' || typeof def.command !== 'string') {
      return def
    }
    const execCheck = resolveExecutableFile(def.command, adapterOptions)
    if (execCheck.ok && execCheck.resolvedPath) {
      return {
        ...def,
        command: execCheck.resolvedPath,
      }
    }
    return def
  }

  function backupTargetFile(targetId, filePath) {
    if (!fs.existsSync(filePath)) return null
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const backupSubdir = path.join(dirs.backupsDir, `${ts}_${targetId}`)
      fs.mkdirSync(backupSubdir, { recursive: true, mode: 0o700 })
      const baseName = path.basename(filePath)
      const destPath = path.join(backupSubdir, baseName)
      const metaPath = path.join(backupSubdir, 'meta.json')
      fs.copyFileSync(filePath, destPath)
      fs.chmodSync(destPath, 0o600)
      writeFileAtomicallyRestricted(
        metaPath,
        JSON.stringify(
          {
            targetId,
            originalPath: filePath,
            backupFile: destPath,
            createdAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      )
      return destPath
    } catch {
      return null
    }
  }

  function restoreLatestBackup(targetId) {
    if (!fs.existsSync(dirs.backupsDir)) {
      return { ok: false, errorCode: 'NO_BACKUP_FOUND', message: agentMessage('agent.target.noBackupFound') }
    }
    const entries = fs
      .readdirSync(dirs.backupsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && (!targetId || d.name.endsWith(`_${targetId}`)))
      .map((d) => d.name)
      .sort()
      .reverse()

    for (const folder of entries) {
      const metaPath = path.join(dirs.backupsDir, folder, 'meta.json')
      if (!fs.existsSync(metaPath)) continue
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
        if (meta && typeof meta.originalPath === 'string' && fs.existsSync(meta.backupFile)) {
          const content = fs.readFileSync(meta.backupFile, 'utf8')
          writeFileAtomicallyRestricted(meta.originalPath, content)
          return {
            ok: true,
            targetId: meta.targetId,
            restoredPath: meta.originalPath,
            createdAt: meta.createdAt,
          }
        }
      } catch {
        // continue searching older backups
      }
    }
    return { ok: false, errorCode: 'NO_BACKUP_FOUND', message: agentMessage('agent.target.noBackupFile') }
  }

  function listTargets() {
    const builtinTargets = [
      {
        id: 'claude-code',
        name: 'Claude Code',
        shortLabel: 'Claude',
        isBuiltin: true,
        skillsDir: path.join(homeDir, '.claude', 'skills'),
        mcpConfigPath: path.join(homeDir, '.claude.json'),
        mcpFormat: 'json',
      },
      {
        id: 'antigravity',
        name: 'Antigravity (agy)',
        shortLabel: 'agy',
        isBuiltin: true,
        skillsDir: path.join(homeDir, '.gemini', 'config', 'skills'),
        mcpConfigPath: path.join(homeDir, '.gemini', 'config', 'mcp_config.json'),
        mcpFormat: 'json',
      },
      {
        id: 'codex',
        name: 'OpenAI Codex',
        shortLabel: 'Codex',
        isBuiltin: true,
        skillsDir: path.join(homeDir, '.codex', 'skills'),
        mcpConfigPath: path.join(homeDir, '.codex', 'config.toml'),
        mcpFormat: 'toml',
      },
    ]

    const providers = providerStorage.listProviders()
    const customTargets = providers
      .filter((p) => !p.isBuiltin)
      .map((p) => {
        const defaultSlug = p.cliCommand.toLowerCase().replace(/[^a-z0-9_-]/g, '') || p.id
        const skillsDir =
          expandHomePath(p.skillsDir, homeDir) || path.join(homeDir, `.${defaultSlug}`, 'skills')
        const mcpConfigPath =
          expandHomePath(p.mcpConfigPath, homeDir) ||
          path.join(homeDir, `.${defaultSlug}`, 'mcp.json')
        return {
          id: p.id,
          name: p.name,
          shortLabel: p.shortLabel || p.name.slice(0, 10),
          isBuiltin: false,
          skillsDir,
          mcpConfigPath,
          mcpFormat: 'json',
        }
      })

    return [...builtinTargets, ...customTargets]
  }

  function getTargetById(targetId) {
    return listTargets().find((t) => t.id === targetId) || null
  }

  // --- Skill Target Operations ---
  function inspectSkillOnTarget(skillName, canonicalSkillDir, target) {
    const destPath = path.join(target.skillsDir, skillName)
    const managed = registry.isManagedByUs('skill', skillName, target.id)
    let lstat
    try {
      lstat = fs.lstatSync(destPath)
    } catch {
      return {
        targetId: target.id,
        targetName: target.name,
        shortLabel: target.shortLabel,
        state: 'absent',
        managed: false,
        targetPath: destPath,
      }
    }

    if (lstat.isSymbolicLink()) {
      try {
        const realDest = fs.realpathSync(destPath)
        const realSrc = fs.existsSync(canonicalSkillDir)
          ? fs.realpathSync(canonicalSkillDir)
          : canonicalSkillDir
        if (realDest === realSrc) {
          return {
            targetId: target.id,
            targetName: target.name,
            shortLabel: target.shortLabel,
            state: 'installed',
            managed: true,
            targetPath: destPath,
          }
        }
        return {
          targetId: target.id,
          targetName: target.name,
          shortLabel: target.shortLabel,
          state: 'external',
          managed: false,
          targetPath: destPath,
        }
      } catch {
        return {
          targetId: target.id,
          targetName: target.name,
          shortLabel: target.shortLabel,
          state: 'broken',
          managed,
          targetPath: destPath,
        }
      }
    }

    // If copied fallback by us
    if (managed) {
      return {
        targetId: target.id,
        targetName: target.name,
        shortLabel: target.shortLabel,
        state: 'installed',
        managed: true,
        targetPath: destPath,
      }
    }

    return {
      targetId: target.id,
      targetName: target.name,
      shortLabel: target.shortLabel,
      state: 'external',
      managed: false,
      targetPath: destPath,
    }
  }

  function installSkillToTarget(skillName, canonicalSkillDir, targetId) {
    const target = getTargetById(targetId)
    if (!target) {
      return { ok: false, errorCode: 'TARGET_NOT_FOUND', message: agentMessage('agent.target.cliNotFound', { targetId }) }
    }
    if (!fs.existsSync(canonicalSkillDir)) {
      return { ok: false, errorCode: 'SKILL_NOT_FOUND', message: agentMessage('agent.skill.notFound', { name: skillName }) }
    }

    const current = inspectSkillOnTarget(skillName, canonicalSkillDir, target)
    if (current.state === 'external') {
      return {
        ok: false,
        errorCode: 'EXTERNAL_ITEM_PROTECTED',
        message: agentMessage('agent.target.externalSkillExists', { targetName: target.name, skillName }),
      }
    }

    fs.mkdirSync(target.skillsDir, { recursive: true, mode: 0o700 })
    const destPath = path.join(target.skillsDir, skillName)

    if (current.state === 'installed' || current.state === 'broken') {
      try {
        fs.rmSync(destPath, { recursive: true, force: true })
      } catch {
        // ignore
      }
    }

    try {
      fs.symlinkSync(canonicalSkillDir, destPath, 'dir')
    } catch {
      // Fallback to recursive copy if symlink is unsupported
      fs.cpSync(canonicalSkillDir, destPath, { recursive: true })
    }

    registry.markInstalled('skill', skillName, target.id)
    return {
      ok: true,
      status: inspectSkillOnTarget(skillName, canonicalSkillDir, target),
    }
  }

  function uninstallSkillFromTarget(skillName, canonicalSkillDir, targetId) {
    const target = getTargetById(targetId)
    if (!target) {
      return { ok: false, errorCode: 'TARGET_NOT_FOUND', message: agentMessage('agent.target.cliNotFound', { targetId }) }
    }
    const current = inspectSkillOnTarget(skillName, canonicalSkillDir, target)
    if (current.state === 'absent') {
      registry.markUninstalled('skill', skillName, target.id)
      return { ok: true, status: current }
    }
    if (current.state === 'external' || !current.managed) {
      return {
        ok: false,
        errorCode: 'EXTERNAL_ITEM_PROTECTED',
        message: agentMessage('agent.target.skillNotInstalledByTool', { targetName: target.name, skillName }),
      }
    }

    const destPath = path.join(target.skillsDir, skillName)
    fs.rmSync(destPath, { recursive: true, force: true })
    registry.markUninstalled('skill', skillName, target.id)
    return {
      ok: true,
      status: inspectSkillOnTarget(skillName, canonicalSkillDir, target),
    }
  }

  // --- MCP Target Operations ---
  function readJsonMcpConfig(filePath) {
    if (!fs.existsSync(filePath)) {
      return { ok: true, doc: {}, servers: {} }
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf8')
      if (!raw.trim()) return { ok: true, doc: {}, servers: {} }
      const parsed = JSON.parse(raw)
      if (!isPlainObject(parsed)) {
        return { ok: false, errorCode: 'INVALID_TARGET_CONFIG', message: agentMessage('agent.target.configNotJsonObject', { path: filePath }) }
      }
      const servers = isPlainObject(parsed.mcpServers) ? parsed.mcpServers : {}
      return { ok: true, doc: parsed, servers }
    } catch {
      return { ok: false, errorCode: 'INVALID_TARGET_CONFIG', message: agentMessage('agent.target.configParseFailed', { path: filePath }) }
    }
  }

  function buildJsonServerEntry(def, resolvedEnv, resolvedHeaders) {
    if (def.transport === 'http') {
      const entry = {
        type: 'http',
        url: def.url,
      }
      if (resolvedHeaders && Object.keys(resolvedHeaders).length > 0) {
        entry.headers = resolvedHeaders
      }
      return entry
    }
    const entry = {
      command: def.command,
      args: Array.isArray(def.args) ? def.args : [],
    }
    if (resolvedEnv && Object.keys(resolvedEnv).length > 0) {
      entry.env = resolvedEnv
    }
    return entry
  }

  function inspectMcpOnTarget(mcpName, def, resolvedEnv, resolvedHeaders, target) {
    const effectiveDef = resolveMcpDefinitionForTarget(def)
    const managed = registry.isManagedByUs('mcp', mcpName, target.id)
    if (target.mcpFormat === 'toml') {
      if (!fs.existsSync(target.mcpConfigPath)) {
        return {
          targetId: target.id,
          targetName: target.name,
          shortLabel: target.shortLabel,
          state: 'absent',
          managed: false,
          inSync: false,
          configPath: target.mcpConfigPath,
        }
      }
      const tomlText = fs.readFileSync(target.mcpConfigPath, 'utf8')
      const parsed = parseCodexTomlMcpNames(tomlText)
      const found = parsed[mcpName]
      if (!found) {
        return {
          targetId: target.id,
          targetName: target.name,
          shortLabel: target.shortLabel,
          state: 'absent',
          managed: false,
          inSync: false,
          configPath: target.mcpConfigPath,
        }
      }
      const isOurs = managed || found.managedMarker
      const expectedBlock = effectiveDef
        ? buildCodexTomlMcpBlock(mcpName, effectiveDef, resolvedEnv, resolvedHeaders)
        : ''
      const inSync = isOurs && expectedBlock ? tomlText.includes(expectedBlock) : true
      return {
        targetId: target.id,
        targetName: target.name,
        shortLabel: target.shortLabel,
        state: isOurs ? (inSync ? 'installed' : 'drifted') : 'external',
        managed: isOurs,
        inSync,
        configPath: target.mcpConfigPath,
      }
    }

    const readRes = readJsonMcpConfig(target.mcpConfigPath)
    if (!readRes.ok) {
      return {
        targetId: target.id,
        targetName: target.name,
        shortLabel: target.shortLabel,
        state: 'broken',
        managed,
        inSync: false,
        configPath: target.mcpConfigPath,
      }
    }
    const existing = readRes.servers[mcpName]
    if (!existing) {
      return {
        targetId: target.id,
        targetName: target.name,
        shortLabel: target.shortLabel,
        state: 'absent',
        managed: false,
        inSync: false,
        configPath: target.mcpConfigPath,
      }
    }

    if (!managed) {
      return {
        targetId: target.id,
        targetName: target.name,
        shortLabel: target.shortLabel,
        state: 'external',
        managed: false,
        inSync: false,
        configPath: target.mcpConfigPath,
      }
    }

    let inSync = true
    if (effectiveDef) {
      const expected = buildJsonServerEntry(effectiveDef, resolvedEnv, resolvedHeaders)
      inSync = JSON.stringify(existing) === JSON.stringify(expected)
    }
    return {
      targetId: target.id,
      targetName: target.name,
      shortLabel: target.shortLabel,
      state: inSync ? 'installed' : 'drifted',
      managed: true,
      inSync,
      configPath: target.mcpConfigPath,
    }
  }

  function installMcpToTarget(mcpName, def, resolvedEnv, resolvedHeaders, targetId) {
    const target = getTargetById(targetId)
    if (!target) {
      return { ok: false, errorCode: 'TARGET_NOT_FOUND', message: agentMessage('agent.target.cliNotFound', { targetId }) }
    }

    const effectiveDef = resolveMcpDefinitionForTarget(def)
    const current = inspectMcpOnTarget(mcpName, effectiveDef, resolvedEnv, resolvedHeaders, target)
    if (current.state === 'external') {
      return {
        ok: false,
        errorCode: 'EXTERNAL_ITEM_PROTECTED',
        message: agentMessage('agent.target.externalMcpExists', { targetName: target.name, mcpName }),
      }
    }

    backupTargetFile(target.id, target.mcpConfigPath)

    if (target.mcpFormat === 'toml') {
      const existingToml = fs.existsSync(target.mcpConfigPath)
        ? fs.readFileSync(target.mcpConfigPath, 'utf8')
        : ''
      const cleaned = removeCodexTomlMcpBlock(existingToml, mcpName).trimEnd()
      const block = buildCodexTomlMcpBlock(mcpName, effectiveDef, resolvedEnv, resolvedHeaders)
      const nextToml = cleaned ? `${cleaned}\n\n${block}\n` : `${block}\n`
      writeFileAtomicallyRestricted(target.mcpConfigPath, nextToml)
      registry.markInstalled('mcp', mcpName, target.id)
      return {
        ok: true,
        status: inspectMcpOnTarget(mcpName, effectiveDef, resolvedEnv, resolvedHeaders, target),
      }
    }

    const readRes = readJsonMcpConfig(target.mcpConfigPath)
    if (!readRes.ok) {
      return readRes
    }
    const nextDoc = {
      ...readRes.doc,
      mcpServers: {
        ...readRes.servers,
        [mcpName]: buildJsonServerEntry(effectiveDef, resolvedEnv, resolvedHeaders),
      },
    }
    writeFileAtomicallyRestricted(target.mcpConfigPath, `${JSON.stringify(nextDoc, null, 2)}\n`)
    registry.markInstalled('mcp', mcpName, target.id)
    return {
      ok: true,
      status: inspectMcpOnTarget(mcpName, effectiveDef, resolvedEnv, resolvedHeaders, target),
    }
  }

  function uninstallMcpFromTarget(mcpName, targetId) {
    const target = getTargetById(targetId)
    if (!target) {
      return { ok: false, errorCode: 'TARGET_NOT_FOUND', message: agentMessage('agent.target.cliNotFound', { targetId }) }
    }
    const current = inspectMcpOnTarget(mcpName, null, null, null, target)
    if (current.state === 'absent') {
      registry.markUninstalled('mcp', mcpName, target.id)
      return { ok: true, status: current }
    }
    if (current.state === 'external' || !current.managed) {
      return {
        ok: false,
        errorCode: 'EXTERNAL_ITEM_PROTECTED',
        message: agentMessage('agent.target.mcpNotInstalledByTool', { targetName: target.name, mcpName }),
      }
    }

    backupTargetFile(target.id, target.mcpConfigPath)

    if (target.mcpFormat === 'toml') {
      if (fs.existsSync(target.mcpConfigPath)) {
        const existingToml = fs.readFileSync(target.mcpConfigPath, 'utf8')
        const nextToml = removeCodexTomlMcpBlock(existingToml, mcpName)
        writeFileAtomicallyRestricted(target.mcpConfigPath, nextToml)
      }
      registry.markUninstalled('mcp', mcpName, target.id)
      return {
        ok: true,
        status: inspectMcpOnTarget(mcpName, null, null, null, target),
      }
    }

    const readRes = readJsonMcpConfig(target.mcpConfigPath)
    if (!readRes.ok) return readRes
    const nextServers = { ...readRes.servers }
    delete nextServers[mcpName]
    const nextDoc = {
      ...readRes.doc,
      mcpServers: nextServers,
    }
    writeFileAtomicallyRestricted(target.mcpConfigPath, `${JSON.stringify(nextDoc, null, 2)}\n`)
    registry.markUninstalled('mcp', mcpName, target.id)
    return {
      ok: true,
      status: inspectMcpOnTarget(mcpName, null, null, null, target),
    }
  }

  function listExternalMcpServers(managedNamesSet = new Set()) {
    const externals = []
    for (const target of listTargets()) {
      if (target.mcpFormat === 'toml') {
        if (!fs.existsSync(target.mcpConfigPath)) continue
        try {
          const tomlText = fs.readFileSync(target.mcpConfigPath, 'utf8')
          const parsed = parseCodexTomlMcpNames(tomlText)
          for (const [serverName, info] of Object.entries(parsed)) {
            const isOurs = registry.isManagedByUs('mcp', serverName, target.id) || info.managedMarker
            if (!isOurs && !managedNamesSet.has(serverName)) {
              externals.push({
                name: serverName,
                targetId: target.id,
                targetName: target.name,
                configPath: target.mcpConfigPath,
              })
            }
          }
        } catch {
          // ignore unreadable toml
        }
        continue
      }

      const readRes = readJsonMcpConfig(target.mcpConfigPath)
      if (!readRes.ok) continue
      for (const serverName of Object.keys(readRes.servers)) {
        const isOurs = registry.isManagedByUs('mcp', serverName, target.id)
        if (!isOurs && !managedNamesSet.has(serverName)) {
          externals.push({
            name: serverName,
            targetId: target.id,
            targetName: target.name,
            configPath: target.mcpConfigPath,
          })
        }
      }
    }
    return externals
  }

  return {
    listTargets,
    getTargetById,
    inspectSkillOnTarget,
    installSkillToTarget,
    uninstallSkillFromTarget,
    inspectMcpOnTarget,
    installMcpToTarget,
    uninstallMcpFromTarget,
    listExternalMcpServers,
    backupTargetFile,
    restoreLatestBackup,
  }
}
