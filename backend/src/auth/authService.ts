import type { BffConfig, TokenSet } from "../contracts.js";
import { record, text } from "../contracts.js";
import { ApiError } from "../http/errors.js";
import type { Http } from "../http/transport.js";
import type { Repositories } from "../storage/repositories.js";
import { createTokenCipher } from "./crypto.js";
import type { JiraClientConfigService } from "../integrations/jiraClientConfigService.js";
export function createAuthService(
  config: BffConfig,
  repo: Repositories,
  http: Http,
  now: () => number,
  clientConfigs: JiraClientConfigService,
) {
  const cipher = createTokenCipher(config.encryptionKey),
    refreshing = new Map<string, Promise<string>>();
  async function exchange(body: Record<string, string>, clientKey?: string): Promise<TokenSet> {
    const client = clientConfigs.resolve(clientKey);
    let raw: unknown;
    try {
      raw = await http("https://auth.atlassian.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.clientId,
          client_secret: client.clientSecret,
          ...body,
        }),
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400)
        throw new ApiError(401, "AUTH_REQUIRED");
      throw e;
    }
    const d = record(raw);
    if (
      !text(d.access_token) ||
      !text(d.refresh_token) ||
      typeof d.expires_in !== "number" ||
      !Number.isFinite(d.expires_in) ||
      d.expires_in <= 0
    )
      throw new ApiError(503, "UNAVAILABLE");
    return {
      access_token: text(d.access_token),
      refresh_token: text(d.refresh_token),
      expires_in: d.expires_in,
    };
  }
  function save(userId: string, t: TokenSet, clientKey = "default") {
    repo.saveToken(
      userId,
      clientKey,
      cipher.encrypt(t.access_token),
      cipher.encrypt(t.refresh_token),
      now() + t.expires_in * 1000,
    );
  }
  async function access(userId: string): Promise<string> {
    const row = repo.token(userId);
    if (!row) throw new ApiError(401, "AUTH_REQUIRED");
    if (row.expires > now() + 60000) {
      try {
        return cipher.decrypt(row.access);
      } catch {
        repo.deleteToken(userId);
        throw new ApiError(401, "AUTH_REQUIRED");
      }
    }
    const previous = refreshing.get(userId);
    if (previous) return previous;
    const pending = (async () => {
      try {
        const fresh = repo.token(userId);
        if (!fresh) throw new ApiError(401, "AUTH_REQUIRED");
        const tokens = await exchange({
          grant_type: "refresh_token",
          refresh_token: cipher.decrypt(fresh.refresh),
        }, fresh.clientKey);
        if (!repo.token(userId)) throw new ApiError(401, "AUTH_REQUIRED");
        save(userId, tokens, fresh.clientKey);
        return tokens.access_token;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          repo.deleteToken(userId);
          throw e;
        }
        throw e;
      } finally {
        refreshing.delete(userId);
      }
    })();
    refreshing.set(userId, pending);
    return pending;
  }
  async function authorized(
    userId: string,
    url: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    const token = await access(userId);
    try {
      return await http(url, {
        ...init,
        headers: {
          ...init.headers,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) repo.deleteToken(userId);
      throw e;
    }
  }
  return {
    authorized,
    access,
    save,
    exchange,
    clients() {
      return clientConfigs.list();
    },
    authorizationUrl(state: string, clientKey?: string) {
      const client = clientConfigs.resolve(clientKey);
      return (
        "https://auth.atlassian.com/authorize?" +
        new URLSearchParams({
          audience: "api.atlassian.com",
          client_id: client.clientId,
          scope: config.scopes.join(" "),
          redirect_uri: config.callbackUrl,
          state,
          response_type: "code",
          prompt: "consent",
        })
      );
    },
    async login(code: string, clientKey = "default") {
      const tokens = await exchange({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.callbackUrl,
      }, clientKey);
      const p = record(
        await http("https://api.atlassian.com/me", {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: "application/json",
          },
        }),
      );
      if (!text(p.account_id)) throw new ApiError(503, "UNAVAILABLE");
      const user = repo.upsert(
        text(p.account_id),
        text(p.name, "Jira User"),
        null,
      );
      save(user.id, tokens, clientKey);
      return user;
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
