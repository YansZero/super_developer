import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { PROJECT_SCAN_ERROR_CODES } from './projectScanContracts.mjs'

const PROGRESS_FILE_MAX_BYTES = 256 * 1024
const PROGRESS_FILE_LIMIT = 200

function runGit(runner, args, cwd) {
  return runner('git', args, {
    cwd,
    timeout: 12000,
    env: { ...process.env, LANG: 'en_US.UTF-8' },
  })
}

function createDefaultRunner() {
  return (file, args, options) => new Promise((resolve) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      resolve({
        error,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
      })
    })
  })
}

function detectTechStack(projectPath) {
  const manifestChecks = [
    ['go.mod', 'Go'],
    ['pyproject.toml', 'Python'],
    ['requirements.txt', 'Python'],
    ['Cargo.toml', 'Rust'],
    ['pom.xml', 'Java'],
    ['build.gradle', 'Java'],
    ['composer.json', 'PHP'],
    ['Gemfile', 'Ruby'],
    ['mix.exs', 'Elixir'],
    ['*.csproj', '.NET'],
  ]
  const foundByArea = {
    frontend: new Set(),
    backend: new Set(),
    app: new Set(),
  }
  const queue = [{ directory: projectPath, depth: 0 }]
  const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'target', 'vendor'])
  const backendDirectories = new Set(['backend', 'back-end', 'server', 'api', 'service', 'services'])
  const appDirectories = new Set(['android', 'ios', 'mobile', 'native'])

  function areaForDirectory(directory) {
    const relativeDirectory = path.relative(projectPath, directory)
    const segments = relativeDirectory
      .split(path.sep)
      .filter(Boolean)
      .map((segment) => segment.toLowerCase())
    if (segments.some((segment) => appDirectories.has(segment))) return 'app'
    if (segments.some((segment) => backendDirectories.has(segment))) return 'backend'
    return 'frontend'
  }

  function addTechnology(directory, label) {
    const area = areaForDirectory(directory)
    foundByArea[area].add(label)
    if (area === 'app' && label === 'Java') foundByArea.backend.add(label)
  }

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    let entries
    try {
      entries = fs.readdirSync(current.directory, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      if (entry.isFile()) {
        const area = areaForDirectory(current.directory)
        if (area === 'app') {
          const relativeDirectory = path.relative(projectPath, current.directory).toLowerCase()
          if (relativeDirectory.split(path.sep).includes('android')) addTechnology(current.directory, 'Android')
          if (relativeDirectory.split(path.sep).includes('ios')) addTechnology(current.directory, 'iOS')
        }
        if (entry.name === 'package.json') {
          addTechnology(current.directory, 'JavaScript / TypeScript')
          if (areaForDirectory(current.directory) === 'backend') addTechnology(current.directory, 'Node.js')
        }
        if (entry.name === 'tsconfig.json') addTechnology(current.directory, 'JavaScript / TypeScript')
        if (entry.name.endsWith('.scss')) addTechnology(current.directory, 'SCSS')
        if (entry.name.endsWith('.css')) addTechnology(current.directory, 'CSS')
        if (entry.name.endsWith('.java')) addTechnology(current.directory, 'Java')
        if (entry.name.endsWith('.kt')) addTechnology(current.directory, 'Kotlin')
        if (entry.name.endsWith('.swift')) addTechnology(current.directory, 'Swift')
        for (const [fileName, label] of manifestChecks) {
          const matches = fileName.startsWith('*.')
            ? entry.name.endsWith(fileName.slice(1))
            : entry.name === fileName
          if (matches) addTechnology(current.directory, label)
        }
      } else if (entry.isDirectory() && current.depth < 3 && !ignoredDirectories.has(entry.name)) {
        queue.push({ directory: path.join(current.directory, entry.name), depth: current.depth + 1 })
      }
    }
  }

  const frontend = [...foundByArea.frontend]
  const backend = [...foundByArea.backend]
  const app = [...foundByArea.app]
  return {
    techStack: [...new Set([...frontend, ...backend, ...app])],
    techStackByArea: { frontend, backend, app },
  }
}

function trimOutput(result) {
  return result.exitCode === 0 ? result.stdout.trim() : ''
}

function unavailableProgress(category) {
  return {
    available: false,
    missingReason: `project.progress.${category}JobNotFound`,
    sourceFileLabel: null,
    todos: [],
  }
}

function cleanProgressTitle(value) {
  return [...value]
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
}

function cleanProgressDetails(value) {
  return [...value]
    .filter((character) => character === '\n' || character === '\r' || character === '\t' || (character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127))
    .join('')
    .trim()
    .slice(0, 24_000)
}

export function progressTaskId(source, title, occurrence = 1) {
  return `${source}:task-${crypto.createHash('sha256').update(cleanProgressTitle(title).normalize('NFKC')).digest('hex').slice(0, 24)}-${occurrence}`
}

function progressItemsFromDocument(content, fileName, category) {
  const sourceFileLabel = `spec/job/${fileName}`
  const details = cleanProgressDetails(content)
  const occurrences = new Map()
  const checklistItems = content.split(/\r?\n/).flatMap((line, index) => {
    const match = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line)
    if (!match) return []
    const title = cleanProgressTitle(match[2])
    const normalizedTitle = title.normalize('NFKC')
    const occurrence = (occurrences.get(normalizedTitle) ?? 0) + 1
    occurrences.set(normalizedTitle, occurrence)
    return title ? [{
      taskId: progressTaskId(sourceFileLabel, title, occurrence),
      id: `${sourceFileLabel}:${index + 1}`,
      title,
      completed: match[1].toLowerCase() === 'x',
      category,
      sourceFileLabel,
      details,
    }] : []
  })
  if (checklistItems.length > 0) return checklistItems

  const heading = content.match(/^#{1,6}\s+(.+?)\s*$/m)?.[1]
  return [{
    taskId: `${sourceFileLabel}:document`,
    id: `${sourceFileLabel}:document`,
    title: cleanProgressTitle(heading || fileName.replace(/\.md$/i, '')),
    completed: false,
    category,
    sourceFileLabel,
    details,
  }]
}

function progressTodoTarget(todoId) {
  if (typeof todoId !== 'string' || todoId.length > 512) return null
  const match = /^spec\/job\/([A-Za-z0-9._-]+\.md):(document|\d+)$/i.exec(todoId)
  if (!match) return null
  return { fileName: match[1], lineNumber: match[2] === 'document' ? null : Number(match[2]) }
}

export function readProgressTasks(projectPath, sourceFileLabel) {
  const match = /^spec\/job\/([A-Za-z0-9._-]+\.md)$/i.exec(sourceFileLabel ?? '')
  if (!match) throw new Error('Invalid progress source')
  const filePath = path.join(projectPath, sourceFileLabel)
  // Reject symlinked parents as well as symlinked files, including spec/.
  const root = fs.realpathSync(projectPath)
  if (fs.realpathSync(filePath) !== path.join(root, sourceFileLabel)) throw new Error('Unsafe progress path')
  const stat = fs.lstatSync(filePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PROGRESS_FILE_MAX_BYTES) throw new Error('Progress file unavailable')
  return progressItemsFromDocument(fs.readFileSync(filePath, 'utf8'), match[1], /(?:^|[_-])BE\.md$/i.test(match[1]) ? 'backend' : 'frontend')
}

export function writeProgressCompletion(projectPath, todoId, expectedTitle) {
  const stable = /^(spec\/job\/[A-Za-z0-9._-]+\.md):task-[a-f0-9]{24}-\d+$/i.exec(todoId ?? '')
  const target = stable ? { fileName: path.basename(stable[1]), lineNumber: null } : progressTodoTarget(todoId)
  if (!target) return { ok: false, errorCode: 'INVALID_PROGRESS_TODO', message: agentMessage('agent.project.invalidTodoId') }
  const filePath = path.join(projectPath, 'spec', 'job', target.fileName)
  let content
  try {
    readProgressTasks(projectPath, `spec/job/${target.fileName}`)
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return { ok: false, errorCode: 'PROGRESS_FILE_UNAVAILABLE', message: agentMessage('agent.project.specFileUnavailable') }
  }
  // Keep every original byte except the checkbox marker (including mixed line endings).
  const lines = content.split(/(?<=\n)/)
  let index = target.lineNumber === null ? -1 : target.lineNumber - 1
  if (expectedTitle !== undefined) {
    const matches = lines.flatMap((line, i) => {
      const match = /^\s*[-*]\s+\[([ xX])\]\s+(.+?)\s*$/.exec(line)
      return match && cleanProgressTitle(match[2]) === cleanProgressTitle(expectedTitle) ? [i] : []
    })
    // An edited title or duplicate is ambiguous: never guess and never overwrite.
    const documentTitle = cleanProgressTitle(content.match(/^#{1,6}\s+(.+?)\s*$/m)?.[1] || target.fileName.replace(/\.md$/i, ''))
    const unchangedDocument = todoId.endsWith(':document') && matches.length === 0 && documentTitle === cleanProgressTitle(expectedTitle) && !lines.some((line) => /^\s*[-*]\s+\[[ xX]\]/.test(line))
    if (matches.length !== 1 && !unchangedDocument) return { ok: false, errorCode: 'PROGRESS_ITEM_CONFLICT', message: agentMessage('agent.project.progressItemConflict') }
    index = unchangedDocument ? -1 : matches[0]
  } else if (stable) {
    return { ok: false, errorCode: 'PROGRESS_ITEM_CONFLICT', message: agentMessage('agent.project.stableIdNeedsOriginalTitle') }
  }
  let updated
  if (index < 0 && !stable && todoId.endsWith(':document')) {
    if (lines.some((line) => /^\s*[-*]\s+\[[ xX]\]/.test(line))) return { ok: true }
    const title = cleanProgressTitle(content.match(/^#{1,6}\s+(.+?)\s*$/m)?.[1] || target.fileName.replace(/\.md$/i, ''))
    updated = content + (content.endsWith('\n') ? '' : '\n') + `- [x] ${title}\n`
  } else {
    if (!lines[index] || !/^\s*[-*]\s+\[[ xX]\]\s+.+/.test(lines[index])) return { ok: false, errorCode: 'PROGRESS_ITEM_NOT_FOUND', message: agentMessage('agent.project.progressItemNotFound') }
    lines[index] = lines[index].replace(/^(\s*[-*]\s+\[) (\])/, '$1x$2')
    updated = lines.join('')
  }
  if (updated === content) return { ok: true }
  try {
    // Open the existing inode, compare the latest bytes, then patch synchronously.
    // No async gap or stale whole-document snapshot from dispatch time.
    const fd = fs.openSync(filePath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW)
    try {
      const sameFile = () => { const current = fs.statSync(filePath); const opened = fs.fstatSync(fd); return current.ino === opened.ino && current.dev === opened.dev }
      if (!sameFile() || fs.readFileSync(fd, 'utf8') !== content) return { ok: false, errorCode: 'PROGRESS_ITEM_CONFLICT', message: agentMessage('agent.project.documentChangedConflict') }
      if (updated.length === content.length) {
        const offset = Buffer.byteLength(content.split(/(?<=\n)/).slice(0, index).join('')) + Buffer.byteLength(lines[index].slice(0, lines[index].indexOf('[') + 1))
        fs.writeSync(fd, Buffer.from('x'), 0, 1, offset)
      } else {
        fs.writeSync(fd, updated, 0, 'utf8')
        fs.ftruncateSync(fd, Buffer.byteLength(updated))
      }
      if (!sameFile()) return { ok: false, errorCode: 'PROGRESS_ITEM_CONFLICT', message: agentMessage('agent.project.documentReplacedConflict') }
    } finally { fs.closeSync(fd) }
  } catch {
    return { ok: false, errorCode: 'PROGRESS_FILE_WRITE_FAILED', message: agentMessage('agent.project.specWriteFailed') }
  }
  return { ok: true }
}

function scanJobProgress(projectPath) {
  const progress = {
    frontend: unavailableProgress('frontend'),
    backend: unavailableProgress('backend'),
  }
  const jobPath = path.join(projectPath, 'spec', 'job')
  let directory
  try {
    const stat = fs.lstatSync(jobPath)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return progress
    directory = fs.readdirSync(jobPath, { withFileTypes: true })
  } catch {
    return progress
  }

  const grouped = { frontend: [], backend: [] }
  for (const entry of directory
    .filter((item) => item.isFile() && /(?:^|[_-])(FE|BE)\.md$/i.test(item.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, PROGRESS_FILE_LIMIT)) {
    const match = /(?:^|[_-])(FE|BE)\.md$/i.exec(entry.name)
    const category = match?.[1].toLowerCase() === 'fe' ? 'frontend' : 'backend'
    const filePath = path.join(jobPath, entry.name)
    try {
      const stat = fs.lstatSync(filePath)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PROGRESS_FILE_MAX_BYTES) continue
      const content = fs.readFileSync(filePath, 'utf8')
      grouped[category].push(...progressItemsFromDocument(content, entry.name, category))
    } catch {
      // Ignore unreadable or unsupported job files; the other side remains available.
    }
  }

  for (const category of ['frontend', 'backend']) {
    const todos = grouped[category]
    if (todos.length === 0) continue
    const sourceFiles = [...new Set(todos.map((todo) => todo.sourceFileLabel))]
    progress[category] = {
      available: true,
      missingReason: null,
      sourceFileLabel: sourceFiles.length === 1 ? sourceFiles[0] : `${sourceFiles.length} spec/job files`,
      todos,
    }
  }
  return progress
}

async function readGitSummary(runner, targetPath) {
  const gitCheck = await runGit(runner, ['rev-parse', '--git-dir'], targetPath)
  if (gitCheck.exitCode !== 0) {
    return {
      status: 'no-git',
      branchName: null,
      lastCommitHash: null,
      lastCommitMessage: null,
      aheadCount: 0,
      behindCount: 0,
      uncommittedFileCount: 0,
      openPrCount: 0,
      openIssueCount: 0,
      remoteUrl: null,
    }
  }

  const branchResult = await runGit(runner, ['symbolic-ref', '--quiet', '--short', 'HEAD'], targetPath)
  const commitHashResult = await runGit(runner, ['rev-parse', '--short', 'HEAD'], targetPath)
  const commitMessageResult = await runGit(runner, ['log', '-1', '--pretty=%s'], targetPath)
  const remoteResult = await runGit(runner, ['remote', 'get-url', 'origin'], targetPath)
  const statusResult = await runGit(runner, ['status', '--porcelain'], targetPath)
  const branchName = trimOutput(branchResult)
  const commitHash = trimOutput(commitHashResult)
  const uncommittedFileCount = statusResult.exitCode === 0
    ? statusResult.stdout.split(/\r?\n/).filter((line) => line.trim().length > 0).length
    : 0
  const detached = !branchName

  return {
    status: detached ? 'detached' : 'normal',
    branchName: detached
      ? `HEAD (detached${commitHash ? ` at ${commitHash}` : ''})`
      : branchName,
    lastCommitHash: commitHash || null,
    lastCommitMessage: trimOutput(commitMessageResult) || null,
    aheadCount: 0,
    behindCount: 0,
    uncommittedFileCount,
    openPrCount: 0,
    openIssueCount: 0,
    remoteUrl: trimOutput(remoteResult) || null,
  }
}

function validateProjectFolder(projectPath) {
  const targetPath = path.resolve(projectPath)
  if (!fs.existsSync(targetPath)) {
    return { ok: false, errorCode: PROJECT_SCAN_ERROR_CODES.PROJECT_NOT_FOUND, message: agentMessage('agent.project.folderNotFound') }
  }
  let targetStat
  try {
    targetStat = fs.statSync(targetPath)
  } catch {
    return { ok: false, errorCode: PROJECT_SCAN_ERROR_CODES.PROJECT_SCAN_FAILED, message: agentMessage('agent.project.scanPermissionDenied') }
  }
  if (!targetStat.isDirectory()) {
    return { ok: false, errorCode: PROJECT_SCAN_ERROR_CODES.PROJECT_NOT_DIRECTORY, message: agentMessage('agent.project.notDirectory') }
  }
  return { ok: true, targetPath }
}

export function createProjectScanner(options = {}) {
  const runner = options.runner || createDefaultRunner()

  return {
    async scan(projectPath) {
      const folder = validateProjectFolder(projectPath)
      if (!folder.ok) return folder
      const targetPath = folder.targetPath

      const techStack = detectTechStack(targetPath)
      const progress = scanJobProgress(targetPath)
      const base = {
        name: path.basename(targetPath),
        folderDisplayName: targetPath,
        techStack: techStack.techStack,
        techStackByArea: techStack.techStackByArea,
      }
      const git = await readGitSummary(runner, targetPath)

      return {
        ok: true,
        project: {
          ...base,
          git: {
            ...git,
          },
        frontendProgress: progress.frontend,
        backendProgress: progress.backend,
        },
      }
    },
    async scanProgress(projectPath) {
      const folder = validateProjectFolder(projectPath)
      if (!folder.ok) return folder
      const progress = scanJobProgress(folder.targetPath)
      return { ok: true, frontendProgress: progress.frontend, backendProgress: progress.backend }
    },
    async completeProgressTodo(projectPath, todoId) {
      const folder = validateProjectFolder(projectPath)
      if (!folder.ok) return folder
      const result = writeProgressCompletion(folder.targetPath, todoId)
      if (!result.ok) return result
      const progress = scanJobProgress(folder.targetPath)
      return { ok: true, frontendProgress: progress.frontend, backendProgress: progress.backend }
    },
    async scanGitStatus(projectPath) {
      const folder = validateProjectFolder(projectPath)
      if (!folder.ok) return folder
      return { ok: true, git: await readGitSummary(runner, folder.targetPath) }
    },
  }
}
