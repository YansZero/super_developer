import { agentMessage } from './requestI18n.mjs'
export const MAX_GIT_HTTP_BODY_BYTES = 16384

export const GIT_ALLOWED_COMMANDS = Object.freeze([
  'status',
  'fetch',
  'pull',
  'push',
  'branches',
  'checkout',
  'create-branch',
  'log',
  'uncommitted-files',
  'file-diff',
  'commit',
  'stash',
])

export const GIT_ERROR_CODES = Object.freeze({
  INVALID_JSON_OBJECT: 'INVALID_JSON_OBJECT',
  EMPTY_BODY: 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INVALID_GIT_COMMAND: 'INVALID_GIT_COMMAND',
  INVALID_BRANCH_NAME: 'INVALID_BRANCH_NAME',
  INVALID_PROJECT_PATH: 'INVALID_PROJECT_PATH',
  INVALID_FILE_PATH: 'INVALID_FILE_PATH',
  INVALID_COMMIT_MESSAGE: 'INVALID_COMMIT_MESSAGE',
  NO_GIT_REPOSITORY: 'NO_GIT_REPOSITORY',
  GIT_EXECUTION_FAILED: 'GIT_EXECUTION_FAILED',
  GIT_TIMEOUT: 'GIT_TIMEOUT',
})

const BRANCH_NAME_REGEX = /^[a-zA-Z0-9._/-]{1,100}$/

export function validateGitCommand(rawCommand) {
  if (typeof rawCommand !== 'string') {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_GIT_COMMAND,
      message: agentMessage('agent.git.invalidCommand'),
    }
  }
  const cmd = rawCommand.trim().toLowerCase()
  if (!GIT_ALLOWED_COMMANDS.includes(cmd)) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_GIT_COMMAND,
      message: agentMessage('agent.git.disallowedCommand', { command: rawCommand, allowed: GIT_ALLOWED_COMMANDS.join(', ') }),
    }
  }
  return { ok: true, value: cmd }
}

export function validateBranchName(rawBranch) {
  if (rawBranch === undefined || rawBranch === null || rawBranch === '') {
    return { ok: true, value: null }
  }
  if (typeof rawBranch !== 'string') {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_BRANCH_NAME,
      message: agentMessage('agent.git.branchMustBeString'),
    }
  }
  const trimmed = rawBranch.trim()
  if (!BRANCH_NAME_REGEX.test(trimmed) || trimmed.includes('..') || trimmed.startsWith('-')) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_BRANCH_NAME,
      message: agentMessage('agent.git.branchInvalid'),
    }
  }
  return { ok: true, value: trimmed }
}

export function validateRelativeFilePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_FILE_PATH,
      message: agentMessage('agent.git.filePathEmpty'),
    }
  }
  const trimmed = rawPath.trim()
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('\0') ||
    trimmed.split(/[\\/]/).includes('..')
  ) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_FILE_PATH,
      message: agentMessage('agent.git.filePathUnsafe'),
    }
  }
  return { ok: true, value: trimmed }
}

export function validateRelativeFilePathList(rawFiles) {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_FILE_PATH,
      message: agentMessage('agent.git.fileListEmpty'),
    }
  }
  const normalized = []
  for (const item of rawFiles) {
    const check = validateRelativeFilePath(item)
    if (!check.ok) return check
    normalized.push(check.value)
  }
  return { ok: true, value: [...new Set(normalized)] }
}

export function validateCommitMessage(rawMessage) {
  if (typeof rawMessage !== 'string' || !rawMessage.trim()) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_COMMIT_MESSAGE,
      message: agentMessage('agent.git.commitMessageEmpty'),
    }
  }
  const trimmed = rawMessage.trim()
  if (trimmed.length > 2000 || trimmed.includes('\0')) {
    return {
      ok: false,
      errorCode: GIT_ERROR_CODES.INVALID_COMMIT_MESSAGE,
      message: agentMessage('agent.git.commitMessageTooLong'),
    }
  }
  return { ok: true, value: trimmed }
}
