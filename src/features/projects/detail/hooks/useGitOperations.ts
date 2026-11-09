import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { GitStatusKind } from '../../../../shared/types/domain'
import { useI18n } from '../../../../shared/i18n'
import {
  createHttpGitServiceClient,
  type GitExecutionResponse,
  type GitServiceContract,
  type GitUncommittedFileItem,
} from '../gitClient'

export interface GitConsoleLogEntry {
  id: string
  command: string
  stdout: string
  stderr: string
  isSimulated: boolean
  timestamp: string
}
type GitCommand = Parameters<GitServiceContract['executeGitCommand']>[0]['command']

interface Options {
  projectPath: string
  isDemoFixture: boolean
  currentBranch?: string | null
  gitStatus: GitStatusKind
  gitService?: GitServiceContract
}

function parsePorcelainFallback(rawStdout: string): GitUncommittedFileItem[] {
  const files: GitUncommittedFileItem[] = []
  for (const line of String(rawStdout || '').split(/\r?\n/)) {
    if (!line || line.length < 4) continue
    const xy = line.slice(0, 2)
    let filePath = line.slice(3).trim()
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop()?.trim() ?? filePath
    }
    const status =
      xy === '??'
        ? 'untracked'
        : xy.includes('D')
          ? 'deleted'
          : xy.includes('A')
            ? 'added'
            : 'modified'
    files.push({
      path: filePath,
      code: xy.trim() || 'M',
      status,
      staged: xy[0] !== ' ' && xy[0] !== '?',
    })
  }
  return files
}

export function useGitOperations({ projectPath, isDemoFixture, currentBranch, gitStatus, gitService }: Options) {
  const { locale } = useI18n()
  const [httpService] = useState(createHttpGitServiceClient)
  const service = gitService ?? httpService
  const projectPathRef = useRef(projectPath)

  const [isExecuting, setIsExecuting] = useState(false)
  const [targetBranch, setTargetBranch] = useState('')
  const [activeBranch, setActiveBranch] = useState(currentBranch ?? '')
  const [logs, setLogs] = useState<GitConsoleLogEntry[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [uncommittedFiles, setUncommittedFiles] = useState<GitUncommittedFileItem[]>([])
  const [selectedCommitFiles, setSelectedCommitFiles] = useState<string[]>([])
  const [previewFilePath, setPreviewFilePath] = useState<string | null>(null)
  const [previewDiffText, setPreviewDiffText] = useState<string>('')
  const [isLoadingDiff, setIsLoadingDiff] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')

  useEffect(() => {
    // Keep displayed branch and clear previous project states when projectPath changes.
    projectPathRef.current = projectPath
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveBranch(currentBranch ?? '')
    setLogs([])
    setCommitMessage('')
    setErrorMessage(null)
    setTargetBranch('')
    setUncommittedFiles([])
    setSelectedCommitFiles([])
    setPreviewFilePath(null)
    setPreviewDiffText('')
  }, [projectPath, currentBranch])

  const hasNoGit = gitStatus === 'no-git' || (gitStatus === 'normal' && !activeBranch)
  const canCreateBranch = gitStatus === 'normal' || gitStatus === 'detached'

  const runCommand = async (command: GitCommand, branch?: string): Promise<boolean> => {
    setIsExecuting(true)
    setErrorMessage(null)
    try {
      const res: GitExecutionResponse = await service.executeGitCommand({
        command,
        projectPath,
        branch,
        isDemoFixture,
      })
      if ((command === 'checkout' || command === 'create-branch') && branch) setActiveBranch(branch)
      setLogs((previous) => [{
        id: `${Date.now()}-${Math.random()}`,
        command: branch ? `git ${command} ${branch}` : `git ${command}`,
        stdout: res.stdout,
        stderr: res.stderr,
        isSimulated: res.isSimulated,
        timestamp: new Date().toLocaleTimeString(locale),
      }, ...previous])
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Git 操作失敗。')
      return false
    } finally {
      setIsExecuting(false)
    }
  }

  const loadFileDiff = async (filePath: string) => {
    const currentPath = projectPath
    setPreviewFilePath(filePath)
    setIsLoadingDiff(true)
    try {
      const res = await service.executeGitCommand({
        command: 'file-diff',
        projectPath: currentPath,
        filePath,
        isDemoFixture,
      })
      if (projectPathRef.current !== currentPath) return
      setPreviewDiffText(res.stdout)
    } catch (error) {
      if (projectPathRef.current !== currentPath) return
      setPreviewDiffText(error instanceof Error ? error.message : '')
    } finally {
      if (projectPathRef.current === currentPath) {
        setIsLoadingDiff(false)
      }
    }
  }

  const loadUncommittedFiles = async (): Promise<GitUncommittedFileItem[]> => {
    const currentPath = projectPath
    setIsExecuting(true)
    setErrorMessage(null)
    try {
      const res = await service.executeGitCommand({
        command: 'uncommitted-files',
        projectPath: currentPath,
        branch: activeBranch || undefined,
        isDemoFixture,
      })
      if (projectPathRef.current !== currentPath) return []
      const items = res.files ?? parsePorcelainFallback(res.stdout)
      setUncommittedFiles(items)
      const allPaths = items.map((item) => item.path)
      setSelectedCommitFiles(allPaths)
      if (items.length > 0) {
        const firstPath = items[0].path
        await loadFileDiff(firstPath)
      } else {
        setPreviewFilePath(null)
        setPreviewDiffText('')
      }
      return items
    } catch (error) {
      if (projectPathRef.current === currentPath) {
        setErrorMessage(error instanceof Error ? error.message : '載入未提交檔案失敗。')
      }
      return []
    } finally {
      if (projectPathRef.current === currentPath) {
        setIsExecuting(false)
      }
    }
  }

  const toggleSelectCommitFile = (filePath: string) => {
    setSelectedCommitFiles((prev) =>
      prev.includes(filePath) ? prev.filter((item) => item !== filePath) : [...prev, filePath],
    )
  }

  const toggleSelectAllCommitFiles = () => {
    if (selectedCommitFiles.length === uncommittedFiles.length) {
      setSelectedCommitFiles([])
    } else {
      setSelectedCommitFiles(uncommittedFiles.map((item) => item.path))
    }
  }

  const submitCommit = async (event?: FormEvent): Promise<boolean> => {
    if (event) event.preventDefault()
    const trimmedMsg = commitMessage.trim()
    if (!trimmedMsg || selectedCommitFiles.length === 0 || isExecuting) return false
    setIsExecuting(true)
    setErrorMessage(null)
    try {
      const res = await service.executeGitCommand({
        command: 'commit',
        projectPath,
        branch: activeBranch || undefined,
        files: selectedCommitFiles,
        commitMessage: trimmedMsg,
        isDemoFixture,
      })
      setLogs((previous) => [{
        id: `${Date.now()}-${Math.random()}`,
        command: `git add ${selectedCommitFiles.join(' ')} && git commit -m "${trimmedMsg}"`,
        stdout: res.stdout,
        stderr: res.stderr,
        isSimulated: res.isSimulated,
        timestamp: new Date().toLocaleTimeString(locale),
      }, ...previous])
      setCommitMessage('')
      await loadUncommittedFiles()
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Git Commit 失敗。')
      return false
    } finally {
      setIsExecuting(false)
    }
  }

  const submitStash = async (): Promise<boolean> => {
    if (selectedCommitFiles.length === 0 || isExecuting) return false
    setIsExecuting(true)
    setErrorMessage(null)
    try {
      const res = await service.executeGitCommand({
        command: 'stash',
        projectPath,
        branch: activeBranch || undefined,
        files: selectedCommitFiles,
        commitMessage: commitMessage.trim() || undefined,
        isDemoFixture,
      })
      const filesDisplay = selectedCommitFiles.join(' ')
      const msgDisplay = commitMessage.trim() ? ` -m "${commitMessage.trim()}"` : ''
      setLogs((previous) => [{
        id: `${Date.now()}-${Math.random()}`,
        command: `git stash push -u${msgDisplay} -- ${filesDisplay}`,
        stdout: res.stdout,
        stderr: res.stderr,
        isSimulated: res.isSimulated,
        timestamp: new Date().toLocaleTimeString(locale),
      }, ...previous])
      if (commitMessage.trim()) {
        setCommitMessage('')
      }
      await loadUncommittedFiles()
      return true
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Git Stash 失敗。')
      return false
    } finally {
      setIsExecuting(false)
    }
  }

  const handleCheckoutSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!targetBranch.trim()) return
    void runCommand('checkout', targetBranch.trim())
    setTargetBranch('')
  }

  const createAndCheckoutBranch = () => {
    const branchName = targetBranch.trim()
    if (!branchName || !canCreateBranch) return
    void runCommand('create-branch', branchName)
    setTargetBranch('')
  }

  return {
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
  }
}
