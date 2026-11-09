import {
  IntegrationsSettingsPage,
  type IntegrationsSettingsPageProps,
} from './IntegrationsSettingsPage'

/** Jira-only settings route, including Site, OAuth clients and ticket assignment. */
export function JiraSettingsPage(props: IntegrationsSettingsPageProps) {
  return <IntegrationsSettingsPage {...props} mode="jira" />
}
