import { StatusBadge } from '../../../shared/components/StatusBadge'
import type { ProjectItem } from '../../../shared/types/domain'
import type { SpecDocument, SpecDocumentSummary } from './specFilesClient'
import { useI18n } from '../../../shared/i18n'
import { MarkdownAnalysisOutput } from './ProjectDetailArchitectureTree'

interface Props {
  project: ProjectItem
  projectSpecDocuments: SpecDocumentSummary[]
  selectedSpecFileName: string | null
  selectedSpecDocument: SpecDocument | null
  specDocumentError: { fileName: string; message: string } | null
  currentSpecDocumentsError: string | null
  specFilesLoading: boolean
  selectedSpecSectionId: string | null
  setSelectedSpecFileName: (fileName: string) => void
  setSelectedSpecSectionId: (sectionId: string) => void
}

export function ProjectDetailSpecViewer({
  project, projectSpecDocuments, selectedSpecFileName, selectedSpecDocument, specDocumentError,
  currentSpecDocumentsError, specFilesLoading, selectedSpecSectionId, setSelectedSpecFileName,
  setSelectedSpecSectionId,
}: Props) {
  const { t } = useI18n()
  const activeSpecSection =
    project.spec.sections.find((section) => section.id === selectedSpecSectionId) ??
    project.spec.sections[0] ??
    null
  return (
<section className="sd-detail__section" aria-label={t('common.specificationPreviewArea')}>
            <header className="sd-detail__section-head">
              <div>
                <h2 className="sd-detail__section-title">{t('common.specificationPreviewAreaSpecViewer')}</h2>
                <p className="sd-detail__section-sub">
                  {t('common.openTheProjectSpecificationAndSectionPreviewsShowAClearNoticeWhenTheyAreMissing')}
                </p>
              </div>
              {projectSpecDocuments.length > 0 ? (
                <StatusBadge label={`${t('common.projectDocuments')} ${projectSpecDocuments.length} ${t('common.files')}`} tone="accent" />
              ) : project.spec.available && project.spec.fileName ? (
                <StatusBadge label={`開啟文件 ↗ ${project.spec.fileName}`} tone="accent" mono />
              ) : (
                <StatusBadge label={t('common.specificationMissing')} tone="err" />
              )}
            </header>

            {projectSpecDocuments.length > 0 ? (
              <div className="sd-detail__spec-files-layout">
                <nav className="sd-detail__spec-file-list" aria-label={t('common.projectMarkdownDocumentList')}>
                  <strong className="sd-detail__subhead">{t('common.projectSpecDocument')}</strong>
                  {projectSpecDocuments.map((file) => (
                    <button
                      key={file.fileName}
                      type="button"
                      className={`sd-detail__spec-file-btn ${file.fileName === selectedSpecFileName ? 'sd-detail__spec-file-btn--active' : ''}`}
                      onClick={() => setSelectedSpecFileName(file.fileName)}
                      aria-current={file.fileName === selectedSpecFileName ? 'page' : undefined}
                    >
                      <span>{file.fileName}</span>
                      <small>{new Date(file.updatedAt).toLocaleString()}</small>
                    </button>
                  ))}
                </nav>
                <article className="sd-detail__spec-file-preview" aria-label={t('common.specificationPreview')}>
                  {specDocumentError?.fileName === selectedSpecFileName ? <p className="sd-detail__dispatch-error" role="alert">{specDocumentError.message}</p> : null}
                  {selectedSpecDocument?.fileName === selectedSpecFileName && specDocumentError?.fileName !== selectedSpecFileName ? (
                    <>
                      <header className="sd-detail__spec-meta">
                        <h3>{selectedSpecDocument.fileName}</h3>
                        <span className="sd-detail__meta-key">{t('common.lastUpdatedAlt')}{new Date(selectedSpecDocument.updatedAt).toLocaleString()}</span>
                      </header>
                      <MarkdownAnalysisOutput markdown={selectedSpecDocument.content} />
                    </>
                  ) : selectedSpecFileName && specDocumentError?.fileName !== selectedSpecFileName ? <p role="status">{t('common.readingDocument')}</p> : <p>{t('common.selectADocumentOnTheLeftToPreviewItsContent')}</p>}
                </article>
              </div>
            ) : specFilesLoading ? (
              <div className="sd-detail__missing-card" role="status"><p>{t('common.loadingProjectSpecDocuments')}</p></div>
            ) : project.spec.available && activeSpecSection ? (
              <div className="sd-detail__spec-layout">
                <aside className="sd-detail__spec-toc" aria-label={t('common.specificationSectionIndex')}>
                  <span className="sd-detail__subhead">{t('common.sectionIndex')}</span>
                  {project.spec.sections.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      className={`sd-detail__toc-btn ${sec.id === activeSpecSection.id ? 'sd-detail__toc-btn--active' : ''}`}
                      onClick={() => setSelectedSpecSectionId(sec.id)}
                    >
                      {sec.heading}
                    </button>
                  ))}
                </aside>
                <article className="sd-detail__spec-content">
                  <div className="sd-detail__spec-meta">
                    <h3>{activeSpecSection.heading}</h3>
                    <span className="sd-detail__meta-key">
                      {t('common.lastUpdatedAlt')}{project.spec.updatedAtLabel}
                    </span>
                  </div>
                  <p className="sd-detail__spec-summary">{activeSpecSection.summary}</p>
                  <ul className="sd-detail__spec-clauses">
                    {activeSpecSection.clauses.map((clause) => (
                      <li key={clause}>{clause}</li>
                    ))}
                  </ul>
                </article>
              </div>
            ) : (
              <div className="sd-detail__missing-card" role="alert">
                <strong>{t('common.specificationDocumentMissing')}</strong>
                <p>
                  {currentSpecDocumentsError ?? (project.spec.missingReason ? t(project.spec.missingReason) :
                    t('common.noSpecificationDocumentWasSpecifiedOrFoundTheLocalAgentFileScannerIsNotConnectedYet'))}
                </p>
              </div>
            )}
          </section>
  )
}
