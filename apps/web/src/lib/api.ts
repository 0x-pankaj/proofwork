import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

const DEFAULT_API_URL = "http://localhost:8787";

export function apiBaseUrl(): string {
  // `||`, not `??`: an unset Worker variable arrives as an empty string, and a base URL
  // of "" turns every call into a relative one against the web app itself.
  return normalise(process.env.PUBLIC_API_URL || DEFAULT_API_URL);
}

function normalise(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * On Cloudflare the API is reached through a service binding rather than over the public
 * internet: a Worker calling its own account's `workers.dev` hostname does not route the
 * way you would expect, and the binding is faster and never leaves the edge anyway.
 * Outside Workers — `next dev` — there is no binding and ordinary fetch is used.
 */
interface Connection {
  send: typeof fetch;
  baseUrl: string;
}

async function connect(): Promise<Connection> {
  try {
    const context = await getCloudflareContext({ async: true });
    const env = context.env as { API?: { fetch: typeof fetch }; PUBLIC_API_URL?: string };
    const baseUrl = normalise(env.PUBLIC_API_URL || process.env.PUBLIC_API_URL || DEFAULT_API_URL);
    return { send: env.API ? env.API.fetch.bind(env.API) : fetch, baseUrl };
  } catch {
    // No Cloudflare context: running under `next dev`.
    return { send: fetch, baseUrl: apiBaseUrl() };
  }
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

  const { send, baseUrl } = await connect();
  const url = `${baseUrl}${path}`;
  const response = await send(url, {
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
    // The body is read as text first: a failure from in front of the API — an edge 404,
    // a proxy error page — is not JSON, and losing it makes these impossible to debug.
    const body = await response.text().catch(() => "");
    let detail: { error?: { code?: string; message?: string } } | undefined;
    try {
      detail = JSON.parse(body);
    } catch {
      detail = undefined;
    }

    throw new ApiError(
      response.status,
      detail?.error?.code ?? "request_failed",
      detail?.error?.message ?? `${url} failed with ${response.status}: ${body.slice(0, 200)}`,
    );
  }

  return (await response.json()) as T;
}
