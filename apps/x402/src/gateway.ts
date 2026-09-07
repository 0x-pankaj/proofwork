import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import type { Context } from "hono";
import { type Env, facilitatorUrl, required } from "./env";
import type { Payment } from "./payments";

/**
 * Circle's nanopayments middleware, on Cloudflare Workers.
 *
 * The middleware is written for Express but never reaches for Node: it reads `url`,
 * `headers` and `method` off the request and calls `setHeader`, `statusCode` and `end` on
 * the response. That is a small enough surface to hand it plain objects, which is all this
 * file does. The verification and settlement logic is Circle's, untouched — porting *that*
 * is the thing worth refusing to do.
 */

export type Gateway = ReturnType<typeof createGatewayMiddleware>;

export function gateway(env: Env): Gateway {
  return createGatewayMiddleware({
    sellerAddress: required(env, "X402_SELLER_ADDRESS"),
    facilitatorUrl: facilitatorUrl(env),
    description: "Proofwork — escrowed open-source bounties settled on Arc",
  });
}

export type Paid = { paid: true; payment: Payment } | { paid: false; response: Response };

/**
 * Runs the payment gate for one request.
 *
 * Returns the verified payment, or the middleware's own response — the 402 carrying the
 * payment requirements, which is the part an agent's wallet reads.
 */
export async function collect(
  middleware: ReturnType<Gateway["require"]>,
  c: Context,
  body?: unknown,
): Promise<Paid> {
  const request = {
    url: new URL(c.req.url).pathname + new URL(c.req.url).search,
    method: c.req.method,
    headers: Object.fromEntries(c.req.raw.headers),
    body,
    payment: undefined as Payment | undefined,
  };

  let status = 200;
  const headers = new Headers();
  let payload = "";

  const response = {
    get statusCode() {
      return status;
    },
    set statusCode(value: number) {
      status = value;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    },
    end(chunk?: unknown) {
      if (chunk !== undefined && chunk !== null) payload = String(chunk);
    },
  };

  let allowed = false;
  await middleware(request as never, response as never, () => {
    allowed = true;
  });

  if (allowed && request.payment?.verified) return { paid: true, payment: request.payment };
  // Anything else is the middleware's answer: a 402 with the requirements, or a refusal.
  return { paid: false, response: new Response(payload, { status, headers }) };
}
