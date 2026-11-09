import { agentMessage } from './requestI18n.mjs'
import os from 'node:os'
import fs from 'node:fs'
import { execFile } from 'node:child_process'
import { PROJECT_SCAN_ERROR_CODES, validateProjectPath } from './projectScanContracts.mjs'

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

function pickerCommand(platform = os.platform()) {
  if (platform === 'linux') {
    return {
      file: 'zenity',
      args: ['--file-selection', '--directory', '--multiple', '--separator=|', `--title=${agentMessage('agent.project.pickerTitle')}`],
    }
  }
  if (platform === 'darwin') {
    return {
      file: 'osascript',
      args: [
        '-e',
        `set selectedFolders to choose folder with prompt "${agentMessage('agent.project.pickerTitle')}" with multiple selections allowed`,
        '-e',
        'set output to ""',
        '-e',
        'repeat with folderItem in selectedFolders',
        '-e',
        'set output to output & (POSIX path of folderItem) & linefeed',
        '-e',
        'end repeat',
        '-e',
        'return output',
      ],
    }
  }
  if (platform === 'win32') {
    return {
      file: 'powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = ' + agentMessage('agent.project.pickerTitle') + '; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
      ],
    }
  }
  return null
}

export function createProjectFolderPicker(options = {}) {
  const runner = options.runner || createDefaultRunner()
  const platform = options.platform || os.platform()

  return {
    async pick() {
      const command = pickerCommand(platform)
      if (!command) {
        return {
          ok: false,
          errorCode: PROJECT_SCAN_ERROR_CODES.PICKER_UNAVAILABLE,
          message: agentMessage('agent.project.pickerUnavailable'),
        }
      }

      const result = await runner(command.file, command.args, {
        timeout: 120000,
        maxBuffer: 32 * 1024,
        env: { ...process.env, LANG: 'zh_TW.UTF-8' },
      })
      if (result.exitCode !== 0) {
        if (result.error?.code === 'ENOENT') {
          return {
            ok: false,
            errorCode: PROJECT_SCAN_ERROR_CODES.PICKER_UNAVAILABLE,
            message: agentMessage('agent.project.pickerNotFound'),
          }
        }
        return {
          ok: false,
          errorCode: PROJECT_SCAN_ERROR_CODES.PICKER_CANCELLED,
          message: agentMessage('agent.project.pickerCancelled'),
        }
      }

      const selectedPaths = result.stdout
        .split(platform === 'linux' ? '|' : /\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
      const validPaths = selectedPaths.flatMap((selectedPath) => {
        const pathCheck = validateProjectPath(selectedPath)
        return pathCheck.ok ? [pathCheck.value] : []
      })
      if (validPaths.length === 0) {
        return {
          ok: false,
          errorCode: PROJECT_SCAN_ERROR_CODES.PICKER_UNAVAILABLE,
          message: agentMessage('agent.project.pickerNoFolder'),
        }
      }
      return { ok: true, projectPaths: [...new Set(validPaths)] }
    },
  }
}

export function openFolderCommand(targetPath, platform = os.platform()) {
  if (platform === 'darwin') {
    return { file: 'open', args: [targetPath] }
  }
  if (platform === 'win32') {
    return { file: 'explorer.exe', args: [targetPath] }
  }
  return { file: 'xdg-open', args: [targetPath] }
}

export function createProjectFolderOpener(options = {}) {
  const runner = options.runner || createDefaultRunner()
  const platform = options.platform || os.platform()

  return {
    async open(folderPath) {
      const pathCheck = validateProjectPath(folderPath)
      if (!pathCheck.ok) {
        return pathCheck
      }
      const targetPath = pathCheck.value
      try {
        const stat = fs.statSync(targetPath)
        if (!stat.isDirectory()) {
          return {
            ok: false,
            errorCode: PROJECT_SCAN_ERROR_CODES.PROJECT_NOT_DIRECTORY,
            message: agentMessage('agent.project.notDirectory'),
          }
        }
      } catch {
        return {
          ok: false,
          errorCode: PROJECT_SCAN_ERROR_CODES.PROJECT_NOT_FOUND,
          message: agentMessage('agent.project.folderNotFound'),
        }
      }

      const command = openFolderCommand(targetPath, platform)
      const result = await runner(command.file, command.args, {
        timeout: 10000,
        env: { ...process.env },
      })
      if (result.exitCode !== 0) {
        return {
          ok: false,
          errorCode: 'OPEN_FOLDER_FAILED',
          message: result.stderr.trim() || result.stdout.trim() || agentMessage('agent.project.openFolderFailed'),
        }
      }
      return { ok: true, message: agentMessage('agent.project.openFolderSuccess') }
    },
  }
}
