export const PUBLIC_CONFIG_FIELDS = Object.freeze([
  'ATLASSIAN_CLIENT_ID',
  'ATLASSIAN_CALLBACK_URL',
  'ATLASSIAN_SCOPES',
  'FRONTEND_URL',
  'SD_BFF_PORT',
  'SD_DATABASE_PATH',
])

const allowedScopes = ['read:me', 'read:jira-work', 'offline_access']
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

function hasControlCharacters(value) {
  return [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

function validUrl(value, originOnly) {
  // Reject URL parser normalization of whitespace, slashes or encoded redirects.
  if (!/^https?:\/\//.test(value) || /[\s\\]/.test(value)) return false
  try {
    const url = new URL(value)
    if (url.username || url.password || value.includes('#') || value.includes('?')) return false
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHosts.has(url.hostname))) return false
    if (originOnly) return url.pathname === '/'
    return url.pathname === '/auth/jira/callback'
  } catch {
    return false
  }
}

/** Read only the six public keys. Never enumerate or copy an environment object. */
export function loadJiraPublicConfig(environment) {
  const fields = PUBLIC_CONFIG_FIELDS.map((field) => {
    const input = environment[field]
    const value = typeof input === 'string' ? input.trim() : ''
    let valid = false
    if (value) {
      switch (field) {
        case 'ATLASSIAN_CLIENT_ID':
          valid = !/\s/.test(value) && !hasControlCharacters(value)
          break
        case 'ATLASSIAN_CALLBACK_URL':
          valid = validUrl(value, false)
          break
        case 'ATLASSIAN_SCOPES': {
          const scopes = [...new Set(value.split(/\s+/))]
          valid = scopes.length === allowedScopes.length && scopes.every((scope) => allowedScopes.includes(scope))
          break
        }
        case 'FRONTEND_URL':
          valid = validUrl(value, true)
          break
        case 'SD_BFF_PORT':
          valid = /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535
          break
        case 'SD_DATABASE_PATH':
          valid = !hasControlCharacters(value) && !/^[a-z][a-z\d+.-]*:\/\//i.test(value) && ![':memory:', '.', '..'].includes(value) && !/[\\/]$/.test(value)
          break
      }
    }
    return { field, status: !value ? 'missing' : valid ? 'valid' : 'invalid', value }
  })
  const valid = fields.every(({ status }) => status === 'valid')
  const config = valid ? {
    clientId: fields[0].value,
    callbackUrl: fields[1].value,
    scopes: [...new Set(fields[2].value.split(/\s+/))],
    frontendUrl: fields[3].value,
    port: Number(fields[4].value),
    databasePath: fields[5].value,
  } : null
  return { valid, config, fields: fields.map(({ field, status }) => ({ field, status })) }
}
