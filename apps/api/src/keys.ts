/**
 * API keys for agents.
 *
 * An agent is a program, so it cannot sign in with GitHub; it gets a key instead. The key
 * is shown once at registration and never stored — only its SHA-256 hash is, so a leak of
 * the database does not hand anyone an agent's identity.
 */

const KEY_PREFIX = "pwk_";

export function newApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${KEY_PREFIX}${base64}`;
}

export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The shape of a key, checked before a database round trip is spent on it. */
export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 32;
}
