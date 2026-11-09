import { useEffect, useMemo, useState } from 'react'
import type { ProviderSummary, SkillDocument } from '../../shared/types/domain'
import { StatusBadge } from '../../shared/components/StatusBadge'
import { AiAssistPanel } from '../../shared/components/AiAssistPanel'
import { useProviderModelSelection } from '../../shared/providers/useProviderModelSelection'
import { useI18n } from '../../shared/i18n'
import type { SkillServiceContract } from './skillClient'
import { useSkills } from './useSkills'
import './SkillsPage.css'

export interface SkillAssistDraft {
  name: string
  description: string
  body: string
  content: string
  files?: Array<{ path: string; content: string }>
}

export interface SkillsPageProps {
  providers: ProviderSummary[]
  skillService?: SkillServiceContract
  fetcher?: typeof fetch
}

export function SkillsPage({ providers, skillService, fetcher = fetch }: SkillsPageProps) {
  const { t } = useI18n()
  const {
    client,
    skills,
    libraryPath,
    isLoading,
    isBusy,
    feedback,
    clearFeedback,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleTarget,
    checkAndRepairSkill,
    saveSupportingFile,
    removeSupportingFile,
  } = useSkills(skillService)

  const modelSelection = useProviderModelSelection()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [isCreateMode, setIsCreateMode] = useState(false)

  // Editor form state
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [pendingExtraFiles, setPendingExtraFiles] = useState<Array<{ path: string; content: string }>>([])
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  // Supporting file editor state
  const [activeSubFile, setActiveSubFile] = useState<{ path: string; content: string; isNew?: boolean } | null>(null)

  const filteredSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    )
  }, [skills, searchQuery])

  const selectedSkill: SkillDocument | null = useMemo(() => {
    if (isCreateMode) return null
    if (selectedName) {
      return skills.find((s) => s.name === selectedName) ?? null
    }
    return skills[0] ?? null
  }, [isCreateMode, selectedName, skills])

  useEffect(() => {
    if (isCreateMode) return
    if (selectedSkill) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedName(selectedSkill.name)
      setDraftName(selectedSkill.name)
      setDraftDescription(selectedSkill.description)
      setDraftBody(selectedSkill.body ?? '')
      setPendingExtraFiles([])
      setActiveSubFile(null)
    } else if (skills.length === 0 && !isLoading) {
      setDraftName('')
      setDraftDescription('')
      setDraftBody('')
    }
  }, [selectedSkill, isCreateMode, skills.length, isLoading])

  const handleStartCreate = () => {
    clearFeedback()
    setIsCreateMode(true)
    setSelectedName(null)
    setDraftName('new-skill')
    setDraftDescription('')
    setDraftBody('# new-skill\n\n## Instructions\n\n- ')
    setPendingExtraFiles([])
    setActiveSubFile(null)
    setViewMode('edit')
  }

  const handleSelectSkill = (skill: SkillDocument) => {
    clearFeedback()
    setIsCreateMode(false)
    setSelectedName(skill.name)
    setConfirmDeleteOpen(false)
    setActiveSubFile(null)
    setViewMode('preview')
  }

  const handleSave = async () => {
    if (isCreateMode || !selectedSkill) {
      const created = await createSkill({
        name: draftName,
        description: draftDescription,
        body: draftBody,
        files: pendingExtraFiles,
      })
      if (created) {
        setIsCreateMode(false)
        setSelectedName(created.name)
        setPendingExtraFiles([])
      }
      return
    }

    const updated = await updateSkill(selectedSkill.name, {
      newName: draftName,
      description: draftDescription,
      body: draftBody,
    })
    if (updated) {
      setSelectedName(updated.name)
    }
  }

  const handleConfirmDelete = async () => {
    if (!selectedSkill) return
    const ok = await deleteSkill(selectedSkill.name)
    setConfirmDeleteOpen(false)
    if (ok) {
      setSelectedName(null)
    }
  }

  const handleOpenSubFile = async (relPath: string) => {
    if (!selectedSkill) return
    try {
      const file = await client.getFile(selectedSkill.name, relPath)
      setActiveSubFile({ path: file.path, content: file.content ?? '', isNew: false })
    } catch {
      // ignore
    }
  }

  const handleSaveSubFile = async () => {
    if (!activeSubFile || !selectedSkill) return
    const updated = await saveSupportingFile(
      selectedSkill.name,
      activeSubFile.path,
      activeSubFile.content,
    )
    if (updated) {
      setActiveSubFile(null)
    }
  }

  return (
    <div className="sd-library-page" data-testid="skills-page">
      <header className="sd-library-page__header">
        <div>
          <h1 className="sd-library-page__title">{t('skills.pageTitle')}</h1>
          <p className="sd-library-page__subtitle">
            {t('skills.pageSubtitle')} <code>{libraryPath}</code>
          </p>
        </div>
        <div className="sd-library-page__header-actions">
          <StatusBadge label={`LOCKED: /library/skills`} tone="ok" mono />
          <button
            type="button"
            className="sd-library-page__primary-btn"
            onClick={handleStartCreate}
          >
            ＋ {t('skills.createNewSkill')}
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
        {/* Left column: Skill list */}
        <section className="sd-library-page__list-pane" aria-label={t('skills.listLabel')}>
          <div className="sd-library-page__search-row">
            <input
              type="search"
              className="sd-library-page__search-input"
              placeholder={t('skills.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="sd-library-page__empty">{t('common.loading')}</div>
          ) : filteredSkills.length === 0 ? (
            <div className="sd-library-page__empty">
              <p>{t('skills.emptyStateText')}</p>
              <button
                type="button"
                className="sd-library-page__primary-btn"
                onClick={handleStartCreate}
              >
                ＋ {t('skills.createFirstSkill')}
              </button>
            </div>
          ) : (
            <ul className="sd-library-page__item-list">
              {filteredSkills.map((skill) => {
                const isSelected = !isCreateMode && selectedSkill?.name === skill.name
                return (
                  <li key={skill.name}>
                    <button
                      type="button"
                      className={`sd-library-page__item-btn ${isSelected ? 'is-active' : ''}`}
                      onClick={() => handleSelectSkill(skill)}
                    >
                      <div className="sd-library-page__item-top">
                        <strong className="sd-library-page__item-name">{skill.name}</strong>
                        <div className="sd-library-page__target-dots">
                          {skill.targets.map((target) => (
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
                      <span className="sd-library-page__item-desc">{skill.description}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Center column: CRUD Editor */}
        <section className="sd-library-page__editor-pane" aria-label={t('skills.editorLabel')}>
          {isCreateMode || selectedSkill ? (
            <>
              <div className="sd-library-page__editor-head">
                <h2>
                  {isCreateMode
                    ? t('skills.creatingSkillTitle')
                    : `${t(viewMode === 'edit' ? 'skills.editingSkillTitle' : 'skills.viewingSkillTitle')}：${selectedSkill?.name}`}
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
                    onClick={() => {
                      setViewMode('preview')
                      setActiveSubFile(null)
                    }}
                  >
                    {t('common.preview')}
                  </button>
                </div>
              </div>

              <div className="sd-library-page__field-group">
                <label className="sd-library-page__field-label" htmlFor="skill-name-input">
                  {t('skills.skillNameLabel')}
                </label>
                {viewMode === 'edit' ? (
                  <input
                    id="skill-name-input"
                    type="text"
                    className="sd-library-page__input"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="code-review"
                  />
                ) : (
                  <div className="sd-library-page__readonly-value">{draftName}</div>
                )}
              </div>

              <div className="sd-library-page__field-group">
                <label className="sd-library-page__field-label" htmlFor="skill-desc-input">
                  {t('skills.skillDescLabel')}
                </label>
                {viewMode === 'edit' ? (
                  <input
                    id="skill-desc-input"
                    type="text"
                    className="sd-library-page__input"
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    placeholder={t('skills.skillDescPlaceholder')}
                  />
                ) : (
                  <div className="sd-library-page__readonly-value">{draftDescription}</div>
                )}
              </div>

              <div className="sd-library-page__field-group">
                <label className="sd-library-page__field-label" htmlFor="skill-body-textarea">
                  SKILL.md {t('skills.markdownBodyLabel')}
                </label>
                {viewMode === 'edit' ? (
                  <textarea
                    id="skill-body-textarea"
                    className="sd-library-page__code-textarea"
                    rows={12}
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                  />
                ) : (
                  <pre className="sd-library-page__markdown-preview">
                    {`---\nname: ${draftName}\ndescription: ${draftDescription}\n---\n\n${draftBody}`}
                  </pre>
                )}
              </div>

              {/* Supporting files section */}
              {!isCreateMode && selectedSkill ? (
                <div className="sd-library-page__subfiles">
                  <div className="sd-library-page__subfiles-head">
                    <strong>{t('skills.supportingFilesTitle')}</strong>
                    {viewMode === 'edit' ? (
                      <button
                        type="button"
                        className="sd-library-page__mini-btn"
                        onClick={() =>
                          setActiveSubFile({
                            path: 'scripts/helper.sh',
                            content: '#!/usr/bin/env bash\n',
                            isNew: true,
                          })
                        }
                      >
                        ＋ {t('skills.addSupportingFile')}
                      </button>
                    ) : null}
                  </div>
                  {selectedSkill.files.length === 0 ? (
                    <p className="sd-library-page__muted">{t('skills.noSupportingFiles')}</p>
                  ) : (
                    <ul className="sd-library-page__subfile-list">
                      {selectedSkill.files.map((f) => (
                        <li key={f.path} className="sd-library-page__subfile-item">
                          <code>{f.path}</code>
                          <span>{f.sizeBytes} B</span>
                          {viewMode === 'edit' ? (
                            <div className="sd-library-page__subfile-actions">
                              <button
                                type="button"
                                className="sd-library-page__mini-btn"
                                onClick={() => void handleOpenSubFile(f.path)}
                              >
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                className="sd-library-page__mini-btn sd-library-page__mini-btn--danger"
                                onClick={() => void removeSupportingFile(selectedSkill.name, f.path)}
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}

                  {activeSubFile && viewMode === 'edit' ? (
                    <div className="sd-library-page__subfile-editor">
                      <label className="sd-library-page__field-label">
                        {t('skills.relativeFilePathLabel')}
                        <input
                          type="text"
                          className="sd-library-page__input"
                          value={activeSubFile.path}
                          disabled={!activeSubFile.isNew}
                          onChange={(e) =>
                            setActiveSubFile({ ...activeSubFile, path: e.target.value })
                          }
                        />
                      </label>
                      <textarea
                        className="sd-library-page__code-textarea"
                        rows={6}
                        value={activeSubFile.content}
                        onChange={(e) =>
                          setActiveSubFile({ ...activeSubFile, content: e.target.value })
                        }
                      />
                      <div className="sd-library-page__subfile-actions">
                        <button
                          type="button"
                          className="sd-library-page__primary-btn"
                          onClick={() => void handleSaveSubFile()}
                        >
                          {t('skills.saveSubFile')}
                        </button>
                        <button
                          type="button"
                          className="sd-library-page__secondary-btn"
                          onClick={() => setActiveSubFile(null)}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Target installation & Auto-check section */}
              {!isCreateMode && selectedSkill ? (
                <div className="sd-library-page__install-box">
                  <div className="sd-library-page__install-head">
                    <strong>{t('skills.cliTargetsTitle')}</strong>
                    <button
                      type="button"
                      className="sd-library-page__check-btn"
                      disabled={isBusy}
                      onClick={() => void checkAndRepairSkill(selectedSkill.name)}
                    >
                      🩺 {t('library.checkAndAutoInstallAll')}
                    </button>
                  </div>
                  <div className="sd-library-page__targets-grid">
                    {selectedSkill.targets.map((target) => {
                      const isInstalled = target.state === 'installed'
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
                                selectedSkill.name,
                                target.targetId,
                                e.target.checked,
                              )
                            }
                          />
                          <div className="sd-library-page__target-info">
                            <strong>{target.targetName}</strong>
                            <span>
                              {isInstalled
                                ? t('library.stateInstalled')
                                : isExternal
                                  ? t('library.stateExternal')
                                  : target.state === 'broken'
                                    ? t('library.stateBroken')
                                    : t('library.stateAbsent')}
                            </span>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {selectedSkill.lastCheck ? (
                    <div className="sd-library-page__check-report" role="region" aria-label={t('library.checkReportTitle')}>
                      <div className="sd-library-page__check-report-head">
                        <strong>{t('library.checkReportTitle')}</strong>
                        <span>{new Date(selectedSkill.lastCheck.checkedAt).toLocaleString()}</span>
                      </div>
                      <ul>
                        {selectedSkill.lastCheck.actions.map((act) => (
                          <li key={act.targetId}>
                            <strong>{act.targetName}：</strong> {act.message}
                          </li>
                        ))}
                      </ul>
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
                      {isCreateMode ? t('skills.createAndSave') : t('common.saveChanges')}
                    </button>
                  ) : null}
                  {isCreateMode && skills.length > 0 ? (
                    <button
                      type="button"
                      className="sd-library-page__secondary-btn"
                      onClick={() => setIsCreateMode(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  ) : null}
                </div>

                {!isCreateMode && selectedSkill ? (
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
                      <div className="sd-library-page__confirm-inline" role="alertdialog" aria-label={t('skills.confirmDeleteTitle')}>
                        <span>{t('skills.confirmDeleteText', { name: selectedSkill.name })}</span>
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
              <p>{t('skills.selectOrCreatePrompt')}</p>
              <button
                type="button"
                className="sd-library-page__primary-btn"
                onClick={handleStartCreate}
              >
                ＋ {t('skills.createFirstSkill')}
              </button>
            </div>
          )}
        </section>

        {/* Right column: AI Provider Assist Panel */}
        <AiAssistPanel<SkillAssistDraft>
          kind="skill"
          mode={isCreateMode || !selectedSkill ? 'create' : 'edit'}
          itemName={draftName}
          itemDescription={draftDescription}
          currentContent={
            selectedSkill
              ? `---\nname: ${draftName}\ndescription: ${draftDescription}\n---\n\n${draftBody}`
              : ''
          }
          fixedLibraryPathLabel="/super_developer/library/skills"
          providers={providers}
          modelSelection={modelSelection}
          defaultInstructionPlaceholder={t('skills.aiInstructionPlaceholder')}
          fetcher={fetcher}
          renderDraftPreview={(draft) => (
            <div>
              <p>
                <strong>{draft.name}</strong> — {draft.description}
              </p>
              <pre>{draft.content}</pre>
            </div>
          )}
          onApplyDraft={(draft) => {
            setDraftName(draft.name)
            setDraftDescription(draft.description)
            setDraftBody(draft.body)
            if (draft.files && draft.files.length > 0) {
              setPendingExtraFiles(draft.files)
            }
          }}
        />
      </div>
    </div>
  )
}
