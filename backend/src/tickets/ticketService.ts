import { record, text } from "../contracts.js";
import type { AuthService } from "../auth/authService.js";
import type { SiteService } from "../sites/siteService.js";
import { ApiError } from "../http/errors.js";
import { extractTextFromADF, normalizeTicket } from "./ticketNormalizer.js";
export const FILTERS = {
  assigned: 'assignee = currentUser() AND statusCategory != Done',
  reported: "reporter = currentUser()",
  inProgress: 'assignee = currentUser() AND statusCategory = "In Progress"',
  pending: 'assignee = currentUser() AND statusCategory = "To Do"',
  done: "assignee = currentUser() AND statusCategory = Done",
};
export function createTicketService(auth: AuthService, sites: SiteService) {
  async function search(userId: string, cloudId: unknown, jql: string, limit: number) {
    const site = await sites.requireSite(userId, cloudId);
    const raw = record(
      await auth.authorized(
        userId,
        `https://api.atlassian.com/ex/jira/${site.cloudId}/rest/api/3/search/jql`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jql,
            maxResults: limit,
            fields: ["summary", "status", "priority", "assignee", "reporter", "issuetype", "created", "updated"],
          }),
        },
      ),
    );
    if (!Array.isArray(raw.issues)) throw new ApiError(503, "UNAVAILABLE");
    return { tickets: raw.issues.map((issue) => normalizeTicket(issue, site.url)) };
  }
  return {
    async list(
      userId: string,
      cloudId: unknown,
      filter: unknown = "pending",
      limit: unknown = "20",
      cursor: unknown = undefined,
    ) {
      if (
        typeof filter !== "string" ||
        !Object.hasOwn(FILTERS, filter) ||
        typeof limit !== "string" ||
        !/^\d+$/.test(limit) ||
        Number(limit) < 1 ||
        Number(limit) > 100 ||
        (cursor !== undefined &&
          (typeof cursor !== "string" ||
            cursor.length > 4096 ||
            /[\x00-\x1f]/.test(cursor)))
      )
        throw new ApiError(400, "INVALID_REQUEST");
      const site = await sites.requireSite(userId, cloudId);
      const raw = record(
        await auth.authorized(
          userId,
          `https://api.atlassian.com/ex/jira/${site.cloudId}/rest/api/3/search/jql`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jql:
                FILTERS[filter as keyof typeof FILTERS] +
                " ORDER BY updated DESC",
              maxResults: Number(limit),
              fields: [
                "summary",
                "status",
                "priority",
                "assignee",
                "reporter",
                "issuetype",
                "created",
                "updated",
              ],
              ...(cursor ? { nextPageToken: cursor } : {}),
            }),
          },
        ),
      );
      if (!Array.isArray(raw.issues)) throw new ApiError(503, "UNAVAILABLE");
      const nextPageToken = text(raw.nextPageToken) || null;
      return {
        tickets: raw.issues.map((i) => normalizeTicket(i, site.url)),
        pagination: {
          nextPageToken,
          isLast:
            typeof raw.isLast === "boolean"
              ? raw.isLast
              : nextPageToken === null,
        },
      };
    },
    async projectTickets(userId: string, cloudId: unknown, projectKey: unknown, limit: unknown = "100") {
      if (
        typeof projectKey !== "string" ||
        !/^[A-Z][A-Z0-9_]{1,9}$/.test(projectKey) ||
        typeof limit !== "string" ||
        !/^\d+$/.test(limit) ||
        Number(limit) < 1 ||
        Number(limit) > 100
      ) throw new ApiError(400, "INVALID_REQUEST");
      return search(userId, cloudId, `project = ${projectKey} ORDER BY updated DESC`, Number(limit));
    },
    async detail(userId: string, cloudId: unknown, key: unknown) {
      if (
        typeof key !== "string" ||
        !/^[A-Z][A-Z0-9_]*-[1-9][0-9]*$/.test(key) ||
        key.length > 128
      )
        throw new ApiError(400, "INVALID_REQUEST");
      const site = await sites.requireSite(userId, cloudId);
      const issueUrl = new URL(
        `https://api.atlassian.com/ex/jira/${site.cloudId}/rest/api/3/issue/${encodeURIComponent(key)}`,
      );
      issueUrl.searchParams.set(
        "fields",
        "summary,status,priority,assignee,reporter,issuetype,created,updated,description,comment,attachment",
      );
      const raw = await auth.authorized(userId, issueUrl.href);
      if (text(record(raw).key) !== key) throw new ApiError(503, "UNAVAILABLE");
      const issueFields = record(record(raw).fields);
      const commentField = issueFields.comment;
      const fieldComments = Array.isArray(commentField)
        ? commentField
        : record(commentField).comments;
      let rawComments = Array.isArray(fieldComments) ? fieldComments : [];
      if (rawComments.length === 0) {
        const commentsUrl = new URL(
          `https://api.atlassian.com/ex/jira/${site.cloudId}/rest/api/3/issue/${encodeURIComponent(key)}/comment`,
        );
        commentsUrl.searchParams.set("maxResults", "3");
        commentsUrl.searchParams.set("orderBy", "-created");
        const commentsResponse = record(
          await auth.authorized(userId, commentsUrl.href),
        );
        if (!Array.isArray(commentsResponse.comments))
          throw new ApiError(503, "UNAVAILABLE");
        rawComments = commentsResponse.comments;
      }
      const comments = rawComments
        .map((value) => {
        const comment = record(value);
        const author = record(comment.author);
        return {
          id: text(comment.id),
          author: text(author.displayName, "未知使用者"),
          created: text(comment.created),
          body: extractTextFromADF(comment.body).trim(),
        };
        })
        .sort((a, b) => Date.parse(b.created) - Date.parse(a.created))
        .slice(0, 3);
      return { ...normalizeTicket(raw, site.url, true), comments };
    },
  };
}
