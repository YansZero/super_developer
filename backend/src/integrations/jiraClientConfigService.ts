import { randomUUID } from "node:crypto";
import type {
  AtlassianOAuthClient,
  BffConfig,
  PublicAtlassianOAuthClient,
} from "../contracts.js";
import { ApiError } from "../http/errors.js";
import type { Repositories } from "../storage/repositories.js";
import { createTokenCipher } from "../auth/crypto.js";

export interface JiraClientConfigInput {
  label: string;
  clientId: string;
  clientSecret: string;
}

export function createJiraClientConfigService(
  config: BffConfig,
  repo: Repositories,
) {
  const cipher = createTokenCipher(config.encryptionKey);
  const environmentClients = (): AtlassianOAuthClient[] => {
    if (config.clients) return [...config.clients];
    return [{ key: "default", label: "預設 Atlassian 應用程式", clientId: config.clientId, clientSecret: config.clientSecret }];
  };
  const publicClient = (client: AtlassianOAuthClient): PublicAtlassianOAuthClient => ({ key: client.key, label: client.label, clientId: client.clientId });
  function validateInput(input: JiraClientConfigInput, allowEmptySecret = false) {
    const label = input.label.trim();
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret.trim();
    if (!label || !clientId || (!allowEmptySecret && !clientSecret) || /[\u0000-\u001f\u007f]/.test(label + clientId + clientSecret))
      throw new ApiError(400, "INVALID_REQUEST");
    return { label, clientId, clientSecret };
  }
  function dbClient(row: ReturnType<Repositories["jiraClientConfig"]>) {
    if (!row) return undefined;
    try {
      return { key: `db-${row.id}`, label: row.label, clientId: row.clientId, clientSecret: cipher.decrypt(row.encryptedClientSecret) } satisfies AtlassianOAuthClient;
    } catch {
      throw new ApiError(503, "UNAVAILABLE");
    }
  }
  function dbPublicClient(row: ReturnType<Repositories["jiraClientConfig"]>) {
    if (!row) return undefined;
    return { key: `db-${row.id}`, label: row.label, clientId: row.clientId } satisfies PublicAtlassianOAuthClient;
  }
  return {
    list(): PublicAtlassianOAuthClient[] {
      const clients = environmentClients().map(publicClient);
      for (const row of repo.jiraClientConfigs()) {
        const client = dbPublicClient(row);
        if (client) clients.push(client);
      }
      return clients;
    },
    resolve(key?: string): AtlassianOAuthClient {
      const clients = environmentClients();
      const selected = key ? clients.find((client) => client.key === key) : clients[0];
      if (selected) return selected;
      if (key?.startsWith("db-")) {
        const client = dbClient(repo.jiraClientConfig(key.slice(3)));
        if (client) return client;
      }
      throw new ApiError(400, "INVALID_REQUEST");
    },
    create(input: JiraClientConfigInput): PublicAtlassianOAuthClient {
      const value = validateInput(input);
      const previous = repo.jiraClientConfigByClientId(value.clientId);
      if (previous?.enabled) throw new ApiError(400, "INVALID_REQUEST");
      const id = previous?.id ?? randomUUID();
      repo.saveJiraClientConfig({ id, label: value.label, clientId: value.clientId, encryptedClientSecret: cipher.encrypt(value.clientSecret), now: Date.now() });
      return { key: `db-${id}`, label: value.label, clientId: value.clientId };
    },
    update(key: string, input: JiraClientConfigInput): PublicAtlassianOAuthClient {
      if (!key.startsWith("db-")) throw new ApiError(400, "INVALID_REQUEST");
      const existing = repo.jiraClientConfig(key.slice(3));
      if (!existing) throw new ApiError(404, "NOT_FOUND");
      const value = validateInput(input, true);
      let clientSecret = value.clientSecret;
      if (!clientSecret) {
        try { clientSecret = cipher.decrypt(existing.encryptedClientSecret); }
        catch { throw new ApiError(503, "UNAVAILABLE"); }
      }
      repo.revokeJiraClient(key);
      repo.saveJiraClientConfig({ id: existing.id, label: value.label, clientId: value.clientId, encryptedClientSecret: cipher.encrypt(clientSecret), now: Date.now() });
      return { key, label: value.label, clientId: value.clientId };
    },
    remove(key: string) {
      if (!key.startsWith("db-") || !repo.deleteJiraClientConfig(key.slice(3))) throw new ApiError(404, "NOT_FOUND");
      repo.revokeJiraClient(key);
    },
  };
}
export type JiraClientConfigService = ReturnType<typeof createJiraClientConfigService>;
