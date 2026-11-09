import { ApiError } from "./errors.js";
import type { Transport } from "../contracts.js";
export function createHttp(transport: Transport) {
  return async (url: string, init: RequestInit = {}): Promise<unknown> => {
    let response: Response;
    try {
      response = await transport(url, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiError(503, "UNAVAILABLE");
    }
    if (!response.ok) {
      const status = response.status;
      const codes: Record<number, string> = {
        400: "INVALID_REQUEST",
        401: "AUTH_REQUIRED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        429: "RATE_LIMITED",
      };
      const raw = response.headers.get("Retry-After");
      const retry =
        raw && (/^\d{1,8}$/.test(raw) || Number.isFinite(Date.parse(raw)))
          ? raw
          : undefined;
      throw new ApiError(
        codes[status] ? status : 503,
        codes[status] ?? "UNAVAILABLE",
        retry,
      );
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new ApiError(503, "UNAVAILABLE");
    }
  };
}
export type Http = ReturnType<typeof createHttp>;
