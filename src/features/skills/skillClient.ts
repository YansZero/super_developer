import { localAgentFetch } from '../../shared/i18n/localAgentFetch'
import type {
  SkillCheckReport,
  SkillDocument,
  SupportingFileEntry,
  TargetDescriptor,
} from '../../shared/types/domain'

export interface SkillListResponse {
  ok: boolean
  libraryPath: string
  skills: SkillDocument[]
  targets: TargetDescriptor[]
  message?: string
}

export interface SkillCreatePayload {
  name: string
  description: string
  body?: string
  content?: string
  files?: Array<{ path: string; content: string }>
}

export interface SkillUpdatePayload {
  newName?: string
  description?: string
  body?: string
  content?: string
}

export interface SkillServiceContract {
  listSkills(): Promise<{ libraryPath: string; skills: SkillDocument[]; targets: TargetDescriptor[] }>
  getSkill(name: string): Promise<SkillDocument>
  createSkill(payload: SkillCreatePayload): Promise<SkillDocument>
  updateSkill(name: string, payload: SkillUpdatePayload): Promise<SkillDocument>
  deleteSkill(name: string): Promise<string>
  getFile(skillName: string, relPath: string): Promise<SupportingFileEntry>
  putFile(skillName: string, relPath: string, content: string): Promise<SkillDocument>
  deleteFile(skillName: string, relPath: string): Promise<SkillDocument>
  installToTarget(skillName: string, targetId: string): Promise<SkillDocument>
  uninstallFromTarget(skillName: string, targetId: string): Promise<SkillDocument>
  checkAndRepair(skillName: string): Promise<{ checkReport: SkillCheckReport; skill: SkillDocument }>
}

async function parseJsonOrThrow<T extends { ok?: boolean; message?: string }>(res: Response): Promise<T> {
  const data = (await res.json()) as T
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `Request failed (${res.status})`)
  }
  return data
}

export function createSkillClient(fetcher: typeof fetch = fetch): SkillServiceContract {
  return {
    async listSkills() {
      const res = await localAgentFetch(fetcher)('/api/skills')
      const data = await parseJsonOrThrow<SkillListResponse>(res)
      return {
        libraryPath: data.libraryPath,
        skills: data.skills,
        targets: data.targets,
      }
    },
    async getSkill(name: string) {
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(name)}`)
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async createSkill(payload: SkillCreatePayload) {
      const res = await localAgentFetch(fetcher)('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async updateSkill(name: string, payload: SkillUpdatePayload) {
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async deleteSkill(name: string) {
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      })
      const data = await parseJsonOrThrow<{ ok: boolean; deletedName: string; message?: string }>(res)
      return data.deletedName
    },
    async getFile(skillName: string, relPath: string) {
      const encodedPath = relPath.split('/').map(encodeURIComponent).join('/')
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(skillName)}/files/${encodedPath}`)
      const data = await parseJsonOrThrow<{ ok: boolean; file: SupportingFileEntry; message?: string }>(res)
      return data.file
    },
    async putFile(skillName: string, relPath: string, content: string) {
      const encodedPath = relPath.split('/').map(encodeURIComponent).join('/')
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(skillName)}/files/${encodedPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async deleteFile(skillName: string, relPath: string) {
      const encodedPath = relPath.split('/').map(encodeURIComponent).join('/')
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(skillName)}/files/${encodedPath}`, {
        method: 'DELETE',
      })
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async installToTarget(skillName: string, targetId: string) {
      const res = await localAgentFetch(fetcher)(
        `/api/skills/${encodeURIComponent(skillName)}/targets/${encodeURIComponent(targetId)}`,
        { method: 'POST' },
      )
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async uninstallFromTarget(skillName: string, targetId: string) {
      const res = await localAgentFetch(fetcher)(
        `/api/skills/${encodeURIComponent(skillName)}/targets/${encodeURIComponent(targetId)}`,
        { method: 'DELETE' },
      )
      const data = await parseJsonOrThrow<{ ok: boolean; skill: SkillDocument; message?: string }>(res)
      return data.skill
    },
    async checkAndRepair(skillName: string) {
      const res = await localAgentFetch(fetcher)(`/api/skills/${encodeURIComponent(skillName)}/check`, {
        method: 'POST',
      })
      const data = await parseJsonOrThrow<{
        ok: boolean
        checkReport: SkillCheckReport
        skill: SkillDocument
        message?: string
      }>(res)
      return { checkReport: data.checkReport, skill: data.skill }
    },
  }
}
