declare module '*githubStorage.mjs' {
  export interface GitHubProjectRepoMapping {
    projectId: string
    projectName: string
    folderDisplayName: string
    repoId: number
    repoFullName: string
    repoHtmlUrl: string
    defaultBranch: string
    mappedAt: string
  }

  export interface PersistedGitHubState {
    version: number
    updatedAt: string
    clientId: string | null
    account: {
      id: number
      login: string
      name: string | null
      htmlUrl: string
      avatarUrl: string | null
      publicReposCount: number
    } | null
    repositories: Array<{
      id: number
      name: string
      fullName: string
      htmlUrl: string
      description: string | null
      language: string | null
      defaultBranch: string
      updatedAt: string | null
      isPrivate: false
    }>
    mappings: GitHubProjectRepoMapping[]
  }

  export interface GitHubStorage {
    readonly configFilePath: string
    getPersistedState(): PersistedGitHubState
    saveClientId(
      rawInput: unknown,
    ):
      | { ok: true; clientId: string | null }
      | { ok: false; errorCode: string; message: string }
    saveConnectedAccountAndRepos(args: {
      clientId?: string | null
      account: unknown
      repositories: unknown
    }):
      | { ok: true; state: PersistedGitHubState }
      | { ok: false; errorCode: string; message: string }
    updatePublicRepositories(
      repositories: unknown,
    ):
      | { ok: true; state: PersistedGitHubState }
      | { ok: false; errorCode: string; message: string }
    upsertProjectMapping(
      rawInput: unknown,
    ):
      | {
          ok: true
          mapping: GitHubProjectRepoMapping
          mappings: GitHubProjectRepoMapping[]
        }
      | { ok: false; errorCode: string; message: string }
    removeProjectMapping(
      rawProjectId: unknown,
    ):
      | {
          ok: true
          removedProjectId: string
          mappings: GitHubProjectRepoMapping[]
        }
      | { ok: false; errorCode: string; message: string }
    clearConnectionState(): { ok: true; state: PersistedGitHubState }
  }

  export function resolveDefaultGitHubConfigPath(
    env?: Record<string, string | undefined>,
  ): string
  export function writeGitHubFileAtomicallyRestricted(
    filePath: string,
    contentString: string,
  ): void
  export function createGitHubStorage(options?: {
    configFilePath?: string
  }): GitHubStorage
}
