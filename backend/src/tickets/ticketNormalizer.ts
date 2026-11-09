import { record, text } from "../contracts.js";
export function extractTextFromADF(value: unknown, depth = 0): string {
  if (depth > 40) return "";
  if (typeof value === "string") return value;
  const d = record(value);
  if (d.type === "text") return text(d.text);
  if (d.type === "hardBreak") return "\n";
  if (d.type === "mention" || d.type === "emoji")
    return text(record(d.attrs).text);
  if (!Array.isArray(d.content)) return "";
  return d.content
    .map((c) => extractTextFromADF(c, depth + 1))
    .join(d.type === "paragraph" ? "" : "\n");
}
export function normalizeTicket(
  value: unknown,
  siteUrl: string,
  detail = false,
) {
  const d = record(value),
    f = record(d.fields),
    status = record(f.status),
    category = record(status.statusCategory);
  const person = (v: unknown) =>
    v
      ? {
          accountId: text(record(v).accountId),
          displayName: text(record(v).displayName),
        }
      : null;
  return {
    id: text(d.id),
    key: text(d.key),
    summary: text(f.summary, "(No summary)"),
    status: {
      name: text(status.name, "Unknown"),
      category: text(
        category.key,
        text(category.name, "UNDEFINED"),
      ).toUpperCase(),
    },
    priority: text(record(f.priority).name, "None"),
    issueType: text(record(f.issuetype).name, "Task"),
    assignee: person(f.assignee),
    reporter: person(f.reporter),
    created: text(f.created),
    updated: text(f.updated),
    url:
      siteUrl.replace(/\/$/, "") + "/browse/" + encodeURIComponent(text(d.key)),
    ...(detail
      ? {
          description: f.description
            ? extractTextFromADF(f.description).trim() || null
            : null,
          attachments: Array.isArray(f.attachment)
            ? f.attachment.slice(0, 30).map((value) => {
                const attachment = record(value);
                return {
                  id: text(attachment.id),
                  filename: text(attachment.filename, "未命名附件"),
                  mimeType: text(attachment.mimeType),
                  size: typeof attachment.size === "number" && Number.isFinite(attachment.size)
                    ? Math.max(0, attachment.size)
                    : 0,
                };
              })
            : [],
        }
      : {}),
  };
}
