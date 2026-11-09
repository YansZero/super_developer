import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createNodeI18n } from '../shared/nodeI18n.mjs'

const { t } = createNodeI18n(process.env.SD_LOCALE || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || Intl.DateTimeFormat().resolvedOptions().locale)

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mcpsDir = path.join(repoRoot, 'library', 'mcps')
const mcpBinDir = path.join(mcpsDir, '.bin')
const mcpVenvDir = path.join(mcpsDir, '.venv')
const nodeBinDir = path.join(repoRoot, 'node_modules', '.bin')

fs.mkdirSync(mcpBinDir, { recursive: true, mode: 0o700 })

function runStep(title, cmd, args, cwd = repoRoot) {
  console.log(`\n==> ${title}`)
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  })
  if (res.status !== 0) {
    console.error(`❌ ${t('mcp.setup.stepFailed', { title, code: res.status })}`)
    return false
  }
  return true
}

function linkExecutable(srcPath, destName) {
  if (!fs.existsSync(srcPath)) return false
  const destPath = path.join(mcpBinDir, destName)
  try {
    fs.rmSync(destPath, { force: true })
    fs.symlinkSync(srcPath, destPath)
    console.log(`✅ ${t('mcp.setup.linked', { name: destName, path: srcPath })}`)
    return true
  } catch (err) {
    console.warn(`⚠️ ${t('mcp.setup.linkFailed', { name: destName })}`, err.message)
    return false
  }
}

// 1. Setup Node-based MCP tools (CodeGraph)
const localCodegraph = path.join(nodeBinDir, 'codegraph')
if (!fs.existsSync(localCodegraph)) {
  runStep(
    t('mcp.setup.installCodegraph'),
    'npm',
    ['install', '--no-audit', '--no-fund', '--save-dev', '@colbymchenry/codegraph'],
  )
}
if (fs.existsSync(localCodegraph)) {
  linkExecutable(localCodegraph, 'codegraph')
}

// 2. Setup Python-based MCP tools (Graphify) inside library/mcps/.venv
const venvGraphifyMcp = path.join(mcpVenvDir, 'bin', 'graphify-mcp')
const venvGraphify = path.join(mcpVenvDir, 'bin', 'graphify')

function findVenvCapablePython() {
  const pythonCandidates = [
    'python3',
    'python3.13',
    'python3.12',
    'python3.11',
    'python3.10',
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/opt/homebrew/bin/python3',
  ]

  let detectedVersion = null

  for (const candidate of pythonCandidates) {
    const verRes = spawnSync(candidate, ['--version'], { encoding: 'utf8' })
    if (verRes.status === 0 && verRes.stdout) {
      if (!detectedVersion) {
        detectedVersion = verRes.stdout.trim()
      }
      // Check if candidate actually supports venv + ensurepip
      const venvRes = spawnSync(candidate, ['-c', 'import venv, ensurepip'], { encoding: 'utf8' })
      if (venvRes.status === 0) {
        return { pythonCmd: candidate, version: detectedVersion, ok: true }
      }
    }
  }

  return { pythonCmd: null, version: detectedVersion, ok: false }
}

if (!fs.existsSync(venvGraphifyMcp)) {
  const { pythonCmd, version, ok } = findVenvCapablePython()

  if (!ok) {
    console.log(`\n==> ${t('mcp.setup.createVenv')}`)
    if (version) {
      console.warn(t('mcp.setup.venvModuleMissing', { version }))
    } else {
      console.warn(t('mcp.setup.pythonMissing'))
    }
    const matchMajorMinor = version ? version.match(/Python\s+(3\.\d+)/i) : null
    const specificPkg = matchMajorMinor ? `python${matchMajorMinor[1]}-venv` : 'python3-venv'
    const pkgText = specificPkg === 'python3-venv' ? 'python3-venv' : `python3-venv (或 ${specificPkg})`
    console.warn(`${t('mcp.setup.graphifyNotice', { pkg: pkgText })}\n`)
  } else if (runStep(t('mcp.setup.createVenv'), pythonCmd, ['-m', 'venv', mcpVenvDir])) {
    const pipCmd = path.join(mcpVenvDir, 'bin', 'pip')
    runStep(t('mcp.setup.installGraphify'), pipCmd, ['install', '--upgrade', 'pip', 'graphifyy[mcp]'])
  } else {
    try { fs.rmSync(mcpVenvDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

if (fs.existsSync(venvGraphifyMcp)) {
  linkExecutable(venvGraphifyMcp, 'graphify-mcp')
}
if (fs.existsSync(venvGraphify)) {
  linkExecutable(venvGraphify, 'graphify')
}

console.log(`\n🎉 ${t('mcp.setup.complete')}`)
console.log(`   ${t('mcp.setup.binDirectory', { path: mcpBinDir })}`)
