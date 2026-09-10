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

/**
 * Postgres refusing an id that is not a UUID. Every table here is keyed by UUID, so a
 * malformed id in a path can only mean "no such record", which is a 404, not a crash.
 */
export function isMalformedId(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "22P02" || /invalid input syntax for type uuid/i.test(String(message ?? ""));
}
