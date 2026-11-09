declare module '*gitContracts.mjs' {
  export const MAX_GIT_HTTP_BODY_BYTES: number
  export const GIT_ALLOWED_COMMANDS: readonly string[]
  export const GIT_ERROR_CODES: Readonly<Record<string, string>>

  export function validateGitCommand(rawCommand: unknown):
    | { ok: true; value: string }
    | { ok: false; errorCode: string; message: string }

  export function validateBranchName(rawBranch: unknown):
    | { ok: true; value: string | null }
    | { ok: false; errorCode: string; message: string }

  export function validateRelativeFilePath(rawPath: unknown):
    | { ok: true; value: string }
    | { ok: false; errorCode: string; message: string }

  export function validateRelativeFilePathList(rawFiles: unknown):
    | { ok: true; value: string[] }
    | { ok: false; errorCode: string; message: string }

  export function validateCommitMessage(rawMessage: unknown):
    | { ok: true; value: string }
    | { ok: false; errorCode: string; message: string }
}
