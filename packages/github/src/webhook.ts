import { verify } from "@octokit/webhooks-methods";

/**
 * The front door. Everything after this file trusts that the payload came from GitHub,
 * so nothing here is allowed to be lenient.
 */

export const GITHUB_DELIVERY_HEADER = "x-github-delivery";
export const GITHUB_EVENT_HEADER = "x-github-event";
export const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";

export interface DeliveryHeaders {
  deliveryId: string;
  event: string;
  signature: string;
}

/** Pulls the three headers a genuine delivery always carries. */
export function readDeliveryHeaders(headers: Headers): DeliveryHeaders | undefined {
  const deliveryId = headers.get(GITHUB_DELIVERY_HEADER);
  const event = headers.get(GITHUB_EVENT_HEADER);
  const signature = headers.get(GITHUB_SIGNATURE_HEADER);
  if (!deliveryId || !event || !signature) return undefined;
  return { deliveryId, event, signature };
}

/**
 * HMAC-SHA256 over the exact bytes GitHub sent. The raw body has to be verified before
 * it is parsed: re-serialising the JSON changes the bytes and the signature no longer
 * matches, which is the classic way this check gets quietly disabled.
 */
export async function verifyGitHubSignature(
  secret: string,
  rawBody: string,
  signature: string,
): Promise<boolean> {
  if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is required to verify a delivery");
  if (!signature.startsWith("sha256=")) return false;
  try {
    return await verify(secret, rawBody, signature);
  } catch {
    // A malformed signature header throws rather than returning false.
    return false;
  }
}
