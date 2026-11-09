import { useSyncExternalStore } from 'react'
import { getDispatchJobsSnapshot, subscribeDispatchJobs } from '../dispatchJobStore'

export function useProjectDispatchJobs(projectId: string) {
  const trackedDispatchJobs = useSyncExternalStore(subscribeDispatchJobs, getDispatchJobsSnapshot, getDispatchJobsSnapshot)
  const currentProjectDispatches = trackedDispatchJobs.filter((record) => record.job.projectId === projectId)
  const jiraDispatchRecord = currentProjectDispatches.find((record) => record.taskType === 'jira') ?? null
  const architectureDispatchRecord = currentProjectDispatches.find((record) => record.taskType === 'architecture') ?? null
  const jiraDispatchJob = jiraDispatchRecord?.job ?? null
  const architectureDispatchJob = architectureDispatchRecord?.job ?? null
  const architectureSaveError = architectureDispatchRecord?.architectureSaveError ?? null
  const jiraDispatchRunning = Boolean(jiraDispatchJob && ['queued', 'running'].includes(jiraDispatchJob.status))
  const architectureDispatchRunning = Boolean(architectureDispatchJob && ['queued', 'running'].includes(architectureDispatchJob.status))

  return {
    jiraDispatchRecord, architectureDispatchRecord, jiraDispatchJob, architectureDispatchJob,
    architectureSaveError, jiraDispatchRunning, architectureDispatchRunning,
  }
}
