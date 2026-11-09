import { agentMessage } from './requestI18n.mjs'
import {
  LIBRARY_ERROR_CODES,
  validateLibraryItemName,
  validateSkillRelativeFilePath,
} from './libraryPaths.mjs'
import { hasForbiddenObjectKeys, isPlainObject } from './providerContracts.mjs'

export const MAX_SKILL_FILE_BYTES = 256 * 1024
export const MAX_SKILL_HTTP_BODY_BYTES = 512 * 1024
export const MAX_SKILLS_COUNT = 200

export const SKILL_ERROR_CODES = Object.freeze({
  ...LIBRARY_ERROR_CODES,
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  SKILL_ALREADY_EXISTS: 'SKILL_ALREADY_EXISTS',
  SKILL_FILE_TOO_LARGE: 'SKILL_FILE_TOO_LARGE',
  INVALID_SKILL_CONTENT: 'INVALID_SKILL_CONTENT',
  INVALID_FRONTMATTER: 'INVALID_FRONTMATTER',
  INVALID_JSON_OBJECT: 'INVALID_JSON_OBJECT',
  MAX_SKILLS_EXCEEDED: 'MAX_SKILLS_EXCEEDED',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
})

export function buildSkillMarkdown(name, description, bodyMarkdown = '') {
  const cleanName = String(name ?? '').trim()
  const cleanDesc = String(description ?? '').replace(/\r?\n/g, ' ').trim()
  const defaultBody = bodyMarkdown.trim()
    ? bodyMarkdown.replace(/^\r?\n+/, '')
    : `# ${cleanName}\n\n${cleanDesc}\n\n## Instructions\n\n- ${agentMessage('agent.skill.defaultInstructions')}\n`

  return `---\nname: ${cleanName}\ndescription: ${cleanDesc}\n---\n\n${defaultBody.endsWith('\n') ? defaultBody : `${defaultBody}\n`}`
}

export function parseSkillFrontmatter(markdownContent) {
  if (typeof markdownContent !== 'string') {
    return { name: '', description: '', body: '' }
  }
  const normalized = markdownContent.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized)
  if (!match) {
    return { name: '', description: '', body: normalized }
  }
  const frontmatterBlock = match[1]
  const body = match[2] ?? ''
  let name = ''
  let description = ''
  for (const line of frontmatterBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val = line.slice(colonIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key === 'name') name = val
    if (key === 'description') description = val
  }
  return { name, description, body }
}

export function validateSkillCreateInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: SKILL_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.http.invalidJsonObject'),
    }
  }
  const nameCheck = validateLibraryItemName(payload.name)
  if (!nameCheck.ok) return nameCheck

  const description = typeof payload.description === 'string' ? payload.description.trim() : ''
  if (!description || description.length > 500) {
    return {
      ok: false,
      errorCode: SKILL_ERROR_CODES.INVALID_FRONTMATTER,
      message: agentMessage('agent.skill.descriptionRequired'),
    }
  }

  let content
  if (typeof payload.content === 'string' && payload.content.trim()) {
    const byteLen = Buffer.byteLength(payload.content, 'utf8')
    if (byteLen > MAX_SKILL_FILE_BYTES) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_FILE_TOO_LARGE,
        message: agentMessage('agent.skill.fileTooLarge', { max: MAX_SKILL_FILE_BYTES }),
      }
    }
    const parsed = parseSkillFrontmatter(payload.content)
    if (!parsed.name || !parsed.description) {
      content = buildSkillMarkdown(nameCheck.value, description, payload.content)
    } else {
      content = buildSkillMarkdown(nameCheck.value, description, parsed.body)
    }
  } else {
    const body = typeof payload.body === 'string' ? payload.body : ''
    content = buildSkillMarkdown(nameCheck.value, description, body)
  }

  const extraFiles = []
  if (Array.isArray(payload.files)) {
    for (const item of payload.files) {
      if (!isPlainObject(item)) continue
      const pathCheck = validateSkillRelativeFilePath(item.path)
      if (!pathCheck.ok) return pathCheck
      if (pathCheck.value === 'SKILL.md') continue
      const fileContent = typeof item.content === 'string' ? item.content : ''
      if (Buffer.byteLength(fileContent, 'utf8') > MAX_SKILL_FILE_BYTES) {
        return {
          ok: false,
          errorCode: SKILL_ERROR_CODES.SKILL_FILE_TOO_LARGE,
          message: agentMessage('agent.skill.attachmentTooLarge', { path: pathCheck.value, max: '256KB' }),
        }
      }
      extraFiles.push({ path: pathCheck.value, content: fileContent })
    }
  }

  return {
    ok: true,
    value: {
      name: nameCheck.value,
      description,
      content,
      files: extraFiles,
    },
  }
}

export function validateSkillUpdateInput(currentName, payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: SKILL_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.http.invalidJsonObject'),
    }
  }
  const nextNameRaw = payload.newName !== undefined ? payload.newName : payload.name ?? currentName
  const nameCheck = validateLibraryItemName(nextNameRaw)
  if (!nameCheck.ok) return nameCheck

  let description = typeof payload.description === 'string' ? payload.description.trim() : undefined
  if (description !== undefined && (!description || description.length > 500)) {
    return {
      ok: false,
      errorCode: SKILL_ERROR_CODES.INVALID_FRONTMATTER,
      message: agentMessage('agent.skill.descriptionRequired'),
    }
  }

  let content = undefined
  if (typeof payload.content === 'string') {
    if (Buffer.byteLength(payload.content, 'utf8') > MAX_SKILL_FILE_BYTES) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_FILE_TOO_LARGE,
        message: agentMessage('agent.skill.fileTooLarge', { max: MAX_SKILL_FILE_BYTES }),
      }
    }
    content = payload.content
  }

  const body = typeof payload.body === 'string' ? payload.body : undefined

  return {
    ok: true,
    value: {
      name: nameCheck.value,
      description,
      content,
      body,
    },
  }
}
