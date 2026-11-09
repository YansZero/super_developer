import { agentMessage } from './requestI18n.mjs'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  SAFE_ERROR_CODES,
  validateExecutablePathSyntax,
} from './providerContracts.mjs'

const DEFAULT_TIMEOUT_MS = 3000
const MAX_CAPTURE_BYTES = 4096
const MAX_CODEX_MODEL_CATALOG_BYTES = 1024 * 1024

export function hasDisallowedBinaryControlChars(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f)
    ) {
      return true
    }
  }
  return false
}

export const PROVIDER_COMMAND_ALLOWLIST = Object.freeze({
  antigravity: Object.freeze({
    versionArgs: Object.freeze(['--version']),
    authStatusArgs: Object.freeze(['models']),
    loginArgs: Object.freeze(['models']),
    modelsArgs: Object.freeze(['models']),
  }),
  codex: Object.freeze({
    versionArgs: Object.freeze(['--version']),
    authStatusArgs: Object.freeze(['login', 'status']),
    loginArgs: Object.freeze(['login']),
    modelsArgs: Object.freeze(['debug', 'models']),
  }),
  'claude-code': Object.freeze({
    versionArgs: Object.freeze(['--version']),
    authStatusArgs: Object.freeze(['auth', 'status', '--json']),
    loginArgs: Object.freeze(['auth', 'login']),
  }),
  custom: Object.freeze({
    versionArgs: Object.freeze(['--version']),
    authStatusArgs: null,
    loginArgs: null,
  }),
})

export function getAllowlistSpecForProvider(providerId) {
  if (
    providerId === 'antigravity' ||
    providerId === 'codex' ||
    providerId === 'claude-code'
  ) {
    return PROVIDER_COMMAND_ALLOWLIST[providerId]
  }
  return PROVIDER_COMMAND_ALLOWLIST.custom
}

export function isAllowlistedCommandArgs(providerId, operation, args) {
  if (!Array.isArray(args) || args.length === 0) {
    return false
  }
  const spec = getAllowlistSpecForProvider(providerId)
  const expected =
    operation === 'version'
      ? spec.versionArgs
      : operation === 'authStatus'
        ? spec.authStatusArgs
        : operation === 'login'
          ? spec.loginArgs
        : operation === 'models'
          ? spec.modelsArgs
          : null

  if (!expected || expected.length !== args.length) {
    return false
  }
  return expected.every((val, idx) => val === args[idx])
}

export function buildSafeSubprocessEnv(baseEnv = process.env) {
  const safeKeys = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TERM',
    'TMPDIR',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'XDG_CACHE_HOME',
    'SYSTEMROOT',
  ]
  const cleanEnv = {
    NO_COLOR: '1',
    CI: '1',
  }
  for (const key of safeKeys) {
    if (typeof baseEnv[key] === 'string') {
      cleanEnv[key] = baseEnv[key]
    }
  }
  return cleanEnv
}

const HARDCODED_REPO_ROOT = path.resolve(import.meta.dirname, '..')

export function getWorkspaceBinSearchDirs(options = {}) {
  const repoRoot =
    typeof options.repoRoot === 'string' && path.isAbsolute(options.repoRoot)
      ? path.resolve(options.repoRoot)
      : HARDCODED_REPO_ROOT
  const libraryRoot =
    typeof options._testLibraryRoot === 'string' && path.isAbsolute(options._testLibraryRoot)
      ? path.resolve(options._testLibraryRoot)
      : path.join(repoRoot, 'library')
  return [
    path.join(libraryRoot, 'mcps', '.bin'),
    path.join(libraryRoot, 'mcps', '.venv', 'bin'),
    path.join(repoRoot, '.venv-mcp', 'bin'),
    path.join(repoRoot, 'node_modules', '.bin'),
  ]
}

export function resolveExecutableFile(rawCliPath, options = {}) {
  const syntaxCheck = validateExecutablePathSyntax(rawCliPath)
  if (!syntaxCheck.ok) {
    return {
      ok: false,
      errorCode: syntaxCheck.errorCode,
      errorMessage: syntaxCheck.message,
      statusKind: 'unknown',
      cliStatus: 'invalid_path',
    }
  }

  const candidatePaths = []
  if (syntaxCheck.isAbsolutePath) {
    candidatePaths.push(syntaxCheck.value)
  } else {
    const rawEnvPath =
      typeof options.searchPathEnv === 'string'
        ? options.searchPathEnv
        : typeof options.envPath === 'string'
          ? options.envPath
          : process.env.PATH || ''
    const pathDirs = rawEnvPath
      .split(path.delimiter)
      .map((dir) => dir.trim())
      .filter((dir) => dir.startsWith('/'))
    const workspaceDirs = getWorkspaceBinSearchDirs(options)
    const fallbackDirs = [
      path.join(os.homedir(), '.local', 'bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
    ]
    const uniqueDirs = Array.from(new Set([...workspaceDirs, ...pathDirs, ...fallbackDirs]))
    for (const dir of uniqueDirs) {
      candidatePaths.push(path.join(dir, syntaxCheck.value))
    }
  }

  let sawNonExecutableFile = false
  let sawNonRegularFile = false

  for (const candidate of candidatePaths) {
    let stat
    try {
      stat = fs.statSync(candidate)
    } catch {
      continue
    }

    if (!stat.isFile()) {
      sawNonRegularFile = true
      continue
    }

    const hasExecBit = (stat.mode & 0o111) !== 0
    if (!hasExecBit) {
      sawNonExecutableFile = true
      continue
    }

    try {
      fs.accessSync(candidate, fs.constants.X_OK)
      return {
        ok: true,
        resolvedPath: candidate,
      }
    } catch (accessErr) {
      if (accessErr && (accessErr.code === 'EPERM' || accessErr.code === 'EINVAL')) {
        return {
          ok: true,
          resolvedPath: candidate,
        }
      }
      sawNonExecutableFile = true
    }
  }

  if (sawNonExecutableFile) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_NOT_EXECUTABLE,
      errorMessage: agentMessage('agent.provider.notExecutable'),
      statusKind: 'unknown',
      cliStatus: 'not_executable',
    }
  }

  if (sawNonRegularFile) {
    return {
      ok: false,
      errorCode: SAFE_ERROR_CODES.CLI_NOT_FILE,
      errorMessage: agentMessage('agent.provider.notRegularFile'),
      statusKind: 'missing',
      cliStatus: 'missing',
    }
  }

  return {
    ok: false,
    errorCode: SAFE_ERROR_CODES.CLI_NOT_FOUND,
    errorMessage: agentMessage('agent.provider.cliNotFound'),
    statusKind: 'missing',
    cliStatus: 'missing',
  }
}

export function runAllowlistedSubprocess(providerId, operation, executablePath, args, options = {}) {
  if (!isAllowlistedCommandArgs(providerId, operation, args)) {
    return {
      ok: false,
      errorCode: 'COMMAND_NOT_ALLOWLISTED',
      timedOut: false,
      status: null,
      stdoutText: '',
      stderrText: '',
    }
  }

  const timeoutMs =
    typeof options.timeoutMs === 'number' && options.timeoutMs > 0
      ? options.timeoutMs
      : DEFAULT_TIMEOUT_MS

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-probe-'))
  let stdoutFd
  let stderrFd
  try {
    try {
      fs.chmodSync(tempDir, 0o700)
    } catch {
      // Ignore chmod error on unsupported FS
    }
    const stdoutPath = path.join(tempDir, 'stdout')
    const stderrPath = path.join(tempDir, 'stderr')
    stdoutFd = fs.openSync(stdoutPath, 'wx', 0o600)
    stderrFd = fs.openSync(stderrPath, 'wx', 0o600)

    const result = spawnSync(executablePath, [...args], {
      shell: false,
      windowsHide: true,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      stdio: ['ignore', stdoutFd, stderrFd],
      env: buildSafeSubprocessEnv(options.env),
    })

    fs.closeSync(stdoutFd)
    stdoutFd = undefined
    fs.closeSync(stderrFd)
    stderrFd = undefined

    const stdoutBuf = fs.readFileSync(stdoutPath)
    const stderrBuf = fs.readFileSync(stderrPath)
    const maxCaptureBytes = providerId === 'codex' && operation === 'models'
      ? MAX_CODEX_MODEL_CATALOG_BYTES
      : MAX_CAPTURE_BYTES
    const stdoutText = stdoutBuf.subarray(0, maxCaptureBytes).toString('utf8')
    const stderrText = stderrBuf.subarray(0, MAX_CAPTURE_BYTES).toString('utf8')

    const timedOut =
      result.error?.code === 'ETIMEDOUT' ||
      result.signal === 'SIGTERM' ||
      result.signal === 'SIGKILL'

    if (timedOut) {
      return {
        ok: false,
        errorCode: SAFE_ERROR_CODES.PROBE_TIMEOUT,
        timedOut: true,
        status: result.status,
        stdoutText: '',
        stderrText: '',
      }
    }

    if (result.error) {
      return {
        ok: false,
        errorCode: SAFE_ERROR_CODES.PROBE_SPAWN_ERROR,
        timedOut: false,
        status: result.status,
        stdoutText: '',
        stderrText: '',
      }
    }

    return {
      ok: true,
      errorCode: null,
      timedOut: false,
      status: result.status,
      stdoutText,
      stderrText,
    }
  } finally {
    if (stdoutFd !== undefined) {
      try {
        fs.closeSync(stdoutFd)
      } catch {
        // Ignore close error
      }
    }
    if (stderrFd !== undefined) {
      try {
        fs.closeSync(stderrFd)
      } catch {
        // Ignore close error
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}
