import type { RuleDocument, RuleExtension } from '../../../shared/types/domain'

export const MAX_RULE_CONTENT_BYTES = 256 * 1024
export const MAX_RULES_COUNT = 20
export const MAX_RULE_FILENAME_LENGTH = 128

const ALLOWED_EXTENSIONS: ReadonlyArray<RuleExtension> = ['.md', '.txt']
const DISALLOWED_FILENAME_CHARS_PATTERN = /[/\\<>:"|?*;`$]/

export function hasStrictControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) {
      return true
    }
  }
  return false
}

export function hasDisallowedRuleControlChars(text: string): boolean {
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

export function detectRuleExtension(fileName: string): RuleExtension | null {
  const trimmed = fileName.trim()
  if (
    !trimmed ||
    trimmed.length > MAX_RULE_FILENAME_LENGTH ||
    hasStrictControlChars(trimmed) ||
    DISALLOWED_FILENAME_CHARS_PATTERN.test(trimmed) ||
    trimmed.includes('..')
  ) {
    return null
  }
  const lower = trimmed.toLowerCase()
  for (const ext of ALLOWED_EXTENSIONS) {
    if (lower.endsWith(ext) && trimmed.length > ext.length) {
      const stem = trimmed.slice(0, trimmed.length - ext.length).trim()
      if (!stem || stem.startsWith('.')) {
        return null
      }
      return ext
    }
  }
  return null
}

export function computeUtf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength
}

export interface CandidateRuleFileValidationSuccess {
  ok: true
  fileName: string
  extension: RuleExtension
  sizeBytes: number
  content: string
}

export interface CandidateRuleFileValidationError {
  ok: false
  errorCode: string
  message: string
}

export type CandidateRuleFileValidationResult =
  | CandidateRuleFileValidationSuccess
  | CandidateRuleFileValidationError

export function validateCandidateRuleFile(params: {
  fileName: string
  rawSizeBytes?: number
  content: string
  currentRuleCount?: number
}): CandidateRuleFileValidationResult {
  const { fileName, rawSizeBytes, content, currentRuleCount = 0 } = params
  const trimmedName = fileName.trim()

  if (!trimmedName || trimmedName.length > MAX_RULE_FILENAME_LENGTH) {
    return {
      ok: false,
      errorCode: 'INVALID_RULE_FILENAME',
      message: `規則檔案名稱不合法（長度須介於 1 到 ${MAX_RULE_FILENAME_LENGTH} 字元）。`,
    }
  }

  const ext = detectRuleExtension(trimmedName)
  if (!ext) {
    return {
      ok: false,
      errorCode: 'RULE_INVALID_EXTENSION',
      message: '不支援的檔案格式：僅接受 .md 或 .txt 規則文件。',
    }
  }

  if (typeof rawSizeBytes === 'number' && rawSizeBytes > MAX_RULE_CONTENT_BYTES) {
    return {
      ok: false,
      errorCode: 'RULE_FILE_TOO_LARGE',
      message: `拒絕超過 256 KiB（${MAX_RULE_CONTENT_BYTES} bytes）的規則文件。`,
    }
  }

  if (hasDisallowedRuleControlChars(content)) {
    return {
      ok: false,
      errorCode: 'RULE_CONTENT_CONTROL_CHARS',
      message: '規則文件包含不允許的控制字元或二進位內容。',
    }
  }

  const sizeBytes = computeUtf8ByteLength(content)
  if (sizeBytes === 0 || content.trim().length === 0) {
    return {
      ok: false,
      errorCode: 'RULE_FILE_EMPTY',
      message: '拒絕空白文件：規則文件內容不可為空。',
    }
  }

  if (sizeBytes > MAX_RULE_CONTENT_BYTES) {
    return {
      ok: false,
      errorCode: 'RULE_FILE_TOO_LARGE',
      message: `拒絕超過 256 KiB（${MAX_RULE_CONTENT_BYTES} bytes）的規則文件。`,
    }
  }

  if (currentRuleCount >= MAX_RULES_COUNT) {
    return {
      ok: false,
      errorCode: 'RULE_MAX_COUNT_EXCEEDED',
      message: `規則數量已達上限（最多 ${MAX_RULES_COUNT} 條規則）。`,
    }
  }

  return {
    ok: true,
    fileName: trimmedName,
    extension: ext,
    sizeBytes,
    content,
  }
}

export function reorderRuleDocuments(
  rules: RuleDocument[],
  index: number,
  direction: 'up' | 'down',
): RuleDocument[] {
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || index >= rules.length || targetIndex < 0 || targetIndex >= rules.length) {
    return rules
  }
  const next = [...rules]
  const current = next[index]
  next[index] = next[targetIndex]
  next[targetIndex] = current
  return next
}

export function readUploadedFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('讀取檔案失敗'))
    reader.readAsText(file)
  })
}
