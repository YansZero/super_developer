declare module 'node:process' {
  const processDefault: {
    stdout: {
      write(chunk: string): boolean
    }
    stderr: {
      write(chunk: string): boolean
    }
  }
  export default processDefault
}

declare module '*ruleContracts.mjs' {
  export const MAX_RULE_CONTENT_BYTES: number
  export const MAX_RULE_HTTP_BODY_BYTES: number
  export const MAX_RULES_COUNT: number
  export const MAX_RULE_FILENAME_LENGTH: number
  export const ALLOWED_RULE_EXTENSIONS: ReadonlyArray<'.md' | '.txt'>
  export const RULE_KINDS: ReadonlyArray<'guidance' | 'rule' | 'hook'>
  export const RULE_HOOK_EVENTS: ReadonlyArray<'before-command' | 'before-completion'>
  export const RULE_ERROR_CODES: Readonly<Record<string, string>>

  export function isPlainObject(value: unknown): value is Record<string, unknown>
  export function hasForbiddenObjectKeys(obj: Record<string, unknown>): boolean
  export function hasStrictControlCharacters(text: string): boolean
  export function hasDisallowedContentControlCharacters(text: string): boolean
  export function detectAllowedRuleExtension(fileName: unknown): '.md' | '.txt' | null

  export function validateRuleIdParam(
    ruleId: unknown,
  ): { ok: true; value: string } | { ok: false; errorCode: string; message: string }

  export function validateRuleFileName(
    rawFileName: unknown,
  ):
    | { ok: true; value: string; extension: '.md' | '.txt' }
    | { ok: false; errorCode: string; message: string }

  export function validateRuleContent(
    rawContent: unknown,
  ):
    | { ok: true; value: string; sizeBytes: number }
    | { ok: false; errorCode: string; message: string }

  export function validateRuleKind(
    rawKind: unknown,
    options?: { defaultValue?: 'guidance' | 'rule' | 'hook' },
  ): { ok: true; value: 'guidance' | 'rule' | 'hook' } | { ok: false; errorCode: string; message: string }

  export function validateRuleHookEvents(
    rawEvents: unknown,
    kind?: 'guidance' | 'rule' | 'hook',
  ): { ok: true; value: Array<'before-command' | 'before-completion'> } | { ok: false; errorCode: string; message: string }

  export function validateRuleApplicationInput(
    payload: unknown,
  ): { ok: true; value: { providerId: string; action: 'apply' | 'install-hook' } } | { ok: false; errorCode: string; message: string }

  export function validateRuleCreateInput(
    payload: unknown,
  ):
    | {
        ok: true
        value: {
          fileName: string
          extension: '.md' | '.txt'
          sizeBytes: number
          content: string
          enabled: boolean
          kind: 'guidance' | 'rule' | 'hook'
          hookEvents: Array<'before-command' | 'before-completion'>
        }
      }
    | { ok: false; errorCode: string; message: string }

  export function validateRuleUpdateInput(
    payload: unknown,
  ):
    | {
        ok: true
        value: {
          enabled?: boolean
          fileName?: string
          extension?: '.md' | '.txt'
          content?: string
          sizeBytes?: number
          kind?: 'guidance' | 'rule' | 'hook'
          hookEvents?: Array<'before-command' | 'before-completion'>
        }
      }
    | { ok: false; errorCode: string; message: string }

  export function validateRuleReorderInput(
    payload: unknown,
  ):
    | {
        ok: true
        value:
          | { mode: 'orderedIds'; orderedIds: string[] }
          | { mode: 'step'; ruleId: string; direction: 'up' | 'down' }
      }
    | { ok: false; errorCode: string; message: string }
}
