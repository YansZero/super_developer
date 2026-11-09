// eslint-disable-next-line no-control-regex
const ANSI_CSI = /\u001B\[[0-?]*[ -/]*[@-~]/g
// eslint-disable-next-line no-control-regex
const ANSI_OSC = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g
const ANSI_STRING_CSI = /\\(?:u001b|x1b)\[[0-?]*[ -/]*[@-~]/gi
// eslint-disable-next-line no-control-regex
const TERMINAL_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/** Remove terminal styling/control sequences while keeping ordinary Unicode text. */
export function sanitizeCliOutput(value) {
  if (typeof value !== 'string' || !value) return ''
  return value
    .replace(ANSI_OSC, '')
    .replace(ANSI_CSI, '')
    .replace(ANSI_STRING_CSI, '')
    .replace(/␛\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(TERMINAL_CONTROLS, '')
}
