import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillDocument, TargetDescriptor } from '../../shared/types/domain'
import {
  createSkillClient,
  type SkillCreatePayload,
  type SkillServiceContract,
  type SkillUpdatePayload,
} from './skillClient'

export interface SkillFeedback {
  tone: 'ok' | 'warn' | 'error'
  text: string
}

export function useSkills(customClient?: SkillServiceContract) {
  const client = useMemo(() => customClient ?? createSkillClient(), [customClient])
  const [skills, setSkills] = useState<SkillDocument[]>([])
  const [targets, setTargets] = useState<TargetDescriptor[]>([])
  const [libraryPath, setLibraryPath] = useState<string>('super_developer/library/skills')
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [feedback, setFeedback] = useState<SkillFeedback | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await client.listSkills()
      setSkills(res.skills)
      setTargets(res.targets)
      if (res.libraryPath) setLibraryPath(res.libraryPath)
      return true
    } catch (error) {
      setFeedback({
        tone: 'error',
        text: error instanceof Error ? error.message : '無法載入 Skills 清單。',
      })
      return false
    } finally {
      setIsLoading(false)
    }
  }, [client])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const upsertSkillInState = useCallback((updated: SkillDocument, oldName?: string) => {
    setSkills((prev) => {
      const filtered = oldName ? prev.filter((item) => item.name !== oldName) : prev
      const exists = filtered.some((item) => item.name === updated.name)
      const next = exists
        ? filtered.map((item) => (item.name === updated.name ? updated : item))
        : [...filtered, updated]
      return next.sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [])

  const createSkill = useCallback(
    async (payload: SkillCreatePayload) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const created = await client.createSkill(payload)
        upsertSkillInState(created)
        setFeedback({ tone: 'ok', text: `已建立 Skill「${created.name}」。` })
        return created
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '建立 Skill 失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertSkillInState],
  )

  const updateSkill = useCallback(
    async (name: string, payload: SkillUpdatePayload) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const updated = await client.updateSkill(name, payload)
        upsertSkillInState(updated, name)
        setFeedback({ tone: 'ok', text: `已儲存 Skill「${updated.name}」。` })
        return updated
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '更新 Skill 失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertSkillInState],
  )

  const deleteSkill = useCallback(
    async (name: string) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const deleted = await client.deleteSkill(name)
        setSkills((prev) => prev.filter((item) => item.name !== deleted))
        setFeedback({ tone: 'ok', text: `已刪除 Skill「${deleted}」並解除所有安裝連結。` })
        return true
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '刪除 Skill 失敗。',
        })
        return false
      } finally {
        setIsBusy(false)
      }
    },
    [client],
  )

  const toggleTarget = useCallback(
    async (skillName: string, targetId: string, install: boolean) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const updated = install
          ? await client.installToTarget(skillName, targetId)
          : await client.uninstallFromTarget(skillName, targetId)
        upsertSkillInState(updated)
        return updated
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '切換安裝狀態失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertSkillInState],
  )

  const checkAndRepairSkill = useCallback(
    async (skillName: string) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const res = await client.checkAndRepair(skillName)
        upsertSkillInState(res.skill)
        setFeedback({
          tone: res.checkReport.overallStatus === 'error' ? 'error' : 'ok',
          text: `已完成「${skillName}」跨 Provider 檢查與自動安裝。`,
        })
        return res
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '檢查安裝失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertSkillInState],
  )

  const saveSupportingFile = useCallback(
    async (skillName: string, relPath: string, content: string) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const updated = await client.putFile(skillName, relPath, content)
        upsertSkillInState(updated)
        setFeedback({ tone: 'ok', text: `已儲存附屬檔案「${relPath}」。` })
        return updated
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '儲存附屬檔案失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertSkillInState],
  )

  const removeSupportingFile = useCallback(
    async (skillName: string, relPath: string) => {
      setIsBusy(true)
      setFeedback(null)
      try {
        const updated = await client.deleteFile(skillName, relPath)
        upsertSkillInState(updated)
        setFeedback({ tone: 'ok', text: `已刪除附屬檔案「${relPath}」。` })
        return updated
      } catch (error) {
        setFeedback({
          tone: 'error',
          text: error instanceof Error ? error.message : '刪除附屬檔案失敗。',
        })
        return null
      } finally {
        setIsBusy(false)
      }
    },
    [client, upsertSkillInState],
  )

  return {
    client,
    skills,
    targets,
    libraryPath,
    isLoading,
    isBusy,
    feedback,
    clearFeedback: () => setFeedback(null),
    reload,
    createSkill,
    updateSkill,
    deleteSkill,
    toggleTarget,
    checkAndRepairSkill,
    saveSupportingFile,
    removeSupportingFile,
  }
}
