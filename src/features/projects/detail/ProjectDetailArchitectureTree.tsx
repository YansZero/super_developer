import { createElement } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { ArchNode } from '../../../shared/types/domain'
import { useI18n } from '../../../shared/i18n'

export interface ArchTreeListProps {
  nodes: ArchNode[]
  collapsedIds: Record<string, boolean>
  onToggleNode: (nodeId: string) => void
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokens = /(`[^`]+`|\*\*.+?\*\*|\*[^*]+\*)/g
  const rendered: ReactNode[] = []
  let lastIndex = 0
  let tokenIndex = 0

  for (const match of text.matchAll(tokens)) {
    const index = match.index ?? 0
    if (index > lastIndex) rendered.push(text.slice(lastIndex, index))
    const token = match[0]
    const key = `${keyPrefix}-${tokenIndex++}`
    if (token.startsWith('`')) {
      rendered.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**')) {
      rendered.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      rendered.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    lastIndex = index + token.length
  }

  if (lastIndex < text.length) rendered.push(text.slice(lastIndex))
  return rendered
}

export function MarkdownAnalysisOutput({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let index = 0
  let blockIndex = 0
  const isBlockStart = (line: string) => /^(?:#{1,6}\s|```|(?:-{3,}|_{3,}|\*{3,})\s*$|[-*+]\s+|\d+[.)]\s+)/.test(line.trim())

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (!trimmed) {
      index += 1
      continue
    }

    const key = `analysis-block-${blockIndex++}`
    if (trimmed.startsWith('```')) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(<pre key={key}><code>{codeLines.join('\n')}</code></pre>)
      continue
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(createElement(`h${level}`, { key }, renderInlineMarkdown(heading[2], key)))
      index += 1
      continue
    }

    if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(<hr key={key} />)
      index += 1
      continue
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].trim().replace(/^[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={key}>
          {items.map((item, itemIndex) => {
            const task = item.match(/^\[([ xX])\]\s+(.+)$/)
            return (
              <li key={`${key}-${itemIndex}`} className={task ? 'sd-detail__markdown-task' : undefined}>
                {task ? (
                  <>
                    <input type="checkbox" checked={task[1].toLowerCase() === 'x'} readOnly aria-label={task[2]} />
                    <span>{renderInlineMarkdown(task[2], `${key}-${itemIndex}`)}</span>
                  </>
                ) : renderInlineMarkdown(item, `${key}-${itemIndex}`)}
              </li>
            )
          })}
        </ul>,
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].trim().replace(/^\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push(<ol key={key}>{items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item, `${key}-${itemIndex}`)}</li>)}</ol>)
      continue
    }

    const paragraph = [trimmed]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(<p key={key}>{renderInlineMarkdown(paragraph.join(' '), key)}</p>)
  }

  return <div className="sd-detail__saved-architecture-output">{blocks}</div>
}

export function FolderGlyph() {
  return (
    <svg className="sd-detail__glyph sd-detail__glyph--folder" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1.8 3.6C1.8 2.94 2.34 2.4 3 2.4H6.3L7.7 4H13C13.66 4 14.2 4.54 14.2 5.2V12.4C14.2 13.06 13.66 13.6 13 13.6H3C2.34 13.6 1.8 13.06 1.8 12.4V3.6Z" fill="currentColor" />
    </svg>
  )
}

function FileGlyph() {
  return (
    <svg className="sd-detail__glyph sd-detail__glyph--file" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 2.2H9.6L12.5 5.1V13.8H3.5V2.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.5 7.5H10.5M5.5 10.2H8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

export function ArchTreeList({ nodes, collapsedIds, onToggleNode }: ArchTreeListProps) {
  return (
    <ul className="sd-detail__tree-list">
      {nodes.map((node) => {
        const isFolder = node.kind === 'folder'
        const isCollapsed = Boolean(collapsedIds[node.id])
        return (
          <li key={node.id} className="sd-detail__tree-item">
            <div className="sd-detail__tree-row">
              {isFolder ? (
                <button
                  type="button"
                  className="sd-detail__tree-toggle"
                  onClick={() => onToggleNode(node.id)}
                  aria-expanded={!isCollapsed}
                >
                  <span className="sd-detail__tree-caret">{isCollapsed ? '▸' : '▾'}</span>
                  <FolderGlyph />
                  <span>{node.name}</span>
                </button>
              ) : (
                <span className="sd-detail__tree-file">
                  <FileGlyph />
                  <span>{node.name}</span>
                </span>
              )}
              {node.note ? <span className="sd-detail__tree-note">{node.note}</span> : null}
            </div>
            {isFolder && !isCollapsed && node.children && node.children.length > 0 ? (
              <ArchTreeList
                nodes={node.children}
                collapsedIds={collapsedIds}
                onToggleNode={onToggleNode}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}


import type { ProjectItem } from '../../../shared/types/domain'
import type { DispatchJob } from './dispatchClient'

interface Props {
  project: ProjectItem
  architectureView: 'tree' | 'analysis'
  onArchitectureViewChange: (view: 'tree' | 'analysis') => void
  architectureTreeSectionRef: RefObject<HTMLElement | null>
  savedArchitectureOutput: string
  rescanMessage: string | null
  architectureSaveError: string | null
  architectureDispatchJob: DispatchJob | null
  architectureReloading: boolean
  hasSavedArchitectureAnalysis: boolean
  frontendTree: ArchNode[]
  backendTree: ArchNode[]
  collapsedNodes: Record<string, boolean>
  handleRefreshArchitectureTree: () => void
  retryArchitectureSave: (jobId: string) => Promise<void>
  toggleTreeNode: (nodeId: string) => void
}

export function ProjectDetailArchitectureTree({
  project, architectureView, onArchitectureViewChange, architectureTreeSectionRef, savedArchitectureOutput, rescanMessage, architectureSaveError, architectureDispatchJob,
  architectureReloading, hasSavedArchitectureAnalysis, frontendTree, backendTree, collapsedNodes,
  handleRefreshArchitectureTree, retryArchitectureSave, toggleTreeNode,
}: Props) {
  const { t, locale } = useI18n()
  const savedArchitectureAnalysis = project.architectureAnalysis
  return (
<section ref={architectureTreeSectionRef} className="sd-detail__section" aria-label={t('common.frontendAndBackendDirectoryTree')}>
            <header className="sd-detail__section-head">
              <div>
                <h2 className="sd-detail__section-title">{t('common.frontendAndBackendArchitectureTree')}</h2>
                <p className="sd-detail__section-sub">
                  {t('common.frontendAndBackendDirectoriesAreShownSideBySide')}
                </p>
              </div>
              <button
                type="button"
                className="sd-detail__mini-btn"
                onClick={() => void handleRefreshArchitectureTree()}
                disabled={architectureReloading}
              >
                {architectureReloading ? t('common.loading') : hasSavedArchitectureAnalysis ? `↻ ${t('common.reloadAnalysisResults')}` : t('common.goToAiAnalysisSettings')}
              </button>
            </header>

            <nav className="sd-detail__subtabs" role="tablist" aria-label={t('common.frontendAndBackendDirectoryTree')}>
              <button type="button" role="tab" aria-selected={architectureView === 'tree'} className={architectureView === 'tree' ? 'sd-detail__subtab sd-detail__subtab--active' : 'sd-detail__subtab'} onClick={() => onArchitectureViewChange('tree')}>
                {t('common.frontendAndBackendArchitectureTree')}
              </button>
              <button type="button" role="tab" aria-selected={architectureView === 'analysis'} className={architectureView === 'analysis' ? 'sd-detail__subtab sd-detail__subtab--active' : 'sd-detail__subtab'} onClick={() => onArchitectureViewChange('analysis')}>
                {t('common.aiAnalysisResult')}
              </button>
            </nav>

            {rescanMessage ? (
              <div className="sd-detail__notice" role="status">
                <span>{rescanMessage}</span>
              </div>
            ) : null}

            {architectureSaveError ? (
              <div className="sd-detail__dispatch-error" role="alert">
                <span>{architectureSaveError}</span>{' '}
                <button type="button" className="sd-detail__mini-btn" disabled={!architectureDispatchJob} onClick={() => architectureDispatchJob && void retryArchitectureSave(architectureDispatchJob.id)}>
                  {t('common.retrySavingAnalysisResult')}
                </button>
              </div>
            ) : null}

            {architectureView === 'tree' ? <div className="sd-detail__dual-grid">
              <div className="sd-detail__pane">
                <h3 className="sd-detail__subhead">{t('common.frontendDirectory')}</h3>
                {frontendTree.length > 0 ? (
                  <ArchTreeList
                    nodes={frontendTree}
                    collapsedIds={collapsedNodes}
                    onToggleNode={toggleTreeNode}
                  />
                ) : (
                  <div className="sd-detail__missing-card">
                    <strong>{hasSavedArchitectureAnalysis ? t('common.theSavedAnalysisDoesNotProvideRecognizableFrontendPaths') : t('common.projectStructureAnalysisHasNotBeenRun')}</strong>
                    {hasSavedArchitectureAnalysis ? <p>{t('common.runTheAnalysisAgainAndListActualRelativePathsOrAnAsciiDirectoryTreeInTheFrontendSection')}</p> : null}
                  </div>
                )}
              </div>

              <div className="sd-detail__pane">
                <h3 className="sd-detail__subhead">{t('common.backendDirectory')}</h3>
                {backendTree.length > 0 ? (
                  <ArchTreeList
                    nodes={backendTree}
                    collapsedIds={collapsedNodes}
                    onToggleNode={toggleTreeNode}
                  />
                ) : (
                  <div className="sd-detail__missing-card">
                    <strong>{hasSavedArchitectureAnalysis ? t('common.theSavedAnalysisDoesNotProvideRecognizableBackendPaths') : t('common.projectStructureAnalysisHasNotBeenRun')}</strong>
                    {hasSavedArchitectureAnalysis ? <p>{t('common.runTheAnalysisAgainAndListActualRelativePathsOrAnAsciiDirectoryTreeInTheBackendSection')}</p> : null}
                  </div>
                )}
              </div>
            </div> : null}
            {architectureView === 'analysis' && savedArchitectureAnalysis && hasSavedArchitectureAnalysis ? (
              <article className="sd-detail__saved-architecture" aria-label={t('common.savedAiArchitectureAnalysis')}>
                <header className="sd-detail__saved-architecture-head">
                  <div>
                    <h3 className="sd-detail__subhead">{t('common.aiAnalysisResultSaved')}</h3>
                    <p className="sd-detail__section-sub">
                      {t('common.analysisTime')}{new Date(savedArchitectureAnalysis.analyzedAt).toLocaleString(locale)} · {t('common.branch')}{savedArchitectureAnalysis.branchName || t('common.notDetectedAlt')} · Model：{savedArchitectureAnalysis.modelId}
                    </p>
                  </div>
                </header>
                <MarkdownAnalysisOutput markdown={savedArchitectureOutput} />
              </article>
            ) : architectureView === 'analysis' ? (
              <div className="sd-detail__analysis-empty sd-detail__analysis-empty--centered" role="status">
                <strong>{t('common.analysisNotRunGoToAiAnalysis')}</strong>
              </div>
            ) : null}
          </section>
  )
}
