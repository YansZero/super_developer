import { GITHUB_DEVICE_VERIFICATION_URI, GITHUB_REQUIRED_SCOPE } from './githubContracts.mjs'

export function createGitHubSnapshotBuilder({ keyring, storage, nowFn, expireActiveFlowIfNeeded, getActiveDeviceFlow, getLastTerminalStatus }) {
  return function buildGitHubSnapshot() {
    expireActiveFlowIfNeeded()
    const activeDeviceFlow = getActiveDeviceFlow()
    const keyringStatus = keyring.isAvailable()
    const persisted = storage.getPersistedState()

    if (activeDeviceFlow) {
      const remainingSeconds = Math.max(
        0,
        Math.ceil((activeDeviceFlow.expiresAtMs - nowFn()) / 1000),
      )
      return {
        clientId: persisted.clientId || activeDeviceFlow.clientId || null,
        requiredScope: GITHUB_REQUIRED_SCOPE,
        verificationUri: GITHUB_DEVICE_VERIFICATION_URI,
        keyringAvailable: keyringStatus.ok,
        keyringErrorCode: keyringStatus.ok ? null : keyringStatus.errorCode,
        keyringMessage: keyringStatus.ok ? null : keyringStatus.message,
        flowState: 'pending',
        pendingSession: {
          sessionId: activeDeviceFlow.sessionId,
          userCode: activeDeviceFlow.userCode,
          verificationUri: GITHUB_DEVICE_VERIFICATION_URI,
          intervalSeconds: activeDeviceFlow.intervalSeconds,
          expiresInSeconds: remainingSeconds,
          pollingAuthorized: activeDeviceFlow.pollingAuthorized,
        },
        account: null,
        repositories: [],
        mappings: [],
      }
    }

    if (persisted.account) {
      const tokenCheck = keyring.getAccessToken()
      if (tokenCheck.ok && tokenCheck.value) {
        return {
          clientId: persisted.clientId,
          requiredScope: GITHUB_REQUIRED_SCOPE,
          verificationUri: GITHUB_DEVICE_VERIFICATION_URI,
          keyringAvailable: true,
          keyringErrorCode: null,
          keyringMessage: null,
          flowState: 'connected',
          pendingSession: null,
          account: persisted.account,
          repositories: persisted.repositories,
          mappings: persisted.mappings,
        }
      }
    }

    return {
      clientId: persisted.clientId,
      requiredScope: GITHUB_REQUIRED_SCOPE,
      verificationUri: GITHUB_DEVICE_VERIFICATION_URI,
      keyringAvailable: keyringStatus.ok,
      keyringErrorCode: keyringStatus.ok ? null : keyringStatus.errorCode,
      keyringMessage: keyringStatus.ok ? null : keyringStatus.message,
      flowState: getLastTerminalStatus(),
      pendingSession: null,
      account: null,
      repositories: [],
      mappings: [],
    }
  }

}
