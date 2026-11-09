declare module '*projectScanContracts.mjs' {
  export const MAX_PROJECT_SCAN_BODY_BYTES: number
  export const PROJECT_SCAN_ERROR_CODES: Readonly<Record<string, string>>
  export function validateProjectPath(rawPath: unknown):
    | { ok: true; value: string }
    | { ok: false; errorCode: string; message: string }
}
