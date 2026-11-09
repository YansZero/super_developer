import { CLOUD_ID, record, text } from "../contracts.js";
import type { Site } from "../contracts.js";
import type { AuthService } from "../auth/authService.js";
import type { Repositories } from "../storage/repositories.js";
import { ApiError } from "../http/errors.js";
export function createSiteService(auth: AuthService, repo: Repositories) {
  async function sites(userId: string): Promise<Site[]> {
    const data = await auth.authorized(
      userId,
      "https://api.atlassian.com/oauth/token/accessible-resources",
    );
    if (!Array.isArray(data)) throw new ApiError(503, "UNAVAILABLE");
    const out: Site[] = [];
    for (const raw of data) {
      const d = record(raw);
      if (!Array.isArray(d.scopes) || !d.scopes.includes("read:jira-work"))
        continue;
      try {
        const url = new URL(text(d.url));
        if (
          !CLOUD_ID.test(text(d.id)) ||
          !text(d.name) ||
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== "/"
        )
          throw Error();
        out.push({
          cloudId: text(d.id).toLowerCase(),
          name: text(d.name),
          url: url.href,
        });
      } catch {
        throw new ApiError(503, "UNAVAILABLE");
      }
    }
    return [...new Map(out.map((s) => [s.cloudId, s])).values()];
  }
  async function requireSite(userId: string, value: unknown) {
    if (typeof value !== "string" || !CLOUD_ID.test(value))
      throw new ApiError(400, "INVALID_REQUEST");
    const site = (await sites(userId)).find(
      (s) => s.cloudId === value.toLowerCase(),
    );
    if (!site) throw new ApiError(403, "FORBIDDEN");
    return site;
  }
  return {
    sites,
    requireSite,
    async select(userId: string, value: unknown) {
      const site = await requireSite(userId, value);
      repo.select(userId, site.cloudId);
      return site.cloudId;
    },
  };
}
export type SiteService = ReturnType<typeof createSiteService>;
