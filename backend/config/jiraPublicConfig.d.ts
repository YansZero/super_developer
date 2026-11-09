declare module '*jiraPublicConfig.mjs' {
  export type PublicConfigField = 'ATLASSIAN_CLIENT_ID' | 'ATLASSIAN_CALLBACK_URL' | 'ATLASSIAN_SCOPES' | 'FRONTEND_URL' | 'SD_BFF_PORT' | 'SD_DATABASE_PATH'
  export const PUBLIC_CONFIG_FIELDS: readonly PublicConfigField[]
  export interface JiraPublicConfig {
    clientId: string
    callbackUrl: string
    scopes: string[]
    frontendUrl: string
    port: number
    databasePath: string
  }
  export function loadJiraPublicConfig(environment: Partial<Record<PublicConfigField, unknown>>): {
    valid: boolean
    config: JiraPublicConfig | null
    fields: { field: PublicConfigField; status: 'missing' | 'valid' | 'invalid' }[]
  }
}
