import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// The canonical library directory is strictly locked to <repo>/library.
const HARDCODED_LIBRARY_ROOT = path.resolve(import.meta.dirname, '..', 'library')

const ITEM_NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/
const RELATIVE_SEGMENT_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

export const LIBRARY_ERROR_CODES = Object.freeze({
  PATH_OUTSIDE_LIBRARY: 'PATH_OUTSIDE_LIBRARY',
  INVALID_NAME: 'INVALID_NAME',
  INVALID_RELATIVE_PATH: 'INVALID_RELATIVE_PATH',
  FORBIDDEN_HIDDEN_FILE: 'FORBIDDEN_HIDDEN_FILE',
})

export function getCanonicalLibraryRoot(options = {}) {
  // _testLibraryRoot is strictly for isolated unit tests in Vitest.
  if (typeof options._testLibraryRoot === 'string' && path.isAbsolute(options._testLibraryRoot)) {
    return path.resolve(options._testLibraryRoot)
  }
  return HARDCODED_LIBRARY_ROOT
}

export function getCanonicalHomeDir(options = {}) {
  if (typeof options._testHomeDir === 'string' && path.isAbsolute(options._testHomeDir)) {
    return path.resolve(options._testHomeDir)
  }
  return os.homedir()
}

export function ensureLibraryDirectories(options = {}) {
  const root = getCanonicalLibraryRoot(options)
  const skillsDir = path.join(root, 'skills')
  const mcpsDir = path.join(root, 'mcps')
  const backupsDir = path.join(mcpsDir, '.backups')
  const mcpBinDir = path.join(mcpsDir, '.bin')

  fs.mkdirSync(skillsDir, { recursive: true, mode: 0o700 })
  fs.mkdirSync(mcpsDir, { recursive: true, mode: 0o700 })
  fs.mkdirSync(backupsDir, { recursive: true, mode: 0o700 })
  fs.mkdirSync(mcpBinDir, { recursive: true, mode: 0o700 })

  return {
    root,
    skillsDir,
    mcpsDir,
    backupsDir,
    mcpBinDir,
    skillInstallsPath: path.join(skillsDir, '.installs.json'),
    mcpInstallsPath: path.join(mcpsDir, '.installs.json'),
    mcpSecretsPath: path.join(mcpsDir, '.secrets.json'),
  }
}

export function validateLibraryItemName(rawName) {
  if (typeof rawName !== 'string') {
    return {
      ok: false,
      errorCode: LIBRARY_ERROR_CODES.INVALID_NAME,
      message: agentMessage('agent.library.nameMustBeString'),
    }
  }
  const trimmed = rawName.trim()
  if (!ITEM_NAME_REGEX.test(trimmed)) {
    return {
      ok: false,
      errorCode: LIBRARY_ERROR_CODES.INVALID_NAME,
      message: agentMessage('agent.library.namePatternInvalid'),
    }
  }
  return { ok: true, value: trimmed }
}

export function validateSkillRelativeFilePath(rawRelPath) {
  if (typeof rawRelPath !== 'string' || !rawRelPath.trim()) {
    return {
      ok: false,
      errorCode: LIBRARY_ERROR_CODES.INVALID_RELATIVE_PATH,
      message: agentMessage('agent.library.pathEmpty'),
    }
  }
  const normalized = rawRelPath.replace(/\\/g, '/').trim()
  if (normalized.startsWith('/') || normalized.endsWith('/') || normalized.includes('//')) {
    return {
      ok: false,
      errorCode: LIBRARY_ERROR_CODES.INVALID_RELATIVE_PATH,
      message: agentMessage('agent.library.pathFormatInvalid'),
    }
  }
  const segments = normalized.split('/')
  if (segments.length > 8) {
    return {
      ok: false,
      errorCode: LIBRARY_ERROR_CODES.INVALID_RELATIVE_PATH,
      message: agentMessage('agent.library.pathDepthExceeded'),
    }
  }
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      return {
        ok: false,
        errorCode: LIBRARY_ERROR_CODES.PATH_OUTSIDE_LIBRARY,
        message: agentMessage('agent.library.pathNoDots'),
      }
    }
    if (seg.startsWith('.')) {
      return {
        ok: false,
        errorCode: LIBRARY_ERROR_CODES.FORBIDDEN_HIDDEN_FILE,
        message: agentMessage('agent.library.pathNoHidden'),
      }
    }
    if (!RELATIVE_SEGMENT_REGEX.test(seg)) {
      return {
        ok: false,
        errorCode: LIBRARY_ERROR_CODES.INVALID_RELATIVE_PATH,
        message: agentMessage('agent.library.pathSegmentInvalid', { seg }),
      }
    }
  }
  return { ok: true, value: segments.join('/') }
}

export function resolveInsideLibrary(options = {}, ...segments) {
  const { root } = ensureLibraryDirectories(options)
  const realRoot = fs.realpathSync(root)
  const candidate = path.resolve(realRoot, ...segments)

  const prefix = realRoot.endsWith(path.sep) ? realRoot : `${realRoot}${path.sep}`
  if (candidate !== realRoot && !candidate.startsWith(prefix)) {
    return {
      ok: false,
      errorCode: LIBRARY_ERROR_CODES.PATH_OUTSIDE_LIBRARY,
      message: agentMessage('agent.library.pathOutsideLibrary'),
    }
  }

  // Walk existing ancestors to ensure no symlink inside library points outside library
  let current = candidate
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  if (fs.existsSync(current)) {
    let realCurrent
    try {
      realCurrent = fs.realpathSync(current)
    } catch {
      return {
        ok: false,
        errorCode: LIBRARY_ERROR_CODES.PATH_OUTSIDE_LIBRARY,
        message: agentMessage('agent.library.pathResolveFailed'),
      }
    }
    if (realCurrent !== realRoot && !realCurrent.startsWith(prefix)) {
      return {
        ok: false,
        errorCode: LIBRARY_ERROR_CODES.PATH_OUTSIDE_LIBRARY,
        message: agentMessage('agent.library.symlinkOutsideLibrary'),
      }
    }
  }

  return { ok: true, path: candidate, root: realRoot }
}
