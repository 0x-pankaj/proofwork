import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * One error shape for the whole API: `{ error: { code, message } }`.
 * Clients switch on `code`; `message` is for the human reading the response.
 */
export interface ApiError {
  error: { code: string; message: string };
}

export function apiError(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function fail(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
): Response {
  return c.json(apiError(code, message), status);
}
