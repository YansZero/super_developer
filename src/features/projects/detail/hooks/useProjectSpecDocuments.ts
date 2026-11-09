import { useEffect, useRef, useState } from 'react'
import type { ProjectItem } from '../../../../shared/types/domain'
import type { DispatchJob } from '../dispatchClient'
import { listSpecDocuments, readSpecDocument } from '../specFilesClient'
import type { SpecDocument, SpecDocumentSummary } from '../specFilesClient'

export function useProjectSpecDocuments(
  project: Pick<ProjectItem, 'id' | 'folderPath' | 'isDemoFixture'>,
  jiraDispatchJob: DispatchJob | null,
) {
  const [specDocuments, setSpecDocuments] = useState<SpecDocumentSummary[]>([])
  const [specDocumentsPath, setSpecDocumentsPath] = useState<string | null>(null)
  const [selectedSpecFileName, setSelectedSpecFileName] = useState<string | null>(null)
  const [selectedSpecDocument, setSelectedSpecDocument] = useState<SpecDocument | null>(null)
  const [specDocumentsError, setSpecDocumentsError] = useState<string | null>(null)
  const [specDocumentError, setSpecDocumentError] = useState<{ fileName: string; message: string } | null>(null)
  const savedJiraArtifactJobId = useRef<string | null>(null)

  useEffect(() => {
    const projectPath = project.folderPath
    if (project.isDemoFixture || !projectPath) return
    const controller = new AbortController()
    let active = true
    listSpecDocuments(projectPath, controller.signal)
      .then((files) => {
        if (!active) return
        setSpecDocuments(files)
        setSpecDocumentsPath(projectPath)
        setSpecDocumentsError(null)
        setSelectedSpecFileName((current) => files.some((file) => file.fileName === current) ? current : files[0]?.fileName ?? null)
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return
        setSpecDocumentsPath(projectPath)
        setSpecDocumentsError(error instanceof Error ? error.message : '讀取專案規格文件清單失敗。')
        setSpecDocuments([])
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [project.folderPath, project.id, project.isDemoFixture])

  useEffect(() => {
    const projectPath = project.folderPath
    const fileName = selectedSpecFileName
    if (project.isDemoFixture || !projectPath || !fileName) return
    const controller = new AbortController()
    let active = true
    readSpecDocument(projectPath, fileName, controller.signal)
      .then((document) => {
        if (active) {
          setSelectedSpecDocument(document)
          setSpecDocumentError(null)
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return
        setSpecDocumentError({
          fileName,
          message: error instanceof Error ? error.message : '讀取規格文件失敗。',
        })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [project.folderPath, project.isDemoFixture, selectedSpecFileName])

  useEffect(() => {
    const projectPath = project.folderPath
    if (!jiraDispatchJob || jiraDispatchJob.status !== 'succeeded' || !jiraDispatchJob.artifactPath || savedJiraArtifactJobId.current === jiraDispatchJob.id || !projectPath) return
    savedJiraArtifactJobId.current = jiraDispatchJob.id
    let active = true
    const controller = new AbortController()
    const fileName = jiraDispatchJob.artifactPath.split('/').at(-1) ?? ''
    listSpecDocuments(projectPath, controller.signal)
      .then((files) => {
        if (!active) return
        setSpecDocuments(files)
        setSpecDocumentsPath(projectPath)
        setSpecDocumentsError(null)
        if (files.some((file) => file.fileName === fileName)) setSelectedSpecFileName(fileName)
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return
        setSpecDocumentsPath(projectPath)
        setSpecDocumentsError(error instanceof Error ? error.message : '重新載入 Jira 分析文件失敗。')
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [jiraDispatchJob, project.folderPath])

  const projectSpecDocuments = !project.isDemoFixture && project.folderPath && specDocumentsPath === project.folderPath
    ? specDocuments
    : []
  const currentSpecDocumentsError = project.folderPath && specDocumentsPath === project.folderPath
    ? specDocumentsError
    : null
  const specFilesLoading = !project.isDemoFixture && Boolean(project.folderPath) && specDocumentsPath !== project.folderPath

  return {
    projectSpecDocuments, currentSpecDocumentsError, specFilesLoading,
    selectedSpecFileName, setSelectedSpecFileName, selectedSpecDocument, specDocumentError,
  }
}
