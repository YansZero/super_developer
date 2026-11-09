import { agentMessage } from './requestI18n.mjs'
export const MAX_RULE_CONTENT_BYTES = 256 * 1024
export const MAX_RULE_HTTP_BODY_BYTES = 320 * 1024
export const MAX_RULES_COUNT = 20
export const MAX_RULE_FILENAME_LENGTH = 128

export const ALLOWED_RULE_EXTENSIONS = Object.freeze(['.md', '.txt'])
export const RULE_KINDS = Object.freeze(['guidance', 'rule', 'hook'])
export const RULE_HOOK_EVENTS = Object.freeze(['before-command', 'before-completion'])

export const RULE_ERROR_CODES = Object.freeze({
  INVALID_JSON_OBJECT: 'INVALID_JSON_OBJECT',
  INVALID_JSON: 'INVALID_JSON',
  EMPTY_BODY: 'EMPTY_BODY',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  UNKNOWN_FIELD_REJECTED: 'UNKNOWN_FIELD_REJECTED',
  INVALID_RULE_ID: 'INVALID_RULE_ID',
  INVALID_RULE_FILENAME: 'INVALID_RULE_FILENAME',
  RULE_INVALID_EXTENSION: 'RULE_INVALID_EXTENSION',
  RULE_FILE_EMPTY: 'RULE_FILE_EMPTY',
  RULE_FILE_TOO_LARGE: 'RULE_FILE_TOO_LARGE',
  RULE_CONTENT_CONTROL_CHARS: 'RULE_CONTENT_CONTROL_CHARS',
  RULE_MAX_COUNT_EXCEEDED: 'RULE_MAX_COUNT_EXCEEDED',
  RULE_NOT_FOUND: 'RULE_NOT_FOUND',
  INVALID_RULE_REORDER: 'INVALID_RULE_REORDER',
  INVALID_RULE_KIND: 'INVALID_RULE_KIND',
  INVALID_RULE_HOOK_EVENTS: 'INVALID_RULE_HOOK_EVENTS',
  INVALID_RULE_APPLICATION: 'INVALID_RULE_APPLICATION',
  RULE_ALREADY_APPLIED: 'RULE_ALREADY_APPLIED',
})

const RULE_ID_PATTERN = /^rule-[a-z0-9][a-z0-9-_]{1,62}$/
const DISALLOWED_FILENAME_CHARS_PATTERN = /[/\\<>:"|?*;`$]/
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-_]{1,62}$/

export function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function hasForbiddenObjectKeys(obj) {
  const rawKeys = Object.getOwnPropertyNames(obj)
  return rawKeys.some(
    (key) => key === '__proto__' || key === 'constructor' || key === 'prototype',
  )
}

export function hasStrictControlCharacters(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

export function hasDisallowedContentControlCharacters(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      return true
    }
  }
  return false
}

export function detectAllowedRuleExtension(fileName) {
  if (typeof fileName !== 'string') {
    return null
  }
  const trimmed = fileName.trim()
  const lower = trimmed.toLowerCase()
  for (const ext of ALLOWED_RULE_EXTENSIONS) {
    if (lower.endsWith(ext) && trimmed.length > ext.length) {
      return ext
    }
  }
  return null
}

export function validateRuleIdParam(ruleId) {
  if (typeof ruleId !== 'string') {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_ID,
      message: agentMessage('agent.rule.ruleIdMustBeString'),
    }
  }
  const trimmed = ruleId.trim()
  if (!RULE_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_ID,
      message: agentMessage('agent.rule.ruleIdFormatInvalid'),
    }
  }
  return { ok: true, value: trimmed }
}

export function validateRuleFileName(rawFileName) {
  if (typeof rawFileName !== 'string') {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_FILENAME,
      message: agentMessage('agent.rule.fileNameMustBeString'),
    }
  }
  const trimmed = rawFileName.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_RULE_FILENAME_LENGTH) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_FILENAME,
      message: agentMessage('agent.rule.fileNameLength', { max: MAX_RULE_FILENAME_LENGTH }),
    }
  }
  if (
    hasStrictControlCharacters(trimmed) ||
    DISALLOWED_FILENAME_CHARS_PATTERN.test(trimmed) ||
    trimmed.includes('..')
  ) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_FILENAME,
      message: agentMessage('agent.rule.fileNameSpecialChars'),
    }
  }

  const ext = detectAllowedRuleExtension(trimmed)
  if (!ext) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.RULE_INVALID_EXTENSION,
      message: agentMessage('agent.rule.invalidExtension'),
    }
  }

  const stem = trimmed.slice(0, trimmed.length - ext.length).trim()
  if (!stem || stem.startsWith('.')) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_FILENAME,
      message: agentMessage('agent.rule.stemRequired'),
    }
  }

  return {
    ok: true,
    value: trimmed,
    extension: ext,
  }
}

export function validateRuleContent(rawContent) {
  if (typeof rawContent !== 'string') {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.RULE_FILE_EMPTY,
      message: agentMessage('agent.rule.contentMustBeString'),
    }
  }

  if (hasDisallowedContentControlCharacters(rawContent)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.RULE_CONTENT_CONTROL_CHARS,
      message: agentMessage('agent.rule.contentDisallowedControl'),
    }
  }

  const sizeBytes = Buffer.byteLength(rawContent, 'utf8')
  if (sizeBytes === 0 || rawContent.trim().length === 0) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.RULE_FILE_EMPTY,
      message: agentMessage('agent.rule.contentCannotBeEmpty'),
    }
  }

  if (sizeBytes > MAX_RULE_CONTENT_BYTES) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.RULE_FILE_TOO_LARGE,
      message: agentMessage('agent.rule.contentTooLarge', { max: MAX_RULE_CONTENT_BYTES }),
    }
  }

  return {
    ok: true,
    value: rawContent,
    sizeBytes,
  }
}

export function validateRuleKind(rawKind, { defaultValue = 'rule' } = {}) {
  const kind = rawKind === undefined ? defaultValue : rawKind
  if (typeof kind !== 'string' || !RULE_KINDS.includes(kind)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_KIND,
      message: agentMessage('agent.rule.kindMustBeValid'),
    }
  }
  return { ok: true, value: kind }
}

export function validateRuleHookEvents(rawEvents, kind = 'rule') {
  const events = rawEvents === undefined ? [] : rawEvents
  if (!Array.isArray(events) || events.some((event) => !RULE_HOOK_EVENTS.includes(event))) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_HOOK_EVENTS,
      message: agentMessage('agent.rule.hookTimingInvalid'),
    }
  }
  const uniqueEvents = [...new Set(events)]
  if (kind === 'hook' && uniqueEvents.length === 0) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_HOOK_EVENTS,
      message: agentMessage('agent.rule.hookTimingRequired'),
    }
  }
  if (kind !== 'hook' && uniqueEvents.length > 0) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_HOOK_EVENTS,
      message: agentMessage('agent.rule.onlyHookHasTiming'),
    }
  }
  return { ok: true, value: uniqueEvents }
}

export function validateRuleApplicationInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_APPLICATION,
      message: agentMessage('agent.rule.applicationDataInvalid'),
    }
  }
  const keys = Object.keys(payload)
  if (keys.some((key) => !['providerId', 'action'].includes(key))) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
      message: agentMessage('agent.rule.applicationDisallowedFields'),
    }
  }
  if (typeof payload.providerId !== 'string' || !PROVIDER_ID_PATTERN.test(payload.providerId.trim())) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_APPLICATION,
      message: agentMessage('agent.rule.providerIdInvalid'),
    }
  }
  if (payload.action !== 'apply' && payload.action !== 'install-hook') {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_APPLICATION,
      message: agentMessage('agent.rule.applicationActionInvalid'),
    }
  }
  return {
    ok: true,
    value: {
      providerId: payload.providerId.trim(),
      action: payload.action,
    },
  }
}

export function validateRuleCreateInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.http.invalidJsonObject'),
    }
  }

  const allowedKeys = new Set(['fileName', 'content', 'enabled', 'kind', 'hookEvents'])
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
        message: agentMessage('agent.rule.unknownFieldsRejected'),
      }
    }
  }

  const fileNameCheck = validateRuleFileName(payload.fileName)
  if (!fileNameCheck.ok) {
    return fileNameCheck
  }

  const contentCheck = validateRuleContent(payload.content)
  if (!contentCheck.ok) {
    return contentCheck
  }

  let enabled = true
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
        message: agentMessage('agent.rule.enabledMustBeBoolean'),
      }
    }
    enabled = payload.enabled
  }

  const kindCheck = validateRuleKind(payload.kind)
  if (!kindCheck.ok) return kindCheck
  const hookEventsCheck = validateRuleHookEvents(payload.hookEvents, kindCheck.value)
  if (!hookEventsCheck.ok) return hookEventsCheck

  return {
    ok: true,
    value: {
      fileName: fileNameCheck.value,
      extension: fileNameCheck.extension,
      sizeBytes: contentCheck.sizeBytes,
      content: contentCheck.value,
      enabled,
      kind: kindCheck.value,
      hookEvents: hookEventsCheck.value,
    },
  }
}

export function validateRuleUpdateInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.http.invalidJsonObject'),
    }
  }

  const allowedKeys = new Set(['enabled', 'content', 'fileName', 'kind', 'hookEvents'])
  const keys = Object.keys(payload)
  if (keys.length === 0) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.rule.updateNeedsAtLeastOneField'),
    }
  }

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
        message: agentMessage('agent.rule.unknownFieldsRejected'),
      }
    }
  }

  const result = {}

  const kindCheck = validateRuleKind(payload.kind)
  if (payload.kind !== undefined && !kindCheck.ok) return kindCheck
  if (payload.hookEvents !== undefined || payload.kind !== undefined) {
    const hookEventsCheck = validateRuleHookEvents(payload.hookEvents, kindCheck.ok ? kindCheck.value : 'rule')
    if (!hookEventsCheck.ok) return hookEventsCheck
    result.hookEvents = hookEventsCheck.value
  }
  if (kindCheck.ok && payload.kind !== undefined) result.kind = kindCheck.value

  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
        message: agentMessage('agent.rule.enabledMustBeBoolean'),
      }
    }
    result.enabled = payload.enabled
  }

  if (payload.fileName !== undefined) {
    const fileNameCheck = validateRuleFileName(payload.fileName)
    if (!fileNameCheck.ok) {
      return fileNameCheck
    }
    result.fileName = fileNameCheck.value
    result.extension = fileNameCheck.extension
  }

  if (payload.content !== undefined) {
    const contentCheck = validateRuleContent(payload.content)
    if (!contentCheck.ok) {
      return contentCheck
    }
    result.content = contentCheck.value
    result.sizeBytes = contentCheck.sizeBytes
  }

  return {
    ok: true,
    value: result,
  }
}

export function validateRuleReorderInput(payload) {
  if (!isPlainObject(payload) || hasForbiddenObjectKeys(payload)) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_JSON_OBJECT,
      message: agentMessage('agent.http.invalidJsonObject'),
    }
  }

  const allowedKeys = new Set(['ruleId', 'direction', 'orderedIds'])
  const keys = Object.keys(payload)
  if (keys.length === 0) {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_REORDER,
      message: agentMessage('agent.rule.orderMissingRequiredParams'),
    }
  }

  for (const key of keys) {
    if (!allowedKeys.has(key)) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.UNKNOWN_FIELD_REJECTED,
        message: agentMessage('agent.rule.unknownFieldsRejected'),
      }
    }
  }

  if (payload.orderedIds !== undefined) {
    if (
      payload.ruleId !== undefined ||
      payload.direction !== undefined ||
      !Array.isArray(payload.orderedIds) ||
      payload.orderedIds.length === 0 ||
      payload.orderedIds.length > MAX_RULES_COUNT
    ) {
      return {
        ok: false,
        errorCode: RULE_ERROR_CODES.INVALID_RULE_REORDER,
        message: agentMessage('agent.rule.orderIdListInvalid'),
      }
    }
    const validatedIds = []
    const seen = new Set()
    for (const rawId of payload.orderedIds) {
      const idCheck = validateRuleIdParam(rawId)
      if (!idCheck.ok || seen.has(idCheck.value)) {
        return {
          ok: false,
          errorCode: RULE_ERROR_CODES.INVALID_RULE_REORDER,
          message: agentMessage('agent.rule.orderIdListDuplicateOrInvalid'),
        }
      }
      seen.add(idCheck.value)
      validatedIds.push(idCheck.value)
    }
    return {
      ok: true,
      value: {
        mode: 'orderedIds',
        orderedIds: validatedIds,
      },
    }
  }

  const idCheck = validateRuleIdParam(payload.ruleId)
  if (!idCheck.ok) {
    return idCheck
  }
  if (payload.direction !== 'up' && payload.direction !== 'down') {
    return {
      ok: false,
      errorCode: RULE_ERROR_CODES.INVALID_RULE_REORDER,
      message: agentMessage('agent.rule.directionMustBeUpOrDown'),
    }
  }

  return {
    ok: true,
    value: {
      mode: 'step',
      ruleId: idCheck.value,
      direction: payload.direction,
    },
  }
}
