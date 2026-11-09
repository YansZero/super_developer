import { useEffect, useMemo, useState } from 'react'
import type { McpServerDocument, ProviderSummary } from '../../shared/types/domain'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { AiAssistPanel } from '../../shared/components/AiAssistPanel'
import { useProviderModelSelection } from '../../shared/providers/useProviderModelSelection'
import { useI18n } from '../../shared/i18n'
import type { McpServiceContract } from './mcpClient'
import { useMcpServers } from './useMcpServers'
import '../skills/SkillsPage.css'

export interface McpAssistDraft {
  name: string
  description: string
  transport: 'stdio' | 'http'
  command: string | null
  args: string[]
  url: string | null
  env: Record<string, string>
  headers: Record<string, string>
  secretEnv: Record<string, string>
  secretHeaders: Record<string, string>
  warnings?: string[]
}

export interface McpPageProps {
  providers: ProviderSummary[]
  mcpService?: McpServiceContract
  fetcher?: typeof fetch
}

interface KeyValuePair {
  key: string
  value: string
}

function recordToPairs(rec: Record<string, string> | undefined): KeyValuePair[] {
  if (!rec) return []
  return Object.entries(rec).map(([key, value]) => ({ key, value }))
}

function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of pairs) {
    const k = p.key.trim()
    if (k) out[k] = p.value
  }
  return out
}

export function McpPage({ providers, mcpService, fetcher = fetch }: McpPageProps) {
  const { t } = useI18n()
  const {
    servers,
    externalServers,
    libraryPath,
    isLoading,
    isBusy,
    feedback,
    activeCheckJob,
    clearFeedback,
    createServer,
    updateServer,
    deleteServer,
    toggleTarget,
    runCheckAndAutoInstall,
  } = useMcpServers(mcpService)

  const modelSelection = useProviderModelSelection()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Form fields
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftTransport, setDraftTransport] = useState<'stdio' | 'http'>('stdio')
  const [draftCommand, setDraftCommand] = useState('npx')
  const [draftArgsText, setDraftArgsText] = useState('')
  const [draftUrl, setDraftUrl] = useState('')
  const [envPairs, setEnvPairs] = useState<KeyValuePair[]>([])
  const [secretEnvPairs, setSecretEnvPairs] = useState<KeyValuePair[]>([])
  const [headerPairs, setHeaderPairs] = useState<KeyValuePair[]>([])
  const [secretHeaderPairs, setSecretHeaderPairs] = useState<KeyValuePair[]>([])

  const filteredServers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return servers
    return servers.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
  }, [servers, searchQuery])

  const selectedServer: McpServerDocument | null = useMemo(() => {
    if (isCreateMode) return null
    if (selectedName) {
      return servers.find((s) => s.name === selectedName) ?? null
    }
    return servers[0] ?? null
  }, [isCreateMode, selectedName, servers])

  useEffect(() => {
    if (isCreateMode) return
    if (selectedServer) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedName(selectedServer.name)
      setDraftName(selectedServer.name)
      setDraftDescription(selectedServer.description)
      setDraftTransport(selectedServer.transport)
      setDraftCommand(selectedServer.command ?? 'npx')
      setDraftArgsText((selectedServer.args ?? []).join(' '))
      setDraftUrl(selectedServer.url ?? '')
      setEnvPairs(recordToPairs(selectedServer.env))
      setSecretEnvPairs(recordToPairs(selectedServer.secretEnv))
      setHeaderPairs(recordToPairs(selectedServer.headers))
      setSecretHeaderPairs(recordToPairs(selectedServer.secretHeaders))
    } else if (servers.length === 0 && !isLoading) {
      setDraftName('')
      setDraftDescription('')
    }
  }, [selectedServer, isCreateMode, servers.length, isLoading])

  const handleStartCreate = () => {
    clearFeedback()
    setIsCreateMode(true)
    setSelectedName(null)
    setConfirmDeleteOpen(false)
    setViewMode('edit')
    setDraftName('new-mcp')
    setDraftDescription('')
    setDraftTransport('stdio')
    setDraftCommand('npx')
    setDraftArgsText('-y @modelcontextprotocol/server-everything')
    setDraftUrl('')
    setEnvPairs([])
    setSecretEnvPairs([])
    setHeaderPairs([])
    setSecretHeaderPairs([])
  }

  const handleSelectServer = (srv: McpServerDocument) => {
    clearFeedback()
    setIsCreateMode(false)
    setSelectedName(srv.name)
    setConfirmDeleteOpen(false)
    setViewMode('preview')
  }

  const handleSave = async () => {
    const parsedArgs = draftArgsText
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)

    const payload = {
      name: draftName,
      newName: draftName,
      description: draftDescription,
      transport: draftTransport,
      command: draftTransport === 'stdio' ? draftCommand : null,
      args: draftTransport === 'stdio' ? parsedArgs : [],
      url: draftTransport === 'http' ? draftUrl : null,
      env: pairsToRecord(envPairs),
      secretEnv: pairsToRecord(secretEnvPairs),
      headers: pairsToRecord(headerPairs),
      secretHeaders: pairsToRecord(secretHeaderPairs),
    }

    if (isCreateMode || !selectedServer) {
      const created = await createServer(payload)
      if (created) {
        setIsCreateMode(false)
        setSelectedName(created.name)
      }
      return
    }

    const updated = await updateServer(selectedServer.name, payload)
    if (updated) {
      setSelectedName(updated.name)
    }
  }

  const handleConfirmDelete = async () => {
    if (!selectedServer) return
    const ok = await deleteServer(selectedServer.name)
    setConfirmDeleteOpen(false)
    if (ok) {
      setSelectedName(null)
    }
  }

  const handleRunCheck = async () => {
    if (!selectedServer) return
    await runCheckAndAutoInstall(selectedServer.name, {
      providerId: modelSelection.selectedProviderId,
      modelId: modelSelection.selectedModelId,
      effort: modelSelection.selectedEffort,
    })
  }

  const renderKvEditor = (
    title: string,
    pairs: KeyValuePair[],
    setPairs: (next: KeyValuePair[]) => void,
    isSecret = false,
  ) => {
    if (viewMode === 'preview') {
      return (
        <div className="sd-library-page__field-group">
          <span className="sd-library-page__field-label">{title}</span>
          <div className="sd-library-page__readonly-value">
            {pairs.length > 0 ? pairs.map((pair) => `${pair.key}=${isSecret ? '••••' : pair.value}`).join('\n') : '—'}
          </div>
        </div>
      )
    }
    return (
      <div className="sd-library-page__field-group">
        <div className="sd-library-page__subfiles-head">
          <span className="sd-library-page__field-label">{title}</span>
          <button
            type="button"
            className="sd-library-page__mini-btn"
            onClick={() => setPairs([...pairs, { key: '', value: '' }])}
          >
            ＋ {t('common.add')}
          </button>
        </div>
        {pairs.map((pair, idx) => (
          <div key={idx} className="sd-library-page__kv-row">
            <input
              type="text"
              className="sd-library-page__input"
              placeholder="KEY"
              value={pair.key}
              onChange={(e) => {
                const next = [...pairs]
                next[idx] = { ...pair, key: e.target.value }
                setPairs(next)
              }}
            />
            <input
              type={isSecret ? 'password' : 'text'}
              className="sd-library-page__input"
              placeholder={isSecret ? '•••• (Stored in .secrets.json)' : 'Value'}
              value={pair.value}
              onChange={(e) => {
                const next = [...pairs]
                next[idx] = { ...pair, value: e.target.value }
                setPairs(next)
              }}
            />
            <button
              type="button"
              className="sd-library-page__mini-btn sd-library-page__mini-btn--danger"
              onClick={() => setPairs(pairs.filter((_, i) => i !== idx))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="sd-library-page sd-mcp-page" data-testid="mcp-page">
      <header className="sd-library-page__header">
        <div>
          <h1 className="sd-library-page__title">{t('mcp.pageTitle')}</h1>
          <p className="sd-library-page__subtitle">
            {t('mcp.pageSubtitle')} <code>{libraryPath}</code>
          </p>
        </div>
        <div className="sd-library-page__header-actions">
          <StatusBadge label={`LOCKED: /library/mcps`} tone="ok" mono />
          <button
            type="button"
            className="sd-library-page__primary-btn"
            onClick={handleStartCreate}
          >
            ＋ {t('mcp.createNewMcp')}
          </button>
        </div>
      </header>

      {feedback ? (
        <div
          className={`sd-library-page__banner sd-library-page__banner--${feedback.tone}`}
          role="status"
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={clearFeedback} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
      ) : null}

      <div className="sd-library-page__grid">
        {/* Left column: MCP server list + External list */}
        <section className="sd-library-page__list-pane" aria-label={t('mcp.listLabel')}>
          <div className="sd-library-page__search-row">
            <input
              type="search"
              className="sd-library-page__search-input"
              placeholder={t('mcp.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="sd-library-page__empty">{t('common.loading')}</div>
          ) : filteredServers.length === 0 ? (
            <div className="sd-library-page__empty">
              <p>{t('mcp.emptyStateText')}</p>
              <button
                type="button"
                className="sd-library-page__primary-btn"
                onClick={handleStartCreate}
              >
                ＋ {t('mcp.createFirstMcp')}
              </button>
            </div>
          ) : (
            <ul className="sd-library-page__item-list">
              {filteredServers.map((srv) => {
                const isSelected = !isCreateMode && selectedServer?.name === srv.name
                return (
                  <li key={srv.name}>
                    <button
                      type="button"
                      className={`sd-library-page__item-btn ${isSelected ? 'is-active' : ''}`}
                      onClick={() => handleSelectServer(srv)}
                    >
                      <div className="sd-library-page__item-top">
                        <strong className="sd-library-page__item-name">{srv.name}</strong>
                        <div className="sd-library-page__target-dots">
                          {srv.targets.map((target) => (
                            <span
                              key={target.targetId}
                              className={`sd-library-page__dot is-${target.state}`}
                              title={`${target.targetName}: ${target.state}`}
                            >
                              {target.shortLabel}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="sd-library-page__item-desc">
                        [{srv.transport}] {srv.description}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {externalServers.length > 0 ? (
            <div className="sd-library-page__subfiles">
              <strong>{t('mcp.externalUnmanagedTitle')}</strong>
              <ul className="sd-library-page__subfile-list">
                {externalServers.map((ext, i) => (
                  <li key={`${ext.targetId}-${ext.name}-${i}`} className="sd-library-page__subfile-item sd-mcp-page__external-item">
                    <span className="sd-mcp-page__external-info">
                      <strong>{ext.name}</strong> ({ext.targetName})
                    </span>
                    <StatusBadge label={t('library.stateExternal')} tone="neutral" />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {/* Center column: MCP Editor + Check & Auto-Install */}
        <section className="sd-library-page__editor-pane" aria-label={t('mcp.editorLabel')}>
          {isCreateMode || selectedServer ? (
            <>
              <div className="sd-library-page__editor-head">
                <h2>
                  {isCreateMode
                    ? t('mcp.creatingMcpTitle')
                    : `${t(viewMode === 'edit' ? 'mcp.editingMcpTitle' : 'mcp.viewingMcpTitle')}：${selectedServer?.name}`}
                </h2>
                <div className="sd-library-page__editor-tabs">
                  <button
                    type="button"
                    className={viewMode === 'edit' ? 'is-active' : ''}
                    onClick={() => setViewMode('edit')}
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    className={viewMode === 'preview' ? 'is-active' : ''}
                    onClick={() => setViewMode('preview')}
                  >
                    {t('common.preview')}
                  </button>
                </div>
              </div>

              <div className="sd-library-page__field-group">
                <label className="sd-library-page__field-label" htmlFor="mcp-name-input">
                  {t('mcp.serverNameLabel')}
                </label>
                {viewMode === 'edit' ? (
                  <input
                    id="mcp-name-input"
                    type="text"
                    className="sd-library-page__input"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="github"
                  />
                ) : (
                  <div className="sd-library-page__readonly-value">{draftName}</div>
                )}
              </div>

              <div className="sd-library-page__field-group">
                <label className="sd-library-page__field-label" htmlFor="mcp-desc-input">
                  {t('mcp.serverDescLabel')}
                </label>
                {viewMode === 'edit' ? (
                  <input
                    id="mcp-desc-input"
                    type="text"
                    className="sd-library-page__input"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder={t('mcp.serverDescPlaceholder')}
                  />
                ) : (
                  <div className="sd-library-page__readonly-value">{draftDescription}</div>
                )}
              </div>

              <div className="sd-library-page__field-group">
                <label className="sd-library-page__field-label" htmlFor="mcp-transport-select">
                  Transport：
                </label>
                {viewMode === 'edit' ? (
                  <select
                    id="mcp-transport-select"
                    className="sd-library-page__select"
                    value={draftTransport}
                    onChange={(e) => setDraftTransport(e.target.value as 'stdio' | 'http')}
                  >
                    <option value="stdio">stdio (Command / Args)</option>
                    <option value="http">http (Remote URL / Headers)</option>
                  </select>
                ) : (
                  <div className="sd-library-page__readonly-value">{draftTransport}</div>
                )}
              </div>

              {draftTransport === 'stdio' ? (
                <>
                  <div className="sd-library-page__field-group">
                    <label className="sd-library-page__field-label" htmlFor="mcp-command-input">
                      Command：
                    </label>
                    {viewMode === 'edit' ? (
                      <input
                        id="mcp-command-input"
                        type="text"
                        className="sd-library-page__input"
                        value={draftCommand}
                        onChange={(e) => setDraftCommand(e.target.value)}
                        placeholder="npx"
                      />
                    ) : (
                      <div className="sd-library-page__readonly-value">{draftCommand}</div>
                    )}
                  </div>
                  <div className="sd-library-page__field-group">
                    <label className="sd-library-page__field-label" htmlFor="mcp-args-input">
                      Args（以空白分隔）：
                    </label>
                    {viewMode === 'edit' ? (
                      <input
                        id="mcp-args-input"
                        type="text"
                        className="sd-library-page__input"
                        value={draftArgsText}
                        onChange={(e) => setDraftArgsText(e.target.value)}
                        placeholder="-y @modelcontextprotocol/server-github"
                      />
                    ) : (
                      <div className="sd-library-page__readonly-value">{draftArgsText || '—'}</div>
                    )}
                  </div>
                  {renderKvEditor(t('mcp.plainEnvLabel'), envPairs, setEnvPairs, false)}
                  {renderKvEditor(t('mcp.secretEnvLabel'), secretEnvPairs, setSecretEnvPairs, true)}
                </>
              ) : (
                <>
                  <div className="sd-library-page__field-group">
                    <label className="sd-library-page__field-label" htmlFor="mcp-url-input">
                      Endpoint URL：
                    </label>
                    {viewMode === 'edit' ? (
                      <input
                        id="mcp-url-input"
                        type="url"
                        className="sd-library-page__input"
                        value={draftUrl}
                        onChange={(e) => setDraftUrl(e.target.value)}
                        placeholder="https://example.com/mcp"
                      />
                    ) : (
                      <div className="sd-library-page__readonly-value">{draftUrl || '—'}</div>
                    )}
                  </div>
                  {renderKvEditor(t('mcp.plainHeadersLabel'), headerPairs, setHeaderPairs, false)}
                  {renderKvEditor(
                    t('mcp.secretHeadersLabel'),
                    secretHeaderPairs,
                    setSecretHeaderPairs,
                    true,
                  )}
                </>
              )}

              {/* Target installation & Auto-check button */}
              {!isCreateMode && selectedServer ? (
                <div className="sd-library-page__install-box">
                  <div className="sd-library-page__install-head">
                    <strong>{t('mcp.cliTargetsTitle')}</strong>
                    <button
                      type="button"
                      className="sd-library-page__check-btn"
                      disabled={isBusy || Boolean(activeCheckJob)}
                      onClick={() => void handleRunCheck()}
                    >
                      🩺 {t('library.checkAndAutoInstallAll')}
                    </button>
                  </div>

                  <div className="sd-library-page__targets-grid">
                    {selectedServer.targets.map((target) => {
                      const isInstalled = target.state === 'installed' || target.state === 'drifted'
                      const isExternal = target.state === 'external'
                      return (
                        <label
                          key={target.targetId}
                          className={`sd-library-page__target-card is-${target.state}`}
                        >
                          <input
                            type="checkbox"
                            checked={isInstalled}
                            disabled={isBusy || isExternal}
                            onChange={(e) =>
                              void toggleTarget(
                                selectedServer.name,
                                target.targetId,
                                e.target.checked,
                              )
                            }
                          />
                          <div className="sd-library-page__target-info">
                            <strong>{target.targetName}</strong>
                            <span>
                              {target.state === 'installed'
                                ? t('library.stateInstalled')
                                : target.state === 'drifted'
                                  ? t('library.stateDrifted')
                                  : isExternal
                                    ? t('library.stateExternal')
                                    : t('library.stateAbsent')}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {selectedServer.lastCheck ? (
                    <div
                      className="sd-library-page__check-report"
                      role="region"
                      aria-label={t('library.checkReportTitle')}
                    >
                      <div className="sd-library-page__check-report-head">
                        <strong>{t('library.checkReportTitle')}</strong>
                        <span>{new Date(selectedServer.lastCheck.checkedAt).toLocaleString()}</span>
                      </div>
                      <ul>
                        {selectedServer.lastCheck.checks.map((c) => (
                          <li key={c.id}>
                            {c.status === 'ok' ? '✅' : '❌'} <strong>{c.label}：</strong>
                            {c.detail}
                            {c.suggestion ? ` (${c.suggestion})` : ''}
                          </li>
                        ))}
                        {selectedServer.lastCheck.providerActions.map((act) => (
                          <li key={act.targetId}>
                            {act.status === 'ok' ? '✅' : act.status === 'warning' ? '⚠️' : '❌'}{' '}
                            <strong>{act.targetName}：</strong> {act.message}
                          </li>
                        ))}
                      </ul>
                      {selectedServer.lastCheck.aiVerification ? (
                        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed #cbd5e1' }}>
                          <strong>
                            AI ({selectedServer.lastCheck.aiVerification.providerId})：
                          </strong>{' '}
                          {selectedServer.lastCheck.aiVerification.detail}
                          {selectedServer.lastCheck.aiVerification.tools.length > 0 ? (
                            <div>
                              Tools: <code>{selectedServer.lastCheck.aiVerification.tools.join(', ')}</code>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="sd-library-page__footer-actions">
                <div className="sd-library-page__footer-left">
                  {viewMode === 'edit' ? (
                    <button
                      type="button"
                      className="sd-library-page__primary-btn"
                      disabled={isBusy}
                      onClick={() => void handleSave()}
                    >
                      {isCreateMode ? t('mcp.createAndSave') : t('common.saveChanges')}
                    </button>
                  ) : null}
                  {isCreateMode && servers.length > 0 ? (
                    <button
                      type="button"
                      className="sd-library-page__secondary-btn"
                      onClick={() => setIsCreateMode(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  ) : null}
                </div>

                {!isCreateMode && selectedServer ? (
                  <div className="sd-library-page__footer-right">
                    {!confirmDeleteOpen ? (
                      <button
                        type="button"
                        className="sd-library-page__danger-btn"
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteOpen(true)}
                      >
                        {t('common.delete')}
                      </button>
                    ) : (
                      <div
                        className="sd-library-page__confirm-inline"
                        role="alertdialog"
                        aria-label={t('mcp.confirmDeleteTitle')}
                      >
                        <span>{t('mcp.confirmDeleteText', { name: selectedServer.name })}</span>
                        <button
                          type="button"
                          className="sd-library-page__danger-btn"
                          onClick={() => void handleConfirmDelete()}
                        >
                          {t('common.confirmDelete')}
                        </button>
                        <button
                          type="button"
                          className="sd-library-page__secondary-btn"
                          onClick={() => setConfirmDeleteOpen(false)}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="sd-library-page__empty">
              <p>{t('mcp.selectOrCreatePrompt')}</p>
              <button
                type="button"
                className="sd-library-page__primary-btn"
                onClick={handleStartCreate}
              >
                ＋ {t('mcp.createFirstMcp')}
              </button>
            </div>
          )}
        </section>

        {/* Right column: AI Provider Assist Panel */}
        <AiAssistPanel<McpAssistDraft>
          kind="mcp"
          mode={isCreateMode || !selectedServer ? 'create' : 'edit'}
          itemName={draftName}
          itemDescription={draftDescription}
          fixedLibraryPathLabel="/super_developer/library/mcps"
          providers={providers}
          modelSelection={modelSelection}
          defaultInstructionPlaceholder={t('mcp.aiInstructionPlaceholder')}
          fetcher={fetcher}
          renderDraftPreview={(draft) => (
            <div>
              <p>
                <strong>{draft.name}</strong> ({draft.transport}) — {draft.description}
              </p>
              {draft.warnings && draft.warnings.length > 0 ? (
                <ul>
                  {draft.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <pre>{JSON.stringify(draft, null, 2)}</pre>
            </div>
          )}
          onApplyDraft={(draft) => {
            setDraftName(draft.name)
            setDraftDescription(draft.description)
            setDraftTransport(draft.transport)
            if (draft.transport === 'stdio') {
              setDraftCommand(draft.command || 'npx')
              setDraftArgsText((draft.args || []).join(' '))
            } else {
              setDraftUrl(draft.url || '')
            }
            setEnvPairs(recordToPairs(draft.env))
            setSecretEnvPairs(recordToPairs(draft.secretEnv))
            setHeaderPairs(recordToPairs(draft.headers))
            setSecretHeaderPairs(recordToPairs(draft.secretHeaders))
          }}
        />
      </div>
    </div>
  )
}
