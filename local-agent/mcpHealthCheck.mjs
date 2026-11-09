import { agentMessage } from './requestI18n.mjs'
import { validateLibraryItemName } from './libraryPaths.mjs'
import { createInstallRegistry } from './installRegistry.mjs'
import { createTargetAdapters } from './targetAdapters.mjs'
import { createMcpStorage } from './mcpStorage.mjs'
import { resolveExecutableFile } from './providerAdapter.mjs'
import { createNodeI18n } from '../shared/nodeI18n.mjs'

export function buildMcpAiCheckPrompt(serverName, def, language = 'zh-TW') {
  const { locale, t } = createNodeI18n(language)
  return [
    agentMessage('agent.mcp.aiCheckPrompt', { serverName, transport: def.transport }),
    agentMessage('agent.mcp.aiCheckSecurity'),
    agentMessage('agent.mcp.aiCheckFormat'),
    `Write the human-readable detail and suggestion fields in locale ${locale}.`,
    '<mcp_check>',
    JSON.stringify(
      {
        server: serverName,
        loaded: true,
        status: 'ok',
        tools: ['example_tool'],
        detail: t('mcp.health.aiExample'),
        suggestion: '',
      },
      null,
      2,
    ),
    '</mcp_check>',
  ].join('\n')
}

export function parseMcpAiCheckOutput(rawOutput, expectedServerName, language = 'zh-TW') {
  const { t } = createNodeI18n(language)
  if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
    return {
      ok: false,
      loaded: false,
      status: 'error',
      tools: [],
      detail: t('mcp.health.aiEmpty'),
      suggestion: t('mcp.health.aiSuggestion'),
    }
  }

  const match = /<mcp_check>([\s\S]*?)<\/mcp_check>/i.exec(rawOutput)
  let jsonCandidate = match ? match[1].trim() : rawOutput.trim()
  jsonCandidate = jsonCandidate
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  try {
    const parsed = JSON.parse(jsonCandidate)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object')
    }
    const status =
      parsed.status === 'ok' || parsed.status === 'missing' || parsed.status === 'error'
        ? parsed.status
        : parsed.loaded
          ? 'ok'
          : 'missing'
    const tools = Array.isArray(parsed.tools)
      ? parsed.tools.filter((t) => typeof t === 'string').slice(0, 100)
      : []

    return {
      ok: true,
      server: typeof parsed.server === 'string' ? parsed.server : expectedServerName,
      loaded: Boolean(parsed.loaded),
      status,
      tools,
      detail: typeof parsed.detail === 'string' ? parsed.detail.slice(0, 600) : '',
      suggestion: typeof parsed.suggestion === 'string' ? parsed.suggestion.slice(0, 600) : '',
    }
  } catch {
    return {
      ok: false,
      server: expectedServerName,
      loaded: false,
      status: 'error',
      tools: [],
      detail: t('mcp.health.aiInvalid'),
      suggestion: rawOutput.slice(0, 300),
    }
  }
}

export function createMcpHealthChecker(options = {}) {
  const registry = options.registry || createInstallRegistry(options)
  const adapters = options.adapters || createTargetAdapters({ ...options, registry })
  const mcpStorage = options.mcpStorage || createMcpStorage({ ...options, registry, adapters })
  const adapterOptions = {
    ...(options.adapterOptions || {}),
    ...(options._testLibraryRoot ? { _testLibraryRoot: options._testLibraryRoot } : {}),
  }

  function runPreflightAndAutoInstall(rawServerName, autoInstall = true, language = 'zh-TW') {
    const { t } = createNodeI18n(language)
    const nameCheck = validateLibraryItemName(rawServerName)
    if (!nameCheck.ok) return nameCheck

    const raw = mcpStorage.readRawDefinition(nameCheck.value)
    if (!raw) {
      return {
        ok: false,
        errorCode: 'MCP_NOT_FOUND',
        message: t('mcp.health.notFound', { name: nameCheck.value }),
      }
    }

    const { def } = raw
    const runtime = mcpStorage.resolveRuntimeConfig(nameCheck.value, def)
    const checks = []
    let blockedByPreflight = false

    // 1. Check secrets completeness
    if (runtime.missingSecrets.length > 0) {
      blockedByPreflight = true
      checks.push({
        id: 'secrets',
        label: t('mcp.health.secrets'),
        status: 'error',
        detail: t('mcp.health.missingSecrets', { names: runtime.missingSecrets.join(', ') }),
        suggestion: t('mcp.health.secretsSuggestion'),
      })
    } else {
      checks.push({
        id: 'secrets',
        label: t('mcp.health.secrets'),
        status: 'ok',
        detail: t('mcp.health.secretsReady'),
      })
    }

    // 2. Check transport executable or URL
    if (def.transport === 'stdio') {
      const execCheck = resolveExecutableFile(def.command, adapterOptions)
      if (!execCheck.ok) {
        blockedByPreflight = true
        checks.push({
          id: 'executable',
          label: t('mcp.health.executable', { command: def.command }),
          status: 'error',
          detail: t('mcp.health.executableUnavailable', { command: def.command, code: execCheck.errorCode }),
          suggestion: t('mcp.health.executableSuggestion', { command: def.command }),
        })
      } else {
        checks.push({
          id: 'executable',
          label: t('mcp.health.executable', { command: def.command }),
          status: 'ok',
          detail: t('mcp.health.executableFound', { path: execCheck.resolvedPath }),
        })
      }
    } else {
      try {
        const u = new URL(def.url)
        checks.push({
          id: 'url',
          label: t('mcp.health.url'),
          status: 'ok',
          detail: t('mcp.health.urlValid', { origin: u.origin }),
        })
      } catch {
        blockedByPreflight = true
        checks.push({
          id: 'url',
          label: t('mcp.health.url'),
          status: 'error',
          detail: t('mcp.health.urlInvalid'),
          suggestion: t('mcp.health.urlSuggestion'),
        })
      }
    }

    // 3. Scan all providers & auto-install/repair if preflight passed
    const providerActions = []
    for (const target of adapters.listTargets()) {
      const state = adapters.inspectMcpOnTarget(
        nameCheck.value,
        def,
        runtime.resolvedEnv,
        runtime.resolvedHeaders,
        target,
      )

      if (state.state === 'installed' && state.inSync) {
        providerActions.push({
          targetId: target.id,
          targetName: target.name,
          action: 'already_installed',
          status: 'ok',
          message: t('mcp.health.alreadyInstalled'),
          configPath: target.mcpConfigPath,
        })
      } else if (state.state === 'external') {
        providerActions.push({
          targetId: target.id,
          targetName: target.name,
          action: 'skipped_external',
          status: 'warning',
          message: t('mcp.health.skippedExternal'),
          configPath: target.mcpConfigPath,
        })
      } else if (!blockedByPreflight && autoInstall) {
        const installRes = adapters.installMcpToTarget(
          nameCheck.value,
          def,
          runtime.resolvedEnv,
          runtime.resolvedHeaders,
          target.id,
        )
        if (installRes.ok) {
          providerActions.push({
            targetId: target.id,
            targetName: target.name,
            action: state.state === 'drifted' ? 'repaired' : 'installed',
            status: 'ok',
            message:
              state.state === 'drifted'
                ? t('mcp.health.repaired')
                : t('mcp.health.installed'),
            configPath: target.mcpConfigPath,
          })
        } else {
          providerActions.push({
            targetId: target.id,
            targetName: target.name,
            action: 'failed',
            status: 'error',
            message: t('mcp.health.installFailed', { code: installRes.errorCode ?? 'UNKNOWN_ERROR' }),
            configPath: target.mcpConfigPath,
          })
        }
      } else {
        providerActions.push({
          targetId: target.id,
          targetName: target.name,
          action: 'pending',
          status: 'warning',
          message: blockedByPreflight
            ? t('mcp.health.preflightBlocked')
            : t('mcp.health.notInstalled'),
          configPath: target.mcpConfigPath,
        })
      }
    }

    const overallStatus =
      blockedByPreflight || providerActions.some((a) => a.status === 'error')
        ? 'error'
        : providerActions.some((a) => a.status === 'warning')
          ? 'partial'
          : 'ok'

    const report = {
      serverName: nameCheck.value,
      checkedAt: new Date().toISOString(),
      overallStatus,
      blockedByPreflight,
      checks,
      providerActions,
      aiVerification: null,
    }

    registry.saveLastCheck('mcp', nameCheck.value, report)
    return {
      ok: true,
      report,
      server: mcpStorage.getMcpServer(nameCheck.value).server,
    }
  }

  function attachAiCheckResult(serverName, aiResult) {
    const prev = registry.getLastCheck('mcp', serverName) || {
      serverName,
      checkedAt: new Date().toISOString(),
      overallStatus: 'ok',
      blockedByPreflight: false,
      checks: [],
      providerActions: [],
    }
    const updated = {
      ...prev,
      checkedAt: new Date().toISOString(),
      aiVerification: aiResult,
    }
    registry.saveLastCheck('mcp', serverName, updated)
    return updated
  }

  return {
    runPreflightAndAutoInstall,
    attachAiCheckResult,
  }
}
