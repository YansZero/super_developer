import { useEffect, useState } from 'react'
import type { ProjectItem } from '../../../../shared/types/domain'
import { useI18n } from '../../../../shared/i18n'

type RefreshGitStatus = (projectId: string, projectPath: string, signal: AbortSignal) => Promise<void>

export function useGitStatusRefresh(
  project: Pick<ProjectItem, 'id' | 'folderPath' | 'folderDisplayName' | 'isDemoFixture'>,
  onRefreshGitStatus: RefreshGitStatus,
) {
  const { locale } = useI18n()
  const [gitRefreshError, setGitRefreshError] = useState(false)
  const [gitRefreshedAt, setGitRefreshedAt] = useState<string | null>(null)
  const [gitRefreshCountdown, setGitRefreshCountdown] = useState(30)

  useEffect(() => {
    if (project.isDemoFixture) return
    const projectPath = project.folderPath ?? project.folderDisplayName
    if (!projectPath) return

    let active = true
    let requestInFlight = false
    let nextRefreshAt = Date.now() + 30_000
    const controller = new AbortController()
    const refresh = async () => {
      if (!active || requestInFlight) return
      requestInFlight = true
      nextRefreshAt = Date.now() + 30_000
      setGitRefreshCountdown(30)
      try {
        await onRefreshGitStatus(project.id, projectPath, controller.signal)
        if (active) {
          setGitRefreshError(false)
          setGitRefreshedAt(new Date().toLocaleTimeString(locale))
        }
      } catch {
        if (active) setGitRefreshError(true)
      } finally {
        requestInFlight = false
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    const countdownTimer = window.setInterval(() => {
      setGitRefreshCountdown(Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000)))
    }, 1000)
    return () => {
      active = false
      window.clearInterval(timer)
      window.clearInterval(countdownTimer)
      controller.abort()
    }
  }, [locale, onRefreshGitStatus, project.folderDisplayName, project.folderPath, project.id, project.isDemoFixture])

  return { gitRefreshError, gitRefreshedAt, gitRefreshCountdown }
}
