import { agentMessage } from './requestI18n.mjs'
import {
  validateLibraryItemName,
  validateSkillRelativeFilePath,
} from './libraryPaths.mjs'
import {
  MAX_SKILL_FILE_BYTES,
  buildSkillMarkdown,
  parseSkillFrontmatter,
} from './skillContracts.mjs'
import { validateMcpDefinitionInput } from './mcpContracts.mjs'

export function buildSkillAssistPrompt({ mode, name, description, currentContent, instruction }) {
  const modeText = mode === 'edit' ? agentMessage('agent.library.editSkill') : agentMessage('agent.library.createSkill')
  const currentBlock =
    mode === 'edit' && typeof currentContent === 'string' && currentContent.trim()
      ? `\n<current_skill>\n${currentContent}\n</current_skill>\n`
      : ''

  return [
    agentMessage('agent.library.taskType', { type: modeText }),
    name ? agentMessage('agent.library.suggestedName', { name }) : agentMessage('agent.library.autoNameHint'),
    description ? agentMessage('agent.library.descHint', { desc: description }) : '',
    currentBlock,
    agentMessage('agent.library.userInstruction', { instruction }),
    '',
    agentMessage('agent.library.skillPromptNote'),
    '<skill_draft>',
    agentMessage('agent.library.skillDraftNameTag'),
    agentMessage('agent.library.skillDraftDescTag'),
    '<skill_file path="SKILL.md">',
    '---',
    `name: ${agentMessage('agent.library.autoNameHint')}`,
    `description: ${agentMessage('agent.library.descHint', { desc: '' }).replace('：', '')}`,
    '---',
    '',
    agentMessage('agent.library.skillTitlePrompt'),
    '</skill_file>',
    '<!-- <skill_file path="scripts/example.sh">...</skill_file> -->',
    '</skill_draft>',
  ]
    .filter(Boolean)
    .join('\n')
}

export function parseSkillAssistDraft(rawOutput, fallbackName = 'new-skill') {
  if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
    return {
      ok: false,
      errorCode: 'EMPTY_AI_OUTPUT',
      message: agentMessage('agent.library.emptyAiOutput'),
    }
  }

  const draftMatches = [...rawOutput.matchAll(/<skill_draft>([\s\S]*?)<\/skill_draft>/gi)]
  const draftMatch = draftMatches.at(-1)
  const searchRegion = draftMatch ? draftMatch[1] : rawOutput

  const nameMatch = /<name>([\s\S]*?)<\/name>/i.exec(searchRegion)
  const descMatch = /<description>([\s\S]*?)<\/description>/i.exec(searchRegion)

  const fileRegex = /<skill_file\s+path=["']([^"']+)["']\s*>([\s\S]*?)<\/skill_file>/gi
  const files = []
  let skillMdRaw = null
  let match

  while ((match = fileRegex.exec(searchRegion)) !== null) {
    const rawPath = match[1].trim()
    const rawFileContent = match[2].replace(/^\r?\n/, '').replace(/\r?\n$/, '')
    const pathCheck = validateSkillRelativeFilePath(rawPath)
    if (!pathCheck.ok) {
      return pathCheck
    }
    if (Buffer.byteLength(rawFileContent, 'utf8') > MAX_SKILL_FILE_BYTES) {
      return {
        ok: false,
        errorCode: 'SKILL_FILE_TOO_LARGE',
        message: agentMessage('agent.library.fileTooLarge', { path: pathCheck.value, max: '256KB' }),
      }
    }
    if (pathCheck.value === 'SKILL.md') {
      skillMdRaw = rawFileContent
    } else {
      files.push({ path: pathCheck.value, content: rawFileContent })
    }
  }

  // Fallback if AI didn't use <skill_file> tags but output markdown frontmatter
  if (skillMdRaw === null && draftMatch) {
    skillMdRaw = searchRegion
      .replace(/<name>[\s\S]*?<\/name>/gi, '')
      .replace(/<description>[\s\S]*?<\/description>/gi, '')
      .trim()
  } else if (skillMdRaw === null && rawOutput.includes('---')) {
    skillMdRaw = rawOutput.trim()
  }

  if (!skillMdRaw) {
    return {
      ok: false,
      errorCode: 'INVALID_AI_DRAFT_FORMAT',
      message: agentMessage('agent.library.invalidSkillDraft'),
    }
  }

  const parsedFm = parseSkillFrontmatter(skillMdRaw)
  const candidateName = (nameMatch?.[1]?.trim() || parsedFm.name || fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  const nameCheck = validateLibraryItemName(candidateName || 'custom-skill')
  if (!nameCheck.ok) return nameCheck

  const candidateDesc = (
    descMatch?.[1]?.trim() ||
    parsedFm.description ||
    `AI generated skill: ${nameCheck.value}`
  ).slice(0, 500)

  const body = parsedFm.body || skillMdRaw
  const content = buildSkillMarkdown(nameCheck.value, candidateDesc, body)

  return {
    ok: true,
    draft: {
      name: nameCheck.value,
      description: candidateDesc,
      body,
      content,
      files,
    },
  }
}

export function buildMcpAssistPrompt({ mode, name, currentDefinition, instruction }) {
  const modeText = mode === 'edit' ? agentMessage('agent.library.editMcp') : agentMessage('agent.library.createMcp')
  let sanitizedCurrent = ''
  if (mode === 'edit' && currentDefinition && typeof currentDefinition === 'object') {
    const safeCopy = {
      name: currentDefinition.name,
      description: currentDefinition.description,
      transport: currentDefinition.transport,
      command: currentDefinition.command,
      args: currentDefinition.args,
      url: currentDefinition.url,
      env: currentDefinition.env || {},
      headers: currentDefinition.headers || {},
    }
    sanitizedCurrent = `\n<current_mcp>\n${JSON.stringify(safeCopy, null, 2)}\n</current_mcp>\n`
  }

  return [
    agentMessage('agent.library.taskType', { type: modeText }),
    name ? agentMessage('agent.library.suggestedName', { name }) : agentMessage('agent.library.autoNameHint'),
    sanitizedCurrent,
    agentMessage('agent.library.userInstruction', { instruction }),
    '',
    agentMessage('agent.library.mcpPromptNote'),
    agentMessage('agent.library.mcpJsonPrompt'),
    '<mcp_draft>',
    JSON.stringify(
      {
        name: name || 'example-mcp',
        description: agentMessage('agent.library.mcpDefaultDesc'),
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-example'],
        url: null,
        env: {},
        headers: {},
        secretEnvKeys: ['API_TOKEN'],
        secretHeaderKeys: [],
      },
      null,
      2,
    ),
    '</mcp_draft>',
  ]
    .filter(Boolean)
    .join('\n')
}

const SECRET_LIKE_KEY_REGEX = /(token|secret|password|passwd|api[_-]?key|auth|bearer|credential|private[_-]?key)/i

export function parseMcpAssistDraft(rawOutput, fallbackName = 'custom-mcp') {
  if (typeof rawOutput !== 'string' || !rawOutput.trim()) {
    return {
      ok: false,
      errorCode: 'EMPTY_AI_OUTPUT',
      message: agentMessage('agent.library.emptyMcpDraft'),
    }
  }

  const draftMatches = [...rawOutput.matchAll(/<mcp_draft>([\s\S]*?)<\/mcp_draft>/gi)]
  const draftMatch = draftMatches.at(-1)
  let jsonCandidate = draftMatch ? draftMatch[1].trim() : rawOutput.trim()
  jsonCandidate = jsonCandidate
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()

  let parsed
  try {
    parsed = JSON.parse(jsonCandidate)
  } catch {
    return {
      ok: false,
      errorCode: 'INVALID_AI_DRAFT_FORMAT',
      message: agentMessage('agent.library.invalidMcpDraftJson'),
    }
  }

  const candidateName = String(parsed?.name || fallbackName)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  const plainEnv = {}
  const secretEnv = {}
  const warnings = []

  if (parsed?.env && typeof parsed.env === 'object' && !Array.isArray(parsed.env)) {
    for (const [k, v] of Object.entries(parsed.env)) {
      const strVal = String(v ?? '')
      if (SECRET_LIKE_KEY_REGEX.test(k) || strVal.startsWith('${secret:')) {
        secretEnv[k] = ''
        warnings.push(agentMessage('agent.library.detectedSecretEnv', { key: k }))
      } else {
        plainEnv[k] = strVal
      }
    }
  }

  if (Array.isArray(parsed?.secretEnvKeys)) {
    for (const k of parsed.secretEnvKeys) {
      if (typeof k === 'string' && k.trim()) {
        secretEnv[k.trim()] = ''
      }
    }
  }

  const plainHeaders = {}
  const secretHeaders = {}
  if (parsed?.headers && typeof parsed.headers === 'object' && !Array.isArray(parsed.headers)) {
    for (const [k, v] of Object.entries(parsed.headers)) {
      const strVal = String(v ?? '')
      if (SECRET_LIKE_KEY_REGEX.test(k) || strVal.startsWith('${secret:')) {
        secretHeaders[k] = ''
        warnings.push(agentMessage('agent.library.detectedSecretHeader', { key: k }))
      } else {
        plainHeaders[k] = strVal
      }
    }
  }

  if (Array.isArray(parsed?.secretHeaderKeys)) {
    for (const k of parsed.secretHeaderKeys) {
      if (typeof k === 'string' && k.trim()) {
        secretHeaders[k.trim()] = ''
      }
    }
  }

  const check = validateMcpDefinitionInput({
    name: candidateName || 'custom-mcp',
    description: typeof parsed?.description === 'string' ? parsed.description : '',
    transport: parsed?.transport === 'http' ? 'http' : 'stdio',
    command: parsed?.command ?? (parsed?.transport === 'http' ? null : 'npx'),
    args: Array.isArray(parsed?.args) ? parsed.args.map(String) : [],
    url: parsed?.url ?? null,
    env: plainEnv,
    headers: plainHeaders,
    secretEnv,
    secretHeaders,
  })

  if (!check.ok) return check

  return {
    ok: true,
    draft: {
      ...check.value,
      warnings,
    },
  }
}
