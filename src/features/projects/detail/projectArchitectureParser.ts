import type { ArchNode } from '../../../shared/types/domain'

export interface ParsedArchitectureTrees {
  frontend: ArchNode[]
  backend: ArchNode[]
}

type ArchitectureSection = 'Frontend' | 'Backend'
type TreeLine = { depth: number; value: string }

function getHeading(line: string) {
  const markdownMatch = line.trim().match(/^(#{1,6})\s+(.+?)\s*#*$/)
  if (markdownMatch) return { level: markdownMatch[1].length, title: markdownMatch[2] }

  const plainTitle = line.trim().replace(/^\*\*|\*\*$/g, '')
  if (/^(?:(?:\d+|[一二三四五六七八九十]+)[、.)．]\s*)?(?:前端|後端|Frontend|Backend)(?:\s*[（(][^）)]*[）)])?$/i.test(plainTitle)) {
    return { level: 2, title: plainTitle }
  }
  return null
}

function matchesSection(title: string, sectionName: ArchitectureSection) {
  const normalized = title.replace(/[*_`]/g, '').toLocaleLowerCase()
  return sectionName === 'Frontend'
    ? /\bfrontend\b/i.test(normalized) || normalized.includes('前端')
    : /\bbackend\b/i.test(normalized) || normalized.includes('後端')
}

function sectionLines(output: string, sectionName: ArchitectureSection) {
  const lines = output.split(/\r?\n/)
  let inCodeFence = false
  const headings: Array<{ index: number; level: number; title: string }> = []

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inCodeFence = !inCodeFence
      return
    }
    if (inCodeFence) return
    const heading = getHeading(line)
    if (heading) headings.push({ index, ...heading })
  })

  const headingIndex = headings.findIndex(({ title }) => matchesSection(title, sectionName))
  if (headingIndex < 0) return []

  const start = headings[headingIndex]
  const end = headings.slice(headingIndex + 1).find(({ level }) => level <= start.level)?.index ?? lines.length
  return lines.slice(start.index + 1, end)
}

function parseTreeLine(line: string): TreeLine | null {
  const branchMatch = line.match(/^([\s│]*)(?:├──|└──)\s*(.+)$/)
  if (branchMatch) {
    const prefix = branchMatch[1].replaceAll('│', ' ')
    const depth = Math.max(1, Math.floor(prefix.length / 4) + 1)
    return { depth, value: branchMatch[2].trim() }
  }

  const root = line.trim()
  if (!root || line !== line.trim() || /^(?:```|---+|___+|\*\*\*+|技術與入口：|入口：)/.test(root)) return null
  if (!/^[\w@./-]+\/?$/.test(root)) return null
  return { depth: 0, value: root }
}

function makeTreeLineNode(value: string, id: string): ArchNode | null {
  const commentIndex = value.search(/\s+(?:#|\/\/)\s*/)
  const note = commentIndex >= 0 ? value.slice(commentIndex).replace(/^\s+(?:#|\/\/)\s*/, '').trim() : undefined
  const rawName = (commentIndex >= 0 ? value.slice(0, commentIndex) : value)
    .replace(/^[-*]\s+/, '')
    .replace(/\s+[—–]\s+.*/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim()
  if (!rawName || rawName.length > 240) return null
  // Ignore standalone ellipsis placeholder lines such as `└── ...` or `├── …`
  if (/^\.{2,}\/?$|^…+\/?$/.test(rawName)) return null
  const isFolder = rawName === '.' || rawName === './' || rawName.endsWith('/')
  const trimmed = rawName === '.' || rawName === './' ? '.' : rawName.replace(/\/$/, '')
  const segments = trimmed === '.' ? ['.'] : trimmed.split('/').filter(Boolean)
  if (segments.length === 0) return null
  // Preserve multi-segment Java/package paths as a compact folder label (e.g. `web/src/com/falconpack/controller`)
  // instead of dropping parent package segments with `.at(-1)`.
  const compactName = segments.length > 1 ? segments.join('/') : segments[0]
  return {
    id,
    name: compactName,
    kind: isFolder || segments.length > 1 ? 'folder' : 'file',
    ...(note ? { note } : {}),
    ...(isFolder || segments.length > 1 ? { children: [] } : {}),
  }
}

function parseSectionTree(lines: string[], prefix: string): ArchNode[] {
  const roots: ArchNode[] = []
  const stack: ArchNode[] = []
  let nextId = 0

  // Prefer the first code block that contains ASCII tree branches so secondary BFF/example snippets do not duplicate roots.
  const firstTreeBlock: string[] = []
  let inFence = false
  let hasTreeBranch = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inFence) {
        inFence = false
        if (hasTreeBranch) break
        firstTreeBlock.length = 0
      } else {
        inFence = true
      }
      continue
    }
    if (inFence) {
      if (/(?:├──|└──)/.test(line)) hasTreeBranch = true
      firstTreeBlock.push(line)
    }
  }
  const sourceLines = hasTreeBranch && roots.length === 0 ? firstTreeBlock : lines
  // If there are multiple standalone root blocks (e.g. backend/ and local-agent/ in separate fences), include all tree fences before any ### subheading.
  const allMainFenceLines: string[] = []
  let insideFence = false
  for (const line of lines) {
    if (!insideFence && /^#{3,6}\s+/.test(line.trim())) break
    if (/^\s*```/.test(line)) {
      insideFence = !insideFence
      continue
    }
    if (insideFence) allMainFenceLines.push(line)
  }
  const targetLines = allMainFenceLines.some((l) => /(?:├──|└──)/.test(l)) ? allMainFenceLines : sourceLines

  for (const line of targetLines) {
    const parsed = parseTreeLine(line)
    if (!parsed) continue
    const node = makeTreeLineNode(parsed.value, `${prefix}-${nextId++}`)
    if (!node) continue

    if (parsed.depth === 0) {
      roots.push(node)
      stack.splice(0, stack.length, node)
      continue
    }

    const parent = stack[parsed.depth - 1]
    if (!parent) continue
    // ASCII trees often omit a trailing slash on directory roots such as `src`.
    // A node with children is necessarily a folder, even if its line looked like a file.
    parent.kind = 'folder'
    parent.children ??= []
    parent.children.push(node)
    stack.splice(parsed.depth)
    stack[parsed.depth] = node
  }

  return roots.filter((node) => node.name !== '.' || node.kind !== 'folder' || (node.children?.length ?? 0) > 0)
}

const RELATIVE_PATH_PATTERN = /^(?:\.\/)?(?:src|frontend|client|web|app|apps|packages|backend|server|api|local-agent|bff|functions|services)(?:\/[\w@.+-]+)*\/?$/i
const RAW_PATH_PATTERN = /(?:^|[\s(（【])((?:\.\/)?(?:src|frontend|client|web|app|apps|packages|backend|server|api|local-agent|bff|functions|services)(?:\/[\w@.+-]+)*\/?)(?=$|[\s)）】,，。;；:：])/gi

function normalizePathCandidate(value: string): string | null {
  let candidate = value.trim().replace(/\\/g, '/')
  if (candidate.startsWith('file://')) {
    try {
      candidate = decodeURIComponent(new URL(candidate).pathname)
    } catch {
      return null
    }
  }

  candidate = candidate.replace(/[.,;:!?，。；：！？)）\]}]+$/g, '')
  if (candidate.startsWith('/')) {
    const relativeStart = candidate.match(/\/(src|frontend|client|web|app|apps|packages|backend|server|api|local-agent|bff|functions|services)(?:\/|$)/i)
    if (!relativeStart || relativeStart.index === undefined) return null
    candidate = candidate.slice(relativeStart.index + 1)
  }
  candidate = candidate.replace(/^\.\//, '')
  if (!candidate.includes('/')) return null
  if (!RELATIVE_PATH_PATTERN.test(candidate) || candidate.split('/').includes('..')) return null
  return candidate
}

function extractPathCandidates(lines: string[]): string[] {
  const candidates = new Set<string>()
  const add = (value: string) => {
    const path = normalizePathCandidate(value)
    if (path) candidates.add(path)
  }

  for (const line of lines) {
    for (const match of line.matchAll(/`([^`\n]+)`/g)) add(match[1])
    for (const match of line.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      add(match[1])
      add(match[2])
    }
    for (const match of line.matchAll(RAW_PATH_PATTERN)) add(match[1])
  }
  return [...candidates]
}

function treeFromPaths(paths: string[], prefix: string): ArchNode[] {
  const roots: ArchNode[] = []
  const rootByName = new Map<string, ArchNode>()
  let nextId = 0

  for (const path of paths) {
    const parts = path.split('/').filter(Boolean)
    let siblings = roots
    let parent: ArchNode | undefined

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1
      const explicitDirectory = isLast && path.endsWith('/')
      let node = siblings.find((candidate) => candidate.name === part)
      if (!node) {
        const kind = !isLast || explicitDirectory || !part.includes('.') ? 'folder' : 'file'
        node = {
          id: `${prefix}-${nextId++}`,
          name: part,
          kind,
          ...(kind === 'folder' ? { children: [] } : {}),
        }
        siblings.push(node)
        if (!parent) rootByName.set(part, node)
      }
      if (node.kind === 'folder') {
        node.children ??= []
        siblings = node.children
      }
      parent = node
    })
  }

  return [...rootByName.values()]
}

function parseSection(lines: string[], prefix: string, relatedPaths: string[] = []): ArchNode[] {
  const explicitTree = parseSectionTree(lines, prefix)
  if (explicitTree.length > 0) return explicitTree
  const paths = new Set([...extractPathCandidates(lines), ...relatedPaths])
  return treeFromPaths([...paths], prefix)
}

function splitPathsByArea(paths: string[]) {
  return {
    frontend: paths.filter((path) => /^(?:src|frontend|client|web|app|apps|packages)\//i.test(path)),
    backend: paths.filter((path) => /^(?:backend|server|api|local-agent|bff|functions|services|packages)\//i.test(path)),
  }
}

function parseUnsectionedPaths(output: string): ParsedArchitectureTrees {
  const { frontend, backend } = splitPathsByArea(extractPathCandidates(output.split(/\r?\n/)))
  return {
    frontend: treeFromPaths(frontend, 'ai-frontend'),
    backend: treeFromPaths(backend, 'ai-backend'),
  }
}

export function parseArchitectureTrees(output: string | null | undefined): ParsedArchitectureTrees {
  if (!output?.trim()) return { frontend: [], backend: [] }

  const frontendSection = sectionLines(output, 'Frontend')
  const backendSection = sectionLines(output, 'Backend')
  if (frontendSection.length === 0 && backendSection.length === 0) return parseUnsectionedPaths(output)
  const relatedPaths = splitPathsByArea(extractPathCandidates(output.split(/\r?\n/)))

  return {
    frontend: parseSection(frontendSection, 'ai-frontend', relatedPaths.frontend),
    backend: parseSection(backendSection, 'ai-backend', relatedPaths.backend),
  }
}
