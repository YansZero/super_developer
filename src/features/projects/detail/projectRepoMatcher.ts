import type {
  GitHubProjectRepoMapping,
  GitHubPublicRepository,
  ProjectItem,
} from '../../../shared/types/domain'

function normalizeIdentifier(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .trim()
    .replace(/[_/]/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Read the authoritative owner/repository identity from a GitHub origin URL. */
function extractGitHubFullName(remoteUrl: string | null): string | null {
  const value = remoteUrl?.trim()
  if (!value) return null

  let pathname: string
  const scpStyle = /^(?:[^@/]+@)?github\.com:([^?#]+)$/i.exec(value)

  if (scpStyle) {
    pathname = scpStyle[1]
  } else {
    try {
      const parsed = new URL(value)
      if (parsed.hostname.toLowerCase() !== 'github.com') return null
      pathname = parsed.pathname
    } catch {
      return null
    }
  }

  const parts = pathname.replace(/\/+$/, '').replace(/\.git$/i, '').split('/').filter(Boolean)
  if (parts.length !== 2) return null
  return `${parts[0].toLowerCase()}/${parts[1].toLowerCase()}`
}

function extractFolderBasename(folderDisplayName: string): string {
  const withoutNote = folderDisplayName.replace(/[（(].*?[）)]/g, '').trim()
  const parts = withoutNote.split(/[\\/]/)
  return normalizeIdentifier(parts[parts.length - 1] || withoutNote)
}

function toMapping(
  project: ProjectItem,
  repository: GitHubPublicRepository,
): GitHubProjectRepoMapping {
  return {
    projectId: project.id,
    projectName: project.name,
    folderDisplayName: project.folderDisplayName,
    repoId: repository.id,
    repoFullName: repository.fullName,
    repoHtmlUrl: repository.htmlUrl,
    defaultBranch: repository.defaultBranch,
    mappedAt: new Date().toISOString(),
  }
}

/**
 * Prefer the local origin's full GitHub identity. Name-based matching remains
 * only for projects that have no origin configured; it must not override a
 * configured remote that points elsewhere or to an inaccessible repository.
 */
export function findMatchingGitHubRepo(
  project: ProjectItem,
  repositories: GitHubPublicRepository[],
): GitHubProjectRepoMapping | null {
  if (!repositories || repositories.length === 0) return null

  const remoteUrl = project.git.remoteUrl?.trim()
  if (remoteUrl) {
    const remoteFullName = extractGitHubFullName(remoteUrl)
    if (!remoteFullName) return null

    const exactMatch = repositories.find(
      (repository) => repository.fullName.toLowerCase() === remoteFullName,
    )
    return exactMatch ? toMapping(project, exactMatch) : null
  }

  // Legacy fallback for projects whose origin has not yet been scanned/configured.
  const candidateTokens = [
    extractFolderBasename(project.folderDisplayName),
    normalizeIdentifier(project.id.replace(/^proj-/, '')),
    normalizeIdentifier(project.name),
  ].filter((token) => token.length > 0)

  for (const token of candidateTokens) {
    const exactMatch = repositories.find(
      (repository) => normalizeIdentifier(repository.name) === token,
    )
    if (exactMatch) return toMapping(project, exactMatch)
  }

  for (const token of candidateTokens) {
    if (token.length < 3) continue
    const fuzzyMatches = repositories.filter((repository) => {
      const repoName = normalizeIdentifier(repository.name)
      return repoName.includes(token) || token.includes(repoName)
    })
    if (fuzzyMatches.length === 1) return toMapping(project, fuzzyMatches[0])
  }

  return null
}
