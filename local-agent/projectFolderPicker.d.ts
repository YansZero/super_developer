declare module '*projectFolderPicker.mjs' {
  export function createProjectFolderPicker(options?: unknown): {
    pick(): Promise<{
      ok: boolean
      projectPaths?: string[]
      errorCode?: string
      message?: string
    }>
  }
  export function createProjectFolderOpener(options?: unknown): {
    open(folderPath: string): Promise<{
      ok: boolean
      errorCode?: string
      message?: string
    }>
  }
}
