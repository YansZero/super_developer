import { agentMessage } from './requestI18n.mjs'
import path from 'node:path'

export const MAX_PROJECT_SCAN_BODY_BYTES = 8192

export const PROJECT_SCAN_ERROR_CODES = Object.freeze({
  INVALID_JSON_OBJECT: 'INVALID_JSON_OBJECT',
  EMPTY_BODY: 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INVALID_PROJECT_PATH: 'INVALID_PROJECT_PATH',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PROJECT_NOT_DIRECTORY: 'PROJECT_NOT_DIRECTORY',
  PROJECT_SCAN_FAILED: 'PROJECT_SCAN_FAILED',
  INVALID_GIT_STATUS_REQUEST: 'INVALID_GIT_STATUS_REQUEST',
  PICKER_CANCELLED: 'PICKER_CANCELLED',
  PICKER_UNAVAILABLE: 'PICKER_UNAVAILABLE',
})

export function validateProjectPath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return {
      ok: false,
      errorCode: PROJECT_SCAN_ERROR_CODES.INVALID_PROJECT_PATH,
      message: agentMessage('agent.project.pathEmpty'),
    }
  }

  const projectPath = rawPath.trim()
  if (projectPath.length > 4096 || projectPath.includes('\u0000') || !path.isAbsolute(projectPath)) {
    return {
      ok: false,
      errorCode: PROJECT_SCAN_ERROR_CODES.INVALID_PROJECT_PATH,
      message: agentMessage('agent.project.pathMustBeAbsolute'),
    }
  }

  return { ok: true, value: path.normalize(projectPath) }
}
