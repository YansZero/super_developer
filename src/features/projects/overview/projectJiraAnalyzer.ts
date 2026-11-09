import type { ProjectItem } from '../../../shared/types/domain'
import type { ProjectScanSnapshot } from './projectScanClient'

function folderNameFromPath(projectPath: string): string {
  const normalized = projectPath.trim().replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? normalized
}

function unavailableProgress(reason: string) {
  return { available: false, missingReason: reason, sourceFileLabel: null, todos: [] }
}

export function createProjectPlaceholder(projectPath: string, id: string): ProjectItem {
  return {
    id,
    name: folderNameFromPath(projectPath),
    folderDisplayName: folderNameFromPath(projectPath),
    folderPath: projectPath,
    summary: 'project.summary.addedWaitingForAnalysis',
    techStack: [],
    techStackByArea: { frontend: [], backend: [], app: [] },
    updatedAtLabel: 'project.updated.notAnalyzed',
    isDemoFixture: false,
    git: {
      status: 'unanalysed',
      branchName: null,
      lastCommitHash: null,
      lastCommitMessage: null,
      aheadCount: 0,
      behindCount: 0,
      openPrCount: 0,
      openIssueCount: 0,
      remoteUrl: null,
    },
    frontendProgress: unavailableProgress('project.progress.projectNotAnalyzed'),
    backendProgress: unavailableProgress('project.progress.projectNotAnalyzed'),
    spec: { available: false, fileName: null, updatedAtLabel: null, missingReason: 'project.progress.projectNotAnalyzed', sections: [] },
    frontendTree: [],
    backendTree: [],
    jira: {
      linked: false,
      manual: false,
      siteName: null,
      projectKey: null,
      projectName: null,
      unlinkedReason: 'project.jira.notAnalyzed',
      tickets: [],
    },
  }
}

function emptyJiraBinding(reason: string) {
  return {
    linked: false,
    manual: false,
    siteName: null,
    projectKey: null,
    projectName: null,
    unlinkedReason: reason,
    tickets: [],
  }
}

export function createProjectFromScan(snapshot: ProjectScanSnapshot, id: string): ProjectItem {
  return {
    id,
    name: snapshot.name,
    folderDisplayName: snapshot.folderDisplayName,
    summary: 'project.summary.gitScannedWaitingForTodoAndSpecs',
    techStack: snapshot.techStack,
    techStackByArea: snapshot.techStackByArea,
    updatedAtLabel: 'project.updated.justScanned',
    isDemoFixture: false,
    git: snapshot.git,
    frontendProgress: snapshot.frontendProgress ?? unavailableProgress('project.progress.frontendJobNotFound'),
    backendProgress: snapshot.backendProgress ?? unavailableProgress('project.progress.backendJobNotFound'),
    spec: { available: false, fileName: null, updatedAtLabel: null, missingReason: 'project.progress.specNotScanned', sections: [] },
    frontendTree: [],
    backendTree: [],
    jira: emptyJiraBinding('project.jira.notAnalyzed'),
  }
}

export async function analyzeProjectJiraBinding(
  project: ProjectItem,
): Promise<ProjectItem> {
  if (project.jira.manual && project.jira.projectKey) {
    return {
      ...project,
      jira: {
        ...project.jira,
        linked: true,
        manual: true,
        unlinkedReason: null,
      },
    }
  }
  return {
    ...project,
    jira: { ...emptyJiraBinding('project.jira.notManuallyLinked'), tickets: project.jira.tickets },
  }
}
