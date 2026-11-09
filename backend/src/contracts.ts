export interface AtlassianOAuthClient {
  key: string;
  label: string;
  clientId: string;
  clientSecret: string;
}
export interface BffConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scopes: string[];
  frontendUrl: string;
  port: number;
  databasePath: string;
  sessionSecret: string;
  encryptionKey: string;
  production: boolean;
  /** Normalized OAuth clients. The legacy pair remains for test/backward compatibility. */
  clients?: readonly AtlassianOAuthClient[];
}
export interface Configuration {
  config: BffConfig | null;
  missingSettings: string[];
  port: number;
}
export interface Site {
  cloudId: string;
  name: string;
  url: string;
}
export interface User {
  id: string;
  accountId: string;
  name: string;
  avatarUrl: string | null;
  selectedCloudId: string | null;
}
export interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}
export interface PublicAtlassianOAuthClient {
  key: string;
  label: string;
  clientId: string;
}
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;
export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const text = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
export const CLOUD_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
