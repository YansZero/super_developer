import crypto from 'node:crypto'
import { parseEnv } from 'node:util'

export function initializeSecrets(source) {
  const parsed = parseEnv(source)
  for (const [key, encoding] of [['SESSION_SECRET', 'base64url'], ['TOKEN_ENCRYPTION_KEY', 'hex']]) {
    const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=.*$`, 'gm')
    const matches = [...source.matchAll(pattern)]
    if (matches.length > 1) throw new Error(`${key} 重複設定，請先手動整理。`)
    if (parsed[key]?.trim()) continue
    const line = `${key}=${crypto.randomBytes(32).toString(encoding)}`
    source = matches.length ? source.replace(pattern, line) : `${source.replace(/\s*$/, '')}\n${line}\n`
  }
  return source
}
