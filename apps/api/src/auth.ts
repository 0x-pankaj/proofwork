import { createMiddleware } from "hono/factory";
import { type Env, required } from "./env";
import { fail } from "./http";

/**
 * The web app is the only caller of the internal routes, and it calls them server side.
 *
 * A browser never sees `INTERNAL_API_KEY`: the Next.js server holds it and tells us which
 * signed-in user it is acting for. That is why `X-Acting-User` can be trusted here and
 * must never be exposed to the public routes.
 */

export const INTERNAL_KEY_HEADER = "x-internal-key";
export const ACTING_USER_HEADER = "x-acting-user";

export interface InternalVariables {
  actingUserId: string;
}

/** Compares without leaking the position of the first difference through timing. */
export function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export const internalOnly = createMiddleware<{
  Bindings: Env;
  Variables: InternalVariables;
}>(async (c, next) => {
  const presented = c.req.header(INTERNAL_KEY_HEADER) ?? "";
  if (!secretsMatch(presented, required(c.env, "INTERNAL_API_KEY"))) {
    return fail(c, 401, "unauthorized", "this route is not public");
  }

  const actingUserId = c.req.header(ACTING_USER_HEADER);
  if (!actingUserId) {
    return fail(c, 400, "no_acting_user", `${ACTING_USER_HEADER} is required`);
  }

  c.set("actingUserId", actingUserId);
  await next();
});
