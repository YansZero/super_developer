import { agentMessage } from './requestI18n.mjs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  GITHUB_ERROR_CODES,
  MAX_PROJECT_MAPPINGS_COUNT,
  hasControlCharacters,
  isPlainObject,
  sanitizePublicGitHubAccount,
  sanitizePublicGitHubRepositories,
  validateGitHubClientId,
  validateGitHubConfigUpdateInput,
  validateGitHubRepoMappingInput,
  validateProjectIdParam,
} from './githubContracts.mjs'

export function resolveDefaultGitHubConfigPath(env = process.env) {
  const xdgConfigHome =
    typeof env.XDG_CONFIG_HOME === 'string' && env.XDG_CONFIG_HOME.trim().startsWith('/')
      ? env.XDG_CONFIG_HOME.trim()
      : path.join(os.homedir(), '.config')
  return path.join(xdgConfigHome, 'super-developer', 'github.config.json')
}

export function writeGitHubFileAtomicallyRestricted(filePath, contentString) {
  const dirPath = path.dirname(filePath)
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 })
  try {
    fs.chmodSync(dirPath, 0o700)
  } catch {
    // Ignore chmod error on filesystems that do not support directory chmod
  }

  const randomSuffix = crypto.randomBytes(6).toString('hex')
  const tmpFilePath = `${filePath}.${process.pid}.${randomSuffix}.tmp`
  let fd
  try {
    fd = fs.openSync(tmpFilePath, 'wx', 0o600)
    fs.writeFileSync(fd, contentString, 'utf8')
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.chmodSync(tmpFilePath, 0o600)
    fs.renameSync(tmpFilePath, filePath)
    fs.chmodSync(filePath, 0o600)
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        // Ignore close error
      }
    }
    if (fs.existsSync(tmpFilePath)) {
      try {
        fs.unlinkSync(tmpFilePath)
      } catch {
        // Ignore cleanup error
      }
    }
  }
}

function createEmptyGitHubDocument() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    clientId: null,
    account: null,
    repositories: [],
    mappings: [],
  }
}

function sanitizePersistedMappings(rawMappings, allowedPublicRepos) {
  if (!Array.isArray(rawMappings)) {
    return []
  }

  const repoById = new Map()
  for (const repo of allowedPublicRepos) {
    repoById.set(repo.id, repo)
  }

  const seenProjectIds = new Set()
  const sanitized = []

  for (const item of rawMappings) {
    if (!isPlainObject(item)) continue
    const projIdCheck = validateProjectIdParam(item.projectId)
    if (!projIdCheck.ok || seenProjectIds.has(projIdCheck.value)) continue

    const projectName =
      typeof item.projectName === 'string' &&
      item.projectName.trim().length > 0 &&
      !hasControlCharacters(item.projectName)
        ? item.projectName.trim().slice(0, 120)
        : null

    const folderDisplayName =
      typeof item.folderDisplayName === 'string' &&
      item.folderDisplayName.trim().length > 0 &&
      !hasControlCharacters(item.folderDisplayName)
        ? item.folderDisplayName.trim().slice(0, 240)
        : null

    const repoId =
      typeof item.repoId === 'number' && Number.isInteger(item.repoId) && item.repoId > 0
        ? item.repoId
        : null

    if (!projectName || !folderDisplayName || !repoId) continue

    const matchedRepo = repoById.get(repoId)
    const repoFullName = matchedRepo
      ? matchedRepo.fullName
      : typeof item.repoFullName === 'string' &&
          /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(item.repoFullName.trim())
        ? item.repoFullName.trim()
        : null

    if (!repoFullName) continue

    const repoHtmlUrl = matchedRepo
      ? matchedRepo.htmlUrl
      : `https://github.com/${repoFullName}`

    const defaultBranch = matchedRepo
      ? matchedRepo.defaultBranch
      : typeof item.defaultBranch === 'string' &&
          item.defaultBranch.trim().length > 0 &&
          !hasControlCharacters(item.defaultBranch)
        ? item.defaultBranch.trim().slice(0, 64)
        : 'main'

    const mappedAt =
      typeof item.mappedAt === 'string' && !hasControlCharacters(item.mappedAt)
        ? item.mappedAt.slice(0, 40)
        : new Date().toISOString()

    seenProjectIds.add(projIdCheck.value)
    sanitized.push({
      projectId: projIdCheck.value,
      projectName,
      folderDisplayName,
      repoId,
      repoFullName,
      repoHtmlUrl,
      defaultBranch,
      mappedAt,
    })

    if (sanitized.length >= MAX_PROJECT_MAPPINGS_COUNT) {
      break
    }
  }

  return sanitized
}

export function createGitHubStorage(options = {}) {
  const configFilePath = options.configFilePath || resolveDefaultGitHubConfigPath()

  function readStorageDocument() {
    if (!fs.existsSync(configFilePath)) {
      return createEmptyGitHubDocument()
    }
    try {
      const rawText = fs.readFileSync(configFilePath, 'utf8')
      const parsed = JSON.parse(rawText)
      if (!isPlainObject(parsed)) {
        return createEmptyGitHubDocument()
      }

      const clientCheck =
        parsed.clientId !== null && parsed.clientId !== undefined
          ? validateGitHubClientId(parsed.clientId)
          : { ok: false }

      const account = sanitizePublicGitHubAccount(parsed.account)
      const repositories = account ? sanitizePublicGitHubRepositories(parsed.repositories) : []
      const mappings = account ? sanitizePersistedMappings(parsed.mappings, repositories) : []

      return {
        version: 1,
        updatedAt:
          typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        clientId: clientCheck.ok ? clientCheck.value : null,
        account,
        repositories,
        mappings,
      }
    } catch {
      return createEmptyGitHubDocument()
    }
  }

  function persistStorageDocument(doc) {
    // 嚴格確保持久化內容絕不包含任何 token、device_code 或 user_code
    const safeRepositories = doc.account
      ? sanitizePublicGitHubRepositories(doc.repositories)
      : []
    const safeMappings = doc.account
      ? sanitizePersistedMappings(doc.mappings, safeRepositories)
      : []

    const nextDoc = {
      version: 1,
      updatedAt: new Date().toISOString(),
      clientId: doc.clientId || null,
      account: doc.account ? sanitizePublicGitHubAccount(doc.account) : null,
      repositories: safeRepositories,
      mappings: safeMappings,
    }

    writeGitHubFileAtomicallyRestricted(
      configFilePath,
      `${JSON.stringify(nextDoc, null, 2)}\n`,
    )
    return nextDoc
  }

  function getPersistedState() {
    return readStorageDocument()
  }

  function saveClientId(rawInput) {
    const check = validateGitHubConfigUpdateInput(rawInput)
    if (!check.ok) {
      return check
    }
    const doc = readStorageDocument()
    doc.clientId = check.value.clientId
    const saved = persistStorageDocument(doc)
    return {
      ok: true,
      clientId: saved.clientId,
    }
  }

  function saveConnectedAccountAndRepos({ clientId, account, repositories }) {
    const cleanAccount = sanitizePublicGitHubAccount(account)
    if (!cleanAccount) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.GITHUB_USER_VERIFICATION_FAILED,
        message: agentMessage('agent.github.accountDataInvalid'),
      }
    }

    const doc = readStorageDocument()
    if (clientId) {
      const clientCheck = validateGitHubClientId(clientId)
      if (clientCheck.ok) {
        doc.clientId = clientCheck.value
      }
    }
    doc.account = cleanAccount
    doc.repositories = sanitizePublicGitHubRepositories(repositories)
    doc.mappings = sanitizePersistedMappings(doc.mappings, doc.repositories)
    const saved = persistStorageDocument(doc)
    return {
      ok: true,
      state: saved,
    }
  }

  function updatePublicRepositories(repositories) {
    const doc = readStorageDocument()
    if (!doc.account) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.GITHUB_NOT_CONNECTED,
        message: agentMessage('agent.github.accountNotConnected'),
      }
    }
    doc.repositories = sanitizePublicGitHubRepositories(repositories)
    doc.mappings = sanitizePersistedMappings(doc.mappings, doc.repositories)
    const saved = persistStorageDocument(doc)
    return {
      ok: true,
      state: saved,
    }
  }

  function upsertProjectMapping(rawInput) {
    const inputCheck = validateGitHubRepoMappingInput(rawInput)
    if (!inputCheck.ok) {
      return inputCheck
    }

    const doc = readStorageDocument()
    if (!doc.account) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.GITHUB_NOT_CONNECTED,
        message: agentMessage('agent.github.connectFirst'),
      }
    }

    const targetRepo = doc.repositories.find((r) => r.id === inputCheck.value.repoId)
    if (!targetRepo) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.REPO_NOT_FOUND,
        message: agentMessage('agent.github.repoNotFound'),
      }
    }

    if (targetRepo.isPrivate) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.PRIVATE_REPO_FORBIDDEN,
        message: agentMessage('agent.github.publicRepoOnly'),
      }
    }

    const nextMapping = {
      projectId: inputCheck.value.projectId,
      projectName: inputCheck.value.projectName,
      folderDisplayName: inputCheck.value.folderDisplayName,
      repoId: targetRepo.id,
      repoFullName: targetRepo.fullName,
      repoHtmlUrl: targetRepo.htmlUrl,
      defaultBranch: targetRepo.defaultBranch,
      mappedAt: new Date().toISOString(),
    }

    const existingIdx = doc.mappings.findIndex(
      (m) => m.projectId === inputCheck.value.projectId,
    )
    if (existingIdx >= 0) {
      doc.mappings[existingIdx] = nextMapping
    } else {
      if (doc.mappings.length >= MAX_PROJECT_MAPPINGS_COUNT) {
        return {
          ok: false,
          errorCode: GITHUB_ERROR_CODES.INVALID_PROJECT_ID,
          message: agentMessage('agent.github.maxMappings', { max: MAX_PROJECT_MAPPINGS_COUNT }),
        }
      }
      doc.mappings.push(nextMapping)
    }

    const saved = persistStorageDocument(doc)
    return {
      ok: true,
      mapping: nextMapping,
      mappings: saved.mappings,
    }
  }

  function removeProjectMapping(rawProjectId) {
    const idCheck = validateProjectIdParam(rawProjectId)
    if (!idCheck.ok) {
      return idCheck
    }

    const doc = readStorageDocument()
    const idx = doc.mappings.findIndex((m) => m.projectId === idCheck.value)
    if (idx === -1) {
      return {
        ok: false,
        errorCode: GITHUB_ERROR_CODES.MAPPING_NOT_FOUND,
        message: agentMessage('agent.github.mappingNotFound'),
      }
    }

    doc.mappings.splice(idx, 1)
    const saved = persistStorageDocument(doc)
    return {
      ok: true,
      removedProjectId: idCheck.value,
      mappings: saved.mappings,
    }
  }

  function clearConnectionState() {
    const doc = readStorageDocument()
    doc.account = null
    doc.repositories = []
    doc.mappings = []
    const saved = persistStorageDocument(doc)
    return {
      ok: true,
      state: saved,
    }
  }

  return {
    configFilePath,
    getPersistedState,
    saveClientId,
    saveConnectedAccountAndRepos,
    updatePublicRepositories,
    upsertProjectMapping,
    removeProjectMapping,
    clearConnectionState,
  }
}
