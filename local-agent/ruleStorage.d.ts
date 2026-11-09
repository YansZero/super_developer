declare module '*ruleStorage.mjs' {
  export function resolveDefaultRuleConfigPath(
    env?: Record<string, string | undefined>,
  ): string

  export function writeRuleFileAtomicallyRestricted(
    filePath: string,
    contentString: string,
  ): void

  export interface PersistedRuleRecord {
    id: string
    fileName: string
    extension: '.md' | '.txt'
    sizeBytes: number
    content: string
    enabled: boolean
    kind: 'guidance' | 'rule' | 'hook'
    hookEvents: Array<'before-command' | 'before-completion'>
    appliedProviderIds: string[]
    installedHookProviderIds: string[]
    updatedAt: string
    loadedAtLabel: string
  }

  export interface RuleStorageInstance {
    readonly configFilePath: string
    listRules(): PersistedRuleRecord[]
    getRuleById(ruleId: string): PersistedRuleRecord | null
    addRule(
      rawInput: unknown,
    ):
      | { ok: true; rule: PersistedRuleRecord; rules: PersistedRuleRecord[] }
      | { ok: false; errorCode: string; message: string }
    updateRule(
      ruleId: string,
      rawInput: unknown,
    ):
      | { ok: true; rule: PersistedRuleRecord; rules: PersistedRuleRecord[] }
      | { ok: false; errorCode: string; message: string }
    reorderRules(
      rawInput: unknown,
    ):
      | { ok: true; rules: PersistedRuleRecord[] }
      | { ok: false; errorCode: string; message: string }
    removeRule(
      ruleId: string,
    ):
      | { ok: true; removedId: string; rules: PersistedRuleRecord[] }
      | { ok: false; errorCode: string; message: string }
    getRuleApplication(ruleId: string, providerId: string):
      | { ok: true; rule: PersistedRuleRecord; application: { ruleId: string; providerId: string; applied: boolean; hookInstalled: boolean; effective: boolean } }
      | { ok: false; errorCode: string; message: string }
    applyRule(ruleId: string, rawInput: unknown):
      | { ok: true; rule: PersistedRuleRecord; application: { ruleId: string; providerId: string; applied: boolean; hookInstalled: boolean; effective: boolean } }
      | { ok: false; errorCode: string; message: string }
    getEffectiveRules(providerId: string): PersistedRuleRecord[]
  }

  export function createRuleStorage(options?: {
    configFilePath?: string
  }): RuleStorageInstance
}
