import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { sanitizeCliOutput } from './cliOutputSanitizer.mjs'

const MAX_DOCUMENT_BYTES = 256 * 1024
const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9_]{0,19}-\d{1,10}$/

function resolveSpecDirectory(projectPath, createIfMissing = false) {
  if (typeof projectPath !== 'string' || !path.isAbsolute(projectPath) || projectPath.length > 4096 || projectPath.includes('\0')) {
    throw new Error(agentMessage('agent.spec.validProjectRootRequired'))
  }
  const projectRoot = fs.realpathSync(projectPath)
  if (!fs.statSync(projectRoot).isDirectory() || projectRoot === path.parse(projectRoot).root) {
    throw new Error(agentMessage('agent.spec.projectRootUnavailable'))
  }
  const specPath = path.join(projectRoot, 'spec')
  try {
    const stat = fs.lstatSync(specPath)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(agentMessage('agent.spec.specDirMustBeDirectory'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    if (!createIfMissing) return { projectRoot, specPath: null }
    try {
      fs.mkdirSync(specPath, { mode: 0o700 })
    } catch (mkdirError) {
      if (mkdirError?.code !== 'EEXIST') throw mkdirError
    }
  }
  const realSpecPath = fs.realpathSync(specPath)
  if (path.dirname(realSpecPath) !== projectRoot) throw new Error(agentMessage('agent.spec.specDirMustBeInside'))
  return { projectRoot, specPath: realSpecPath }
}

function listMarkdownFiles(specPath) {
  return fs.readdirSync(specPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => {
      const filePath = path.join(specPath, entry.name)
      const stat = fs.statSync(filePath)
      return { fileName: entry.name, size: stat.size, updatedAt: stat.mtime.toISOString() }
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.fileName.localeCompare(left.fileName))
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function nextTicketVersion(specPath, date, ticketKey) {
  const escapedKey = ticketKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}_Jira_Ticket_${escapedKey}-Analysis_v(\\d+)\\.md$`)
  let next = 0
  for (const entry of fs.readdirSync(specPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const match = pattern.exec(entry.name)
    if (match) next = Math.max(next, Number(match[1]) + 1)
  }
  return `${date}_Jira_Ticket_${ticketKey}-Analysis_v${next}.md`
}

export function createSpecDocumentStore() {
  function list(projectPath) {
    const { specPath } = resolveSpecDirectory(projectPath)
    if (!specPath) return []
    return listMarkdownFiles(specPath)
  }

  function read(projectPath, fileName) {
    if (typeof fileName !== 'string' || fileName.length > 240 || path.basename(fileName) !== fileName || fileName === '.' || fileName === '..' || !fileName.toLowerCase().endsWith('.md')) {
      throw new Error(agentMessage('agent.spec.specFileNameInvalid'))
    }
    const { specPath } = resolveSpecDirectory(projectPath)
    if (!specPath) {
      const error = new Error(agentMessage('agent.spec.specFileNotFound'))
      error.code = 'ENOENT'
      throw error
    }
    const filePath = path.join(specPath, fileName)
    const stat = fs.lstatSync(filePath)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_DOCUMENT_BYTES) {
      throw new Error(agentMessage('agent.spec.notRegularMarkdown'))
    }
    return { fileName, content: sanitizeCliOutput(fs.readFileSync(filePath, 'utf8')), size: stat.size, updatedAt: stat.mtime.toISOString() }
  }

  function writeJiraAnalysis({ projectPath, ticketKey, ticketTitle, projectName, branchName, providerId, modelId, effort, output, generatedAt = new Date() }) {
    const normalizedKey = typeof ticketKey === 'string' ? ticketKey.trim().toUpperCase() : ''
    if (!TICKET_KEY_PATTERN.test(normalizedKey)) throw new Error(agentMessage('agent.spec.ticketKeyInvalid'))
    const cleanOutput = sanitizeCliOutput(output)
    if (!cleanOutput.trim()) throw new Error(agentMessage('agent.spec.noAiOutput'))
    const date = formatLocalDate(generatedAt)
    const { specPath } = resolveSpecDirectory(projectPath, true)
    const metadata = [
      `- Jira Ticket：${normalizedKey} - ${String(ticketTitle || '').trim().slice(0, 300)}`,
      agentMessage('agent.spec.projectLabel', { name: String(projectName || '').trim().slice(0, 160) }),
      agentMessage('agent.spec.branchLabel', { branch: String(branchName || agentMessage('agent.dispatch.branchUndetected')).trim().slice(0, 200) }),
      `- Provider / Model / Effort：${String(providerId || '').slice(0, 80)} / ${String(modelId || '').slice(0, 120)} / ${String(effort || 'default').slice(0, 32)}`,
      agentMessage('agent.spec.analysisTimeLabel', { time: generatedAt.toISOString() }),
    ].join('\n')
    const content = `# ${normalizedKey} - ${String(ticketTitle || normalizedKey).trim().slice(0, 300)}\n\n${metadata}\n\n---\n\n${cleanOutput.trim()}\n`
    if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error(agentMessage('agent.spec.contentTooLarge'))

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const fileName = nextTicketVersion(specPath, date, normalizedKey)
      try {
        fs.writeFileSync(path.join(specPath, fileName), content, { flag: 'wx', mode: 0o600 })
        return { fileName, relativePath: `spec/${fileName}` }
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error
      }
    }
    throw new Error(agentMessage('agent.spec.versionAllocationFailed'))
  }

  return { list, read, writeJiraAnalysis }
}
