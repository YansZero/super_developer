import { agentMessage } from './requestI18n.mjs'
import fs from 'node:fs'
import path from 'node:path'
import {
  ensureLibraryDirectories,
  resolveInsideLibrary,
  validateLibraryItemName,
  validateSkillRelativeFilePath,
} from './libraryPaths.mjs'
import { createInstallRegistry } from './installRegistry.mjs'
import { createTargetAdapters } from './targetAdapters.mjs'
import { writeFileAtomicallyRestricted } from './providerStorage.mjs'
import {
  MAX_SKILL_FILE_BYTES,
  MAX_SKILLS_COUNT,
  SKILL_ERROR_CODES,
  buildSkillMarkdown,
  parseSkillFrontmatter,
  validateSkillCreateInput,
  validateSkillUpdateInput,
} from './skillContracts.mjs'

function listRelativeFilesRecursively(baseDir, currentRel = '') {
  const results = []
  if (!fs.existsSync(baseDir)) return results
  const entries = fs.readdirSync(path.join(baseDir, currentRel), { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name
    const fullPath = path.join(baseDir, relPath)
    if (entry.isDirectory()) {
      results.push(...listRelativeFilesRecursively(baseDir, relPath))
    } else if (entry.isFile()) {
      const stat = fs.statSync(fullPath)
      results.push({
        path: relPath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      })
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path))
}

export function createSkillStorage(options = {}) {
  const dirs = ensureLibraryDirectories(options)
  const registry = options.registry || createInstallRegistry(options)
  const adapters = options.adapters || createTargetAdapters({ ...options, registry })

  function buildSkillRecord(skillName, includeContent = false) {
    const dirCheck = resolveInsideLibrary(options, 'skills', skillName)
    if (!dirCheck.ok) return null
    const skillDir = dirCheck.path
    if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
      return null
    }

    const skillMdPath = path.join(skillDir, 'SKILL.md')
    let rawContent = ''
    let updatedAt = fs.statSync(skillDir).mtime.toISOString()
    if (fs.existsSync(skillMdPath)) {
      rawContent = fs.readFileSync(skillMdPath, 'utf8')
      updatedAt = fs.statSync(skillMdPath).mtime.toISOString()
    }
    const parsed = parseSkillFrontmatter(rawContent)
    const files = listRelativeFilesRecursively(skillDir).filter((f) => f.path !== 'SKILL.md')
    const targets = adapters
      .listTargets()
      .map((t) => adapters.inspectSkillOnTarget(skillName, skillDir, t))

    return {
      name: skillName,
      description: parsed.description || '',
      body: includeContent ? parsed.body : undefined,
      content: includeContent ? rawContent : undefined,
      files,
      targets,
      lastCheck: registry.getLastCheck('skill', skillName),
      updatedAt,
    }
  }

  function listSkills() {
    ensureLibraryDirectories(options)
    const entries = fs.readdirSync(dirs.skillsDir, { withFileTypes: true })
    const skills = []
    for (const entry of entries) {
      if (entry.name.startsWith('.') || !entry.isDirectory()) continue
      const nameCheck = validateLibraryItemName(entry.name)
      if (!nameCheck.ok) continue
      const record = buildSkillRecord(nameCheck.value, true)
      if (record) skills.push(record)
    }
    return skills.sort((a, b) => a.name.localeCompare(b.name))
  }

  function getSkill(rawName) {
    const nameCheck = validateLibraryItemName(rawName)
    if (!nameCheck.ok) return nameCheck
    const record = buildSkillRecord(nameCheck.value, true)
    if (!record) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_NOT_FOUND,
        message: agentMessage('agent.skill.notFound', { name: nameCheck.value }),
      }
    }
    return { ok: true, skill: record }
  }

  function createSkill(payload) {
    const check = validateSkillCreateInput(payload)
    if (!check.ok) return check

    const existingList = listSkills()
    if (existingList.length >= MAX_SKILLS_COUNT) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.MAX_SKILLS_EXCEEDED,
        message: agentMessage('agent.skill.limitReached', { max: MAX_SKILLS_COUNT }),
      }
    }

    const dirCheck = resolveInsideLibrary(options, 'skills', check.value.name)
    if (!dirCheck.ok) return dirCheck
    if (fs.existsSync(dirCheck.path)) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_ALREADY_EXISTS,
        message: agentMessage('agent.skill.alreadyExists', { name: check.value.name }),
      }
    }

    fs.mkdirSync(dirCheck.path, { recursive: true, mode: 0o700 })
    const skillMdCheck = resolveInsideLibrary(options, 'skills', check.value.name, 'SKILL.md')
    if (!skillMdCheck.ok) return skillMdCheck
    writeFileAtomicallyRestricted(skillMdCheck.path, check.value.content)

    for (const extra of check.value.files) {
      const fileCheck = resolveInsideLibrary(options, 'skills', check.value.name, extra.path)
      if (!fileCheck.ok) return fileCheck
      writeFileAtomicallyRestricted(fileCheck.path, extra.content)
    }

    return { ok: true, skill: buildSkillRecord(check.value.name, true) }
  }

  function updateSkill(rawCurrentName, payload) {
    const currentCheck = validateLibraryItemName(rawCurrentName)
    if (!currentCheck.ok) return currentCheck

    const oldDirCheck = resolveInsideLibrary(options, 'skills', currentCheck.value)
    if (!oldDirCheck.ok) return oldDirCheck
    if (!fs.existsSync(oldDirCheck.path)) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_NOT_FOUND,
        message: agentMessage('agent.skill.notFound', { name: currentCheck.value }),
      }
    }

    const updateCheck = validateSkillUpdateInput(currentCheck.value, payload)
    if (!updateCheck.ok) return updateCheck

    const nextName = updateCheck.value.name
    const isRenaming = nextName !== currentCheck.value
    let targetDir = oldDirCheck.path

    if (isRenaming) {
      const newDirCheck = resolveInsideLibrary(options, 'skills', nextName)
      if (!newDirCheck.ok) return newDirCheck
      if (fs.existsSync(newDirCheck.path)) {
        return {
          ok: false,
          errorCode: SKILL_ERROR_CODES.SKILL_ALREADY_EXISTS,
          message: agentMessage('agent.skill.alreadyExists', { name: nextName }),
        }
      }

      const installedTargetIds = registry.getManagedTargets('skill', currentCheck.value)
      for (const targetId of installedTargetIds) {
        adapters.uninstallSkillFromTarget(currentCheck.value, oldDirCheck.path, targetId)
      }

      fs.renameSync(oldDirCheck.path, newDirCheck.path)
      registry.renameItem('skill', currentCheck.value, nextName)
      targetDir = newDirCheck.path

      for (const targetId of installedTargetIds) {
        adapters.installSkillToTarget(nextName, targetDir, targetId)
      }
    }

    const skillMdPath = path.join(targetDir, 'SKILL.md')
    const currentMd = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf8') : ''
    const currentParsed = parseSkillFrontmatter(currentMd)

    let nextContent
    if (updateCheck.value.content !== undefined) {
      const parsedNew = parseSkillFrontmatter(updateCheck.value.content)
      const desc = updateCheck.value.description || parsedNew.description || currentParsed.description || nextName
      const body = updateCheck.value.body !== undefined ? updateCheck.value.body : parsedNew.body
      nextContent = buildSkillMarkdown(nextName, desc, body)
    } else {
      const desc = updateCheck.value.description || currentParsed.description || nextName
      const body = updateCheck.value.body !== undefined ? updateCheck.value.body : currentParsed.body
      nextContent = buildSkillMarkdown(nextName, desc, body)
    }

    writeFileAtomicallyRestricted(skillMdPath, nextContent)
    return { ok: true, skill: buildSkillRecord(nextName, true) }
  }

  function deleteSkill(rawName) {
    const nameCheck = validateLibraryItemName(rawName)
    if (!nameCheck.ok) return nameCheck

    const dirCheck = resolveInsideLibrary(options, 'skills', nameCheck.value)
    if (!dirCheck.ok) return dirCheck
    if (!fs.existsSync(dirCheck.path)) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_NOT_FOUND,
        message: agentMessage('agent.skill.notFound', { name: nameCheck.value }),
      }
    }

    // Uninstall from all targets where we installed it
    for (const target of adapters.listTargets()) {
      const state = adapters.inspectSkillOnTarget(nameCheck.value, dirCheck.path, target)
      if (state.managed) {
        adapters.uninstallSkillFromTarget(nameCheck.value, dirCheck.path, target.id)
      }
    }

    fs.rmSync(dirCheck.path, { recursive: true, force: true })
    registry.removeItemRecord('skill', nameCheck.value)
    return { ok: true, deletedName: nameCheck.value }
  }

  function getSupportingFile(rawSkillName, rawRelPath) {
    const nameCheck = validateLibraryItemName(rawSkillName)
    if (!nameCheck.ok) return nameCheck
    const relCheck = validateSkillRelativeFilePath(rawRelPath)
    if (!relCheck.ok) return relCheck

    const fileCheck = resolveInsideLibrary(options, 'skills', nameCheck.value, relCheck.value)
    if (!fileCheck.ok) return fileCheck
    if (!fs.existsSync(fileCheck.path) || !fs.statSync(fileCheck.path).isFile()) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.FILE_NOT_FOUND,
        message: agentMessage('agent.skill.fileNotFound', { path: relCheck.value }),
      }
    }
    const content = fs.readFileSync(fileCheck.path, 'utf8')
    return {
      ok: true,
      file: {
        path: relCheck.value,
        content,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
      },
    }
  }

  function putSupportingFile(rawSkillName, rawRelPath, content) {
    const nameCheck = validateLibraryItemName(rawSkillName)
    if (!nameCheck.ok) return nameCheck
    const relCheck = validateSkillRelativeFilePath(rawRelPath)
    if (!relCheck.ok) return relCheck
    if (typeof content !== 'string') {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.INVALID_SKILL_CONTENT,
        message: agentMessage('agent.skill.contentMustBeString'),
      }
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_SKILL_FILE_BYTES) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_FILE_TOO_LARGE,
        message: agentMessage('agent.skill.attachmentBytesLimit', { max: MAX_SKILL_FILE_BYTES }),
      }
    }

    const skillDirCheck = resolveInsideLibrary(options, 'skills', nameCheck.value)
    if (!skillDirCheck.ok) return skillDirCheck
    if (!fs.existsSync(skillDirCheck.path)) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_NOT_FOUND,
        message: agentMessage('agent.skill.notFound', { name: nameCheck.value }),
      }
    }

    const fileCheck = resolveInsideLibrary(options, 'skills', nameCheck.value, relCheck.value)
    if (!fileCheck.ok) return fileCheck
    writeFileAtomicallyRestricted(fileCheck.path, content)
    return {
      ok: true,
      skill: buildSkillRecord(nameCheck.value, true),
    }
  }

  function deleteSupportingFile(rawSkillName, rawRelPath) {
    const nameCheck = validateLibraryItemName(rawSkillName)
    if (!nameCheck.ok) return nameCheck
    const relCheck = validateSkillRelativeFilePath(rawRelPath)
    if (!relCheck.ok) return relCheck
    if (relCheck.value === 'SKILL.md') {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.INVALID_RELATIVE_PATH,
        message: agentMessage('agent.skill.mainFileCannotDelete'),
      }
    }
    const fileCheck = resolveInsideLibrary(options, 'skills', nameCheck.value, relCheck.value)
    if (!fileCheck.ok) return fileCheck
    if (!fs.existsSync(fileCheck.path)) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.FILE_NOT_FOUND,
        message: agentMessage('agent.skill.fileNotFound', { path: relCheck.value }),
      }
    }
    fs.rmSync(fileCheck.path, { force: true })
    return {
      ok: true,
      skill: buildSkillRecord(nameCheck.value, true),
    }
  }

  function installSkill(rawSkillName, targetId) {
    const nameCheck = validateLibraryItemName(rawSkillName)
    if (!nameCheck.ok) return nameCheck
    const dirCheck = resolveInsideLibrary(options, 'skills', nameCheck.value)
    if (!dirCheck.ok) return dirCheck
    const res = adapters.installSkillToTarget(nameCheck.value, dirCheck.path, targetId)
    if (!res.ok) return res
    return { ok: true, skill: buildSkillRecord(nameCheck.value, true) }
  }

  function uninstallSkill(rawSkillName, targetId) {
    const nameCheck = validateLibraryItemName(rawSkillName)
    if (!nameCheck.ok) return nameCheck
    const dirCheck = resolveInsideLibrary(options, 'skills', nameCheck.value)
    if (!dirCheck.ok) return dirCheck
    const res = adapters.uninstallSkillFromTarget(nameCheck.value, dirCheck.path, targetId)
    if (!res.ok) return res
    return { ok: true, skill: buildSkillRecord(nameCheck.value, true) }
  }

  function checkAndRepairSkillInstallations(rawSkillName) {
    const nameCheck = validateLibraryItemName(rawSkillName)
    if (!nameCheck.ok) return nameCheck
    const dirCheck = resolveInsideLibrary(options, 'skills', nameCheck.value)
    if (!dirCheck.ok) return dirCheck
    if (!fs.existsSync(dirCheck.path)) {
      return {
        ok: false,
        errorCode: SKILL_ERROR_CODES.SKILL_NOT_FOUND,
        message: agentMessage('agent.skill.notFound', { name: nameCheck.value }),
      }
    }

    const actions = []
    for (const target of adapters.listTargets()) {
      const before = adapters.inspectSkillOnTarget(nameCheck.value, dirCheck.path, target)
      if (before.state === 'installed') {
        actions.push({
          targetId: target.id,
          targetName: target.name,
          action: 'already_installed',
          status: 'ok',
          message: agentMessage('agent.skill.alreadyInstalledNormal'),
        })
      } else if (before.state === 'external') {
        actions.push({
          targetId: target.id,
          targetName: target.name,
          action: 'skipped_external',
          status: 'warning',
          message: agentMessage('agent.skill.detectedExternalSkip'),
        })
      } else {
        const installRes = adapters.installSkillToTarget(nameCheck.value, dirCheck.path, target.id)
        if (installRes.ok) {
          actions.push({
            targetId: target.id,
            targetName: target.name,
            action: before.state === 'broken' ? 'repaired' : 'installed',
            status: 'ok',
            message: before.state === 'broken' ? agentMessage('agent.skill.autoRepaired') : agentMessage('agent.skill.autoInstalled'),
          })
        } else {
          actions.push({
            targetId: target.id,
            targetName: target.name,
            action: 'failed',
            status: 'error',
            message: installRes.message || agentMessage('agent.skill.installFailed'),
          })
        }
      }
    }

    const checkReport = {
      checkedAt: new Date().toISOString(),
      overallStatus: actions.some((a) => a.status === 'error')
        ? 'error'
        : actions.some((a) => a.status === 'warning')
          ? 'partial'
          : 'ok',
      actions,
    }
    registry.saveLastCheck('skill', nameCheck.value, checkReport)
    return {
      ok: true,
      checkReport,
      skill: buildSkillRecord(nameCheck.value, true),
    }
  }

  return {
    listSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    getSupportingFile,
    putSupportingFile,
    deleteSupportingFile,
    installSkill,
    uninstallSkill,
    checkAndRepairSkillInstallations,
  }
}
