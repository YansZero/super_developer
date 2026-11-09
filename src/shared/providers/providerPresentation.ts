import type { ProviderSummary } from '../types/domain'

export function getProviderStatusKey(provider: ProviderSummary): string | null {
  if (provider.statusText === 'provider.status.localAgentOfflineUnknown') {
    return 'provider.status.localAgentOfflineUnknown'
  }
  if (!provider.supportsAuthProbe && provider.cliStatus === 'available' &&
    (provider.authStatus === 'unknown' || provider.authStatus === 'manual_required') &&
    (!provider.errorCode || provider.errorCode === 'AUTH_CHECK_UNSUPPORTED')) {
    return 'provider.status.cliAvailableAuthUnknown'
  }
  if (provider.authStatus === 'authenticated') return 'provider.status.signedIn'
  if (provider.cliStatus === 'available' && provider.authStatus === 'unauthenticated') {
    return provider.version ? 'provider.status.cliAvailableNotSignedIn' : 'provider.status.cliAvailableNotSignedInNoVersion'
  }
  if (provider.cliStatus === 'unprobed') return 'provider.status.unprobed'
  return null
}

/** A capability limitation is informational only after the CLI was checked successfully. */
export function getProviderPresentation(provider: ProviderSummary) {
  const isAuthUnconfirmed = getProviderStatusKey(provider) === 'provider.status.cliAvailableAuthUnknown'
  const authErrorMessage = provider.errorCode === 'AUTH_UNAUTHENTICATED'
    ? provider.id === 'claude-code' ? 'provider.help.claudeNotSignedIn' : 'provider.error.authUnauthenticated'
    : null

  return {
    isAuthUnconfirmed,
    visualKind: isAuthUnconfirmed ? 'info' : provider.statusKind,
    statusText: isAuthUnconfirmed
      ? 'provider.status.cliAvailableAuthUnknown'
      : provider.statusText,
    errorMessage: isAuthUnconfirmed ? 'provider.help.authUnconfirmed' : authErrorMessage ?? provider.errorMessage,
  }
}
