import { useEffect, useState } from 'react'
import type { GitHubProjectRepoMapping, ProjectItem } from '../../../shared/types/domain'
import { StatusBadge } from '../../../shared/components/StatusBadge'
import type { GitServiceContract } from './gitClient'
import { useGitOperations } from './hooks/useGitOperations'
import './ProjectGitOperationsPage.css'
import { useI18n } from '../../../shared/i18n'

interface Props {
  project: ProjectItem
  mappedGitHubRepo?: GitHubProjectRepoMapping | null
  gitService?: GitServiceContract
}

const COMMANDS = [
  { command: 'status', label: 'git.status' },
  { command: 'fetch', label: 'git.fetch' },
  { command: 'pull', label: 'git.pull' },
  { command: 'push', label: 'git.push' },
  { command: 'branches', label: 'git.branches' },
  { command: 'log', label: 'git.commitHistory' },
] as const

export function ProjectGitOperationsPage({ project, mappedGitHubRepo, gitService }: Props) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<'console' | 'commit'>('console')
  const projectPath = project.folderPath ?? project.folderDisplayName
  const {
    activeBranch,
    canCreateBranch,
    commitMessage,
    createAndCheckoutBranch,
    errorMessage,
    handleCheckoutSubmit,
    hasNoGit,
    isExecuting,
    isLoadingDiff,
    loadFileDiff,
    loadUncommittedFiles,
    logs,
    previewDiffText,
    previewFilePath,
    runCommand,
    selectedCommitFiles,
    setCommitMessage,
    setLogs,
    setTargetBranch,
    submitCommit,
    submitStash,
    targetBranch,
    toggleSelectAllCommitFiles,
    toggleSelectCommitFile,
    uncommittedFiles,
  } = useGitOperations({
    projectPath,
    isDemoFixture: project.isDemoFixture,
    currentBranch: project.git.branchName,
    gitStatus: project.git.status,
    gitService,
  })

  useEffect(() => {
    if (viewMode === 'commit') {
      void loadUncommittedFiles()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, projectPath, viewMode])

  const handleOpenCommitPage = () => {
    setViewMode('commit')
  }

  const handlePushAndReturn = async () => {
    if (isExecuting) return
    if (commitMessage.trim() && selectedCommitFiles.length > 0) {
      const commitOk = await submitCommit()
      if (!commitOk) return
    }
    const pushOk = await runCommand('push')
    if (pushOk) {
      const remainingFiles = await loadUncommittedFiles()
      if (remainingFiles.length === 0) {
        setViewMode('console')
      }
    }
  }

  return (
    <section className="sd-project-git-page">
      <header className="sd-project-git-page__header">
        <div>
          <p className="sd-project-git-page__eyebrow">{t('git.repositoryControl')}</p>
          <h2>{t('common.gitOperations')}</h2>
          <p>{project.folderDisplayName}</p>
        </div>
        {hasNoGit ? <StatusBadge label={t('common.esteProyectoNoTieneGit')} tone="err" /> : <StatusBadge label={activeBranch || t('common.branchHasNotBeenAnalyzedAlt')} tone="accent" mono />}
      </header>

      {mappedGitHubRepo ? (
        <div className="sd-project-git-page__remote">
          <span>{t('git.githubRepository')}</span>
          <a href={mappedGitHubRepo.repoHtmlUrl} target="_blank" rel="noreferrer noopener">{mappedGitHubRepo.repoFullName}</a>
          <StatusBadge label={`default: ${mappedGitHubRepo.defaultBranch}`} tone="neutral" mono />
        </div>
      ) : project.git.remoteUrl ? (
        <div className="sd-project-git-page__remote"><span>{t('git.remote')}</span><code>{project.git.remoteUrl}</code></div>
      ) : (
        <p className="sd-project-git-page__notice">{t('common.noRemoteRepositoryDetected')}</p>
      )}

      {hasNoGit ? <div className="sd-project-git-page__warning" role="alert">{t('common.noGitRepositoryWasDetectedInThisFolderConfirmTheProjectPathBeforeInitializing')}</div> : null}
      {project.isDemoFixture ? <div className="sd-project-git-page__notice" role="status">{t('common.thisIsADemoProjectOperationResultsAreMarkedAsSimulatedAndWillNotModifyARealRepository')}</div> : null}

      {viewMode === 'commit' ? (
        <section className="sd-project-git-page__commit-workbench" aria-label={t('git.uncommittedFiles')}>
          <div className="sd-project-git-page__commit-toolbar">
            <div className="sd-project-git-page__commit-toolbar-left">
              <button
                type="button"
                className="sd-project-git-page__back-btn"
                onClick={() => setViewMode('console')}
              >
                ← {t('git.backToOperations')}
              </button>
              <strong>{t('git.uncommittedFiles')} ({uncommittedFiles.length})</strong>
            </div>
            <button
              type="button"
              className="sd-project-git-page__refresh-btn"
              disabled={isExecuting}
              onClick={() => void loadUncommittedFiles()}
            >
              ↻ {t('git.refreshFiles')}
            </button>
          </div>

          {errorMessage ? <p className="sd-project-git-page__error" role="alert">{errorMessage}</p> : null}

          <div className="sd-project-git-page__commit-split">
            <aside className="sd-project-git-page__commit-files">
              <div className="sd-project-git-page__commit-files-head">
                <label className="sd-project-git-page__select-all">
                  <input
                    type="checkbox"
                    checked={uncommittedFiles.length > 0 && selectedCommitFiles.length === uncommittedFiles.length}
                    disabled={uncommittedFiles.length === 0 || isExecuting}
                    onChange={toggleSelectAllCommitFiles}
                  />
                  <span>
                    {selectedCommitFiles.length === uncommittedFiles.length && uncommittedFiles.length > 0
                      ? t('git.deselectAllFiles')
                      : t('git.selectAllFiles')}
                  </span>
                </label>
                <span className="sd-project-git-page__selected-count">
                  {t('git.selectedFilesCount', { count: selectedCommitFiles.length })}
                </span>
              </div>

              {uncommittedFiles.length === 0 ? (
                <p className="sd-project-git-page__empty-files">{t('git.noUncommittedFiles')}</p>
              ) : (
                <ul className="sd-project-git-page__file-list">
                  {uncommittedFiles.map((item) => {
                    const isChecked = selectedCommitFiles.includes(item.path)
                    const isActive = previewFilePath === item.path
                    return (
                      <li
                        key={item.path}
                        className={`sd-project-git-page__file-item${isActive ? ' is-active' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="sd-project-git-page__file-checkbox"
                          checked={isChecked}
                          disabled={isExecuting}
                          aria-label={item.path}
                          onChange={() => toggleSelectCommitFile(item.path)}
                        />
                        <button
                          type="button"
                          className="sd-project-git-page__file-select-btn"
                          onClick={() => void loadFileDiff(item.path)}
                        >
                          <span className={`sd-project-git-page__file-badge is-${item.status}`}>
                            {item.code}
                          </span>
                          <span className="sd-project-git-page__file-path">{item.path}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </aside>

            <div className="sd-project-git-page__commit-main">
              <form className="sd-project-git-page__commit-form" onSubmit={(e) => void submitCommit(e)}>
                <input
                  type="text"
                  className="sd-project-git-page__commit-input"
                  value={commitMessage}
                  disabled={isExecuting || hasNoGit || uncommittedFiles.length === 0}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder={t('git.commitMessagePlaceholder')}
                  aria-label={t('git.commitMessagePlaceholder')}
                />
                <button
                  type="button"
                  className="sd-project-git-page__commit-stash-btn"
                  disabled={isExecuting || hasNoGit || selectedCommitFiles.length === 0}
                  onClick={() => void submitStash()}
                >
                  {t('git.stashAction')} ({selectedCommitFiles.length})
                </button>
                <button
                  type="submit"
                  className="sd-project-git-page__commit-submit-btn"
                  disabled={isExecuting || hasNoGit || selectedCommitFiles.length === 0 || !commitMessage.trim()}
                >
                  {t('git.commitAction')} ({selectedCommitFiles.length})
                </button>
                <button
                  type="button"
                  className="sd-project-git-page__commit-push-btn"
                  disabled={isExecuting || hasNoGit}
                  onClick={() => void handlePushAndReturn()}
                >
                  {t('git.push')}
                </button>
              </form>

              <div className="sd-project-git-page__diff-viewer">
                <header className="sd-project-git-page__diff-header">
                  <strong>{previewFilePath ?? t('git.filePreview')}</strong>
                </header>
                <div className="sd-project-git-page__diff-body">
                  {!previewFilePath ? (
                    <p className="sd-project-git-page__diff-empty">{t('git.selectFileToPreview')}</p>
                  ) : isLoadingDiff ? (
                    <p className="sd-project-git-page__diff-empty">{t('git.loadingDiff')}</p>
                  ) : !previewDiffText.trim() ? (
                    <p className="sd-project-git-page__diff-empty">{t('git.noDiffOutput')}</p>
                  ) : (
                    <div className="sd-project-git-page__diff-lines">
                      {previewDiffText.split(/\r?\n/).map((line, index) => {
                        const lineKind =
                          line.startsWith('+') && !line.startsWith('+++')
                            ? 'add'
                            : line.startsWith('-') && !line.startsWith('---')
                              ? 'del'
                              : line.startsWith('@@')
                                ? 'hunk'
                                : 'ctx'
                        return (
                          <div key={`${index}-${line.slice(0, 12)}`} className={`sd-project-git-page__diff-line is-${lineKind}`}>
                            <span className="sd-project-git-page__diff-lineno">{index + 1}</span>
                            <span className="sd-project-git-page__diff-code">{line || ' '}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="sd-project-git-page__panel" aria-label={t('git.commands')}>
          <div className="sd-project-git-page__panel-heading"><h3>{t('git.repositoryCommands')}</h3><span>{project.git.branchName ?? t('common.branchHasNotBeenAnalyzed')}</span></div>
          <div className="sd-project-git-page__commands">
            {COMMANDS.map(({ command, label }) => (
              <button key={command} type="button" disabled={isExecuting} onClick={() => void runCommand(command)}>
                {t(label)}
              </button>
            ))}
            <button
              type="button"
              className="sd-project-git-page__commit-trigger-btn"
              disabled={isExecuting || hasNoGit}
              onClick={handleOpenCommitPage}
            >
              {t('git.commitButton')}
            </button>
          </div>
          <form className="sd-project-git-page__branch-form" onSubmit={handleCheckoutSubmit}>
            <label htmlFor="sd-project-git-branch">{t('git.branch')}</label>
            <input
              id="sd-project-git-branch"
              value={targetBranch}
              disabled={isExecuting || hasNoGit}
              onChange={(event) => setTargetBranch(event.target.value)}
              placeholder={t('common.enterBranchName')}
            />
            <button type="submit" disabled={isExecuting || hasNoGit || !targetBranch.trim()}>{t('common.switchBranch')}</button>
            <button type="button" disabled={isExecuting || hasNoGit || !canCreateBranch || !targetBranch.trim()} onClick={createAndCheckoutBranch}>{t('common.createAndSwitch')}</button>
          </form>
        </section>
      )}

      {viewMode === 'console' && errorMessage ? <p className="sd-project-git-page__error" role="alert">{errorMessage}</p> : null}
      <section className="sd-project-git-page__console" aria-label={t('git.operationOutput')}>
        <header><strong>{t('git.terminalOutput')}</strong>{logs.length ? <button type="button" onClick={() => setLogs([])}>{t('common.clearLog')}</button> : <span>{isExecuting ? t('common.running') : t('common.noCommandHasRunYet')}</span>}</header>
        <div className="sd-project-git-page__console-body">
          {logs.length ? logs.map((log) => (
            <article key={log.id}>
              <div className="sd-project-git-page__command-line"><code>$ {log.command}</code><time>{log.timestamp}</time>{log.isSimulated ? <span>{t('git.simulated')}</span> : null}</div>
              {log.stdout ? <pre>{log.stdout}</pre> : null}
              {log.stderr ? <pre className="sd-project-git-page__stderr">{log.stderr}</pre> : null}
            </article>
          )) : <p>{t('common.resultsWillAppearHereAfterRunningAGitCommand')}</p>}
        </div>
      </section>
    </section>
  )
}
