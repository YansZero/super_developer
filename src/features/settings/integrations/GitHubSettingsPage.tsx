import {
  IntegrationsSettingsPage,
  type IntegrationsSettingsPageProps,
} from './IntegrationsSettingsPage'

/** GitHub-only settings route. The shared implementation keeps OAuth state and layout consistent. */
export function GitHubSettingsPage(props: IntegrationsSettingsPageProps) {
  return <IntegrationsSettingsPage {...props} mode="github" />
}
