import type { ErrorRequestHandler } from "express";
const messages: Record<string, string> = {
  AUTH_REQUIRED: "請重新登入 Jira",
  FORBIDDEN: "無權限存取此 Jira 資源",
  NOT_FOUND: "找不到 Jira 資源",
  RATE_LIMITED: "請求過於頻繁，請稍後再試",
  UNCONFIGURED: "Jira 尚未完成設定",
  UNAVAILABLE: "Jira 服務暫時無法使用",
  INVALID_REQUEST: "請求參數無效",
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfter?: string,
  ) {
    super(messages[code] ?? messages.UNAVAILABLE);
  }
}
export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req,
  res,
  _next,
) => {
  void _next;
  const e =
    error instanceof ApiError
      ? error
      : error instanceof SyntaxError
        ? new ApiError(400, "INVALID_REQUEST")
        : new ApiError(503, "UNAVAILABLE");
  if (e.retryAfter) res.setHeader("Retry-After", e.retryAfter);
  res.status(e.status).json({ error: { code: e.code, message: e.message } });
};
