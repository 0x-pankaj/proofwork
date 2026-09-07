import "server-only";

/**
 * The one place the web app talks to the API.
 *
 * `INTERNAL_API_KEY` never leaves the server: the browser has no credentials for the API
 * at all. When a request is made on someone's behalf, the signed-in user's id travels in
 * `X-Acting-User`, which the API trusts precisely because only this server can present
 * the key alongside it.
 */

const INTERNAL_KEY_HEADER = "x-internal-key";
const ACTING_USER_HEADER = "x-acting-user";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiBaseUrl(): string {
  return (process.env.PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/+$/, "");
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  /** The signed-in user this call is made for. */
  actingUserId?: string;
  body?: unknown;
  /** Seconds to cache a public read for. Omit for no caching. */
  revalidate?: number;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { actingUserId, body, revalidate, headers, ...rest } = options;

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      accept: "application/json",
      [INTERNAL_KEY_HEADER]: process.env.INTERNAL_API_KEY ?? "",
      ...(actingUserId ? { [ACTING_USER_HEADER]: actingUserId } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(revalidate === undefined ? { cache: "no-store" } : { next: { revalidate } }),
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      response.status,
      detail?.error?.code ?? "request_failed",
      detail?.error?.message ?? `${path} failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}
