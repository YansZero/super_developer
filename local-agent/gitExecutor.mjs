import { agentMessage } from './requestI18n.mjs'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  GIT_ERROR_CODES,
  validateCommitMessage,
  validateRelativeFilePath,
  validateRelativeFilePathList,
} from './gitContracts.mjs'

function parsePorcelainStatusOutput(rawStdout) {
  const files = []
  const lines = String(rawStdout || '').split(/\r?\n/)
  for (const line of lines) {
    if (!line || line.length < 4) continue
    const xy = line.slice(0, 2)
    let filePath = line.slice(3).trim()
    if (filePath.includes(' -> ')) {
      filePath = filePath.split(' -> ').pop().trim()
    }
    if (filePath.startsWith('"') && filePath.endsWith('"')) {
      filePath = filePath.slice(1, -1)
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

function isRealGitRepository(targetDir) {
  if (!targetDir) return false
  const gitPath = path.join(targetDir, '.git')
  try {
    const stat = fs.statSync(gitPath)
    if (stat.isFile()) return true
    if (stat.isDirectory()) {
      return (
        fs.existsSync(path.join(gitPath, 'HEAD')) ||
        fs.existsSync(path.join(gitPath, 'config'))
      )
    }
  } catch {
    return false
  }
  return false
}

export function createGitExecutor(options = {}) {
  const runner =
    options.runner ||
    ((file, args, execOptions) =>
      new Promise((resolve) => {
        execFile(file, args, execOptions, (error, stdout, stderr) => {
          resolve({
            error,
            stdout: String(stdout || ''),
            stderr: String(stderr || ''),
            exitCode: error ? (error.code ?? 1) : 0,
          })
        })
      }))

  return {
    async execute({ command, projectPath, branch, filePath, files, commitMessage, isDemoFixture = false }) {
      const targetDir = projectPath ? path.resolve(projectPath) : null
      const isRealGitRepo = isRealGitRepository(targetDir)

      if (isRealGitRepo) {
        if (command === 'uncommitted-files') {
          const res = await runner('git', ['status', '--porcelain=v1', '-uall'], {
            cwd: targetDir,
            timeout: 15000,
            env: { ...process.env, LANG: 'en_US.UTF-8' },
          })
          return {
            ok: res.exitCode === 0,
            command,
            projectPath: targetDir,
            exitCode: res.exitCode,
            stdout: res.stdout,
            stderr: res.stderr,
            files: parsePorcelainStatusOutput(res.stdout),
            isSimulated: false,
            timestamp: new Date().toISOString(),
          }
        }

        if (command === 'file-diff') {
          const pathCheck = validateRelativeFilePath(filePath)
          if (!pathCheck.ok) return pathCheck
          const safeRelPath = pathCheck.value
          const res = await runner('git', ['diff', 'HEAD', '--', safeRelPath], {
            cwd: targetDir,
            timeout: 15000,
            env: { ...process.env, LANG: 'en_US.UTF-8' },
          })
          let diffStdout = res.stdout
          if (!diffStdout.trim()) {
            const stagedRes = await runner('git', ['diff', '--cached', '--', safeRelPath], {
              cwd: targetDir,
              timeout: 15000,
              env: { ...process.env, LANG: 'en_US.UTF-8' },
            })
            diffStdout = stagedRes.stdout
          }
          if (!diffStdout.trim()) {
            const absFile = path.resolve(targetDir, safeRelPath)
            if (absFile.startsWith(targetDir + path.sep) && fs.existsSync(absFile)) {
              try {
                const stat = fs.statSync(absFile)
                if (stat.isFile() && stat.size <= 256 * 1024) {
                  const content = fs.readFileSync(absFile, 'utf8')
                  const lines = content.split(/\r?\n/)
                  diffStdout = [
                    `diff --git a/${safeRelPath} b/${safeRelPath}`,
                    'new file mode 100644',
                    '--- /dev/null',
                    `+++ b/${safeRelPath}`,
                    `@@ -0,0 +1,${lines.length} @@`,
                    ...lines.map((line) => `+${line}`),
                  ].join('\n')
                }
              } catch {
                // Ignore read errors
              }
            }
          }
          return {
            ok: true,
            command,
            projectPath: targetDir,
            exitCode: 0,
            stdout: diffStdout,
            stderr: res.stderr,
            isSimulated: false,
            timestamp: new Date().toISOString(),
          }
        }

        if (command === 'commit') {
          const filesCheck = validateRelativeFilePathList(files)
          if (!filesCheck.ok) return filesCheck
          const msgCheck = validateCommitMessage(commitMessage)
          if (!msgCheck.ok) return msgCheck

          const addRes = await runner('git', ['add', '--', ...filesCheck.value], {
            cwd: targetDir,
            timeout: 15000,
            env: { ...process.env, LANG: 'en_US.UTF-8' },
          })
          if (addRes.exitCode !== 0) {
            return {
              ok: false,
              command,
              projectPath: targetDir,
              exitCode: addRes.exitCode,
              stdout: addRes.stdout,
              stderr: addRes.stderr,
              errorCode: GIT_ERROR_CODES.GIT_EXECUTION_FAILED,
              message: addRes.stderr.trim() || agentMessage('agent.git.addFailed'),
              isSimulated: false,
              timestamp: new Date().toISOString(),
            }
          }

          const commitRes = await runner('git', ['commit', '-m', msgCheck.value, '--', ...filesCheck.value], {
            cwd: targetDir,
            timeout: 15000,
            env: { ...process.env, LANG: 'en_US.UTF-8' },
          })
          return {
            ok: commitRes.exitCode === 0,
            command,
            projectPath: targetDir,
            exitCode: commitRes.exitCode,
            stdout: [addRes.stdout, commitRes.stdout].filter(Boolean).join('\n'),
            stderr: [addRes.stderr, commitRes.stderr].filter(Boolean).join('\n'),
            ...(commitRes.exitCode !== 0
              ? {
                  errorCode: GIT_ERROR_CODES.GIT_EXECUTION_FAILED,
                  message: commitRes.stderr.trim() || commitRes.stdout.trim() || agentMessage('agent.git.commitFailed'),
                }
              : {}),
            isSimulated: false,
            timestamp: new Date().toISOString(),
          }
        }

        if (command === 'stash') {
          const filesCheck = validateRelativeFilePathList(files)
          if (!filesCheck.ok) return filesCheck

          const stashArgs = ['stash', 'push', '-u']
          if (commitMessage && typeof commitMessage === 'string' && commitMessage.trim()) {
            const msgCheck = validateCommitMessage(commitMessage)
            if (!msgCheck.ok) return msgCheck
            stashArgs.push('-m', msgCheck.value)
          }
          stashArgs.push('--', ...filesCheck.value)

          const stashRes = await runner('git', stashArgs, {
            cwd: targetDir,
            timeout: 15000,
            env: { ...process.env, LANG: 'en_US.UTF-8' },
          })

          return {
            ok: stashRes.exitCode === 0,
            command,
            projectPath: targetDir,
            exitCode: stashRes.exitCode,
            stdout: stashRes.stdout,
            stderr: stashRes.stderr,
            ...(stashRes.exitCode !== 0
              ? {
                  errorCode: GIT_ERROR_CODES.GIT_EXECUTION_FAILED,
                  message: stashRes.stderr.trim() || stashRes.stdout.trim() || agentMessage('agent.git.stashFailed'),
                }
              : {}),
            isSimulated: false,
            timestamp: new Date().toISOString(),
          }
        }

        let args
        switch (command) {
          case 'status':
            args = ['status']
            break
          case 'fetch':
            args = ['fetch']
            break
          case 'pull':
            args = ['pull']
            break
          case 'push':
            args = ['push']
            break
          case 'branches':
            args = ['branch', '-a']
            break
          case 'checkout':
            if (!branch) {
              return {
                ok: false,
                errorCode: GIT_ERROR_CODES.INVALID_BRANCH_NAME,
                message: agentMessage('agent.git.checkoutBranchRequired'),
              }
            }
            args = ['checkout', branch]
            break
          case 'create-branch':
            if (!branch) {
              return {
                ok: false,
                errorCode: GIT_ERROR_CODES.INVALID_BRANCH_NAME,
                message: agentMessage('agent.git.createBranchRequired'),
              }
            }
            args = ['checkout', '-b', branch]
            break
          case 'log':
            args = ['log', '-n', '5', '--oneline']
            break
          default:
            return {
              ok: false,
              errorCode: GIT_ERROR_CODES.INVALID_GIT_COMMAND,
              message: agentMessage('agent.git.unsupportedCommand', { command }),
            }
        }

        const res = await runner('git', args, {
          cwd: targetDir,
          timeout: 15000,
          env: { ...process.env, LANG: 'en_US.UTF-8' },
        })

        return {
          ok: res.exitCode === 0,
          command,
          projectPath: targetDir,
          exitCode: res.exitCode,
          stdout: res.stdout,
          stderr: res.stderr,
          isSimulated: false,
          timestamp: new Date().toISOString(),
        }
      }

      if (!isDemoFixture) {
        return {
          ok: false,
          errorCode: GIT_ERROR_CODES.NO_GIT_REPOSITORY,
          message: agentMessage('agent.git.notGitRepo'),
        }
      }

      // Simulated output is only available to explicitly marked demo fixtures.
      if (command === 'uncommitted-files') {
        const simRaw = [
          ' M frontend/src/features/checkout/CheckoutSplitPanel.tsx',
          ' M backend/services/ledger/calculator.go',
          '?? docs/release-notes.md',
        ].join('\n')
        return {
          ok: true,
          command,
          projectPath: projectPath || '~/workspace/nebula-commerce',
          exitCode: 0,
          stdout: simRaw,
          stderr: '',
          files: parsePorcelainStatusOutput(simRaw),
          isSimulated: true,
          timestamp: new Date().toISOString(),
        }
      }

      if (command === 'file-diff') {
        const targetFile = filePath || 'frontend/src/features/checkout/CheckoutSplitPanel.tsx'
        const simDiff = [
          `diff --git a/${targetFile} b/${targetFile}`,
          'index 83db48f..bf3a10c 100644',
          `--- a/${targetFile}`,
          `+++ b/${targetFile}`,
          '@@ -10,4 +10,6 @@',
          ' export function renderPreview() {',
          '-  return false',
          '+  const enabled = true',
          '+  return enabled',
          ' }',
        ].join('\n')
        return {
          ok: true,
          command,
          projectPath: projectPath || '~/workspace/nebula-commerce',
          exitCode: 0,
          stdout: simDiff,
          stderr: '',
          isSimulated: true,
          timestamp: new Date().toISOString(),
        }
      }

      if (command === 'commit') {
        const filesCheck = validateRelativeFilePathList(files)
        if (!filesCheck.ok) return filesCheck
        const msgCheck = validateCommitMessage(commitMessage)
        if (!msgCheck.ok) return msgCheck
        const effectiveBranchSim = branch || 'feat/checkout-split-ledger'
        return {
          ok: true,
          command,
          projectPath: projectPath || '~/workspace/nebula-commerce',
          exitCode: 0,
          stdout: `[${effectiveBranchSim} c49e102] ${msgCheck.value}\n ${filesCheck.value.length} file(s) changed`,
          stderr: '',
          isSimulated: true,
          timestamp: new Date().toISOString(),
        }
      }

      if (command === 'stash') {
        const filesCheck = validateRelativeFilePathList(files)
        if (!filesCheck.ok) return filesCheck
        const effectiveBranchSim = branch || 'feat/checkout-split-ledger'
        const customMsg = commitMessage?.trim() || 'Stash via Super Developer'
        return {
          ok: true,
          command,
          projectPath: projectPath || '~/workspace/nebula-commerce',
          exitCode: 0,
          stdout: `Saved working directory and index state On ${effectiveBranchSim}: ${customMsg}\nStashed ${filesCheck.value.length} file(s).`,
          stderr: '',
          isSimulated: true,
          timestamp: new Date().toISOString(),
        }
      }

      let simStdout
      const effectiveBranch = branch || 'feat/checkout-split-ledger'
      switch (command) {
        case 'status':
          simStdout = `On branch ${effectiveBranch}
Your branch is ahead of 'origin/${effectiveBranch}' by 2 commits.
  (use "git push" to publish your local commits)

Changes not staged for commit:
  (use "git add <file>..." to update what will be committed)
  modified:   frontend/src/features/checkout/CheckoutSplitPanel.tsx
  modified:   backend/services/ledger/calculator.go

no changes added to commit (use "git add" to track)`
          break
        case 'fetch':
          simStdout = `From https://github.com/example-org/nebula-commerce
 * [new branch]      main -> origin/main
 * [new branch]      develop -> origin/develop`
          break
        case 'pull':
          simStdout = `Updating a84f21c..b92e31d
Fast-forward
 frontend/src/features/checkout/CheckoutSplitPanel.tsx | 14 +++++++++++---
 1 file changed, 11 insertions(+), 3 deletions(-)
Current branch ${effectiveBranch} is up to date with 'origin/${effectiveBranch}'.`
          break
        case 'push':
          simStdout = `To https://github.com/example-org/nebula-commerce.git
   a84f21c..b92e31d  ${effectiveBranch} -> ${effectiveBranch}
2 commits pushed successfully.`
          break
        case 'branches':
          simStdout = `* ${effectiveBranch}
  main
  develop
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
  remotes/origin/${effectiveBranch}`
          break
        case 'checkout':
          simStdout = `Switched to branch '${branch || 'main'}'`
          break
        case 'create-branch':
          simStdout = `Switched to a new branch '${branch || 'new-branch'}'`
          break
        case 'log':
          simStdout = `b92e31d (HEAD -> ${effectiveBranch}) ${agentMessage('agent.git.demoCommit1')}\na84f21c ${agentMessage('agent.git.demoCommit2')}\n7f41a82 ${agentMessage('agent.git.demoCommit3')}\ne102c91 ${agentMessage('agent.git.demoCommit4')}\n8a4f001 ${agentMessage('agent.git.demoCommit5')}`
          break
        default:
          simStdout = `Command ${command} executed.`
      }

      return {
        ok: true,
        command,
        projectPath: projectPath || '~/workspace/nebula-commerce',
        exitCode: 0,
        stdout: simStdout,
        stderr: '',
        isSimulated: true,
        timestamp: new Date().toISOString(),
      }
    },
  }
}
