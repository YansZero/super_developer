const ANSI_CSI = /\u001B\[[0-?]*[ -/]*[@-~]/g
const ANSI_OSC = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g
const ANSI_STRING_CSI = /\\(?:u001b|x1b)\[[0-?]*[ -/]*[@-~]/gi
const TERMINAL_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function sanitizeTerminalOutput(value: string | null | undefined): string {
  if (!value) return ''
  return value
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_STRING_CSI, '')
    .replace(/␛\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(TERMINAL_CONTROLS, '')
}
