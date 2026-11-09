import { loadJiraPublicConfig } from "../config/jiraPublicConfig.mjs";
import type { AtlassianOAuthClient, Configuration } from "./contracts.js";
function value(environment: Record<string, string | undefined>, key: string) {
  return environment[key]?.trim() ?? "";
}
function oauthClients(
  environment: Record<string, string | undefined>,
): { clients: AtlassianOAuthClient[]; missing: string[] } {
  const clients: AtlassianOAuthClient[] = [];
  const missing: string[] = [];
  const indexes = new Set<number>([1]);
  for (const key of Object.keys(environment)) {
    const match = /^ATLASSIAN_CLIENT_(?:ID|SECRET|LABEL)_(\d+)$/.exec(key);
    if (match) indexes.add(Number(match[1]));
  }
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const suffix = index === 1 ? "" : `_${index}`;
    const clientId = value(environment, `ATLASSIAN_CLIENT_ID${suffix}`);
    const clientSecret = value(environment, `ATLASSIAN_CLIENT_SECRET${suffix}`);
    const label = value(environment, `ATLASSIAN_CLIENT_LABEL${suffix}`) ||
      (index === 1 ? "預設 Atlassian 應用程式" : `Atlassian 應用程式 ${index}`);
    if (!clientId && !clientSecret) continue;
    if (!clientId) missing.push(`ATLASSIAN_CLIENT_ID${suffix}`);
    if (!clientSecret) missing.push(`ATLASSIAN_CLIENT_SECRET${suffix}`);
    if (clientId && clientSecret) {
      clients.push({ key: index === 1 ? "default" : `env-${index}`, label, clientId, clientSecret });
    }
  }
  if (!clients.length && !missing.length) {
    missing.push("ATLASSIAN_CLIENT_ID", "ATLASSIAN_CLIENT_SECRET");
  }
  return { clients, missing };
}
/** Explicit startup boundary. No environment access occurs on module import. */
export function loadConfiguration(
  environment: Record<string, string | undefined>,
): Configuration {
  const normalizedEnvironment = {
    ...environment,
    ATLASSIAN_CLIENT_ID: value(environment, "ATLASSIAN_CLIENT_ID") || value(environment, "ATLASSIAN_CLIENT_ID_1"),
  };
  const result = loadJiraPublicConfig(normalizedEnvironment);
  // Keep the BFF bootable in setup mode when only Atlassian client credentials
  // are missing. The settings page can then persist the first SQLite client
  // before the user starts an OAuth flow.
  const setupResult = result.config
    ? result
    : loadJiraPublicConfig({
        ...normalizedEnvironment,
        ATLASSIAN_CLIENT_ID:
          normalizedEnvironment.ATLASSIAN_CLIENT_ID || "setup-placeholder",
      });
  const missingSettings = result.fields
    .filter((f) => f.status !== "valid")
    .map((f) => f.field as string);
  const clientSecret = value(environment, "ATLASSIAN_CLIENT_SECRET") || value(environment, "ATLASSIAN_CLIENT_SECRET_1");
  const configuredClients = oauthClients(environment);
  missingSettings.push(...configuredClients.missing);
  const sessionSecret = environment.SESSION_SECRET?.trim() ?? "";
  const encryptionKey = environment.TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  if (!clientSecret) missingSettings.push("ATLASSIAN_CLIENT_SECRET");
  if (sessionSecret.length < 32) missingSettings.push("SESSION_SECRET");
  if (!/^[a-f0-9]{64}$/i.test(encryptionKey))
    missingSettings.push("TOKEN_ENCRYPTION_KEY");
  const portValue = environment.SD_BFF_PORT ?? "";
  const port =
    /^\d+$/.test(portValue) &&
    Number(portValue) > 0 &&
    Number(portValue) < 65536
      ? Number(portValue)
      : 4318;
  const uniqueMissingSettings = [...new Set(missingSettings)];
  const publicSettingsReady = setupResult.config !== null &&
    setupResult.fields
      .filter(({ field }) => field !== "ATLASSIAN_CLIENT_ID")
      .every(({ status }) => status === "valid");
  const runtimeReady = publicSettingsReady && sessionSecret.length >= 32 && /^[a-f0-9]{64}$/i.test(encryptionKey);
  return {
    port,
    missingSettings: uniqueMissingSettings,
    config:
      runtimeReady && setupResult.config
        ? {
            ...setupResult.config,
            clientId: value(environment, "ATLASSIAN_CLIENT_ID") || value(environment, "ATLASSIAN_CLIENT_ID_1"),
            clientSecret,
            clients: configuredClients.clients,
            sessionSecret,
            encryptionKey,
            production: environment.NODE_ENV === "production",
          }
        : null,
  };
}
