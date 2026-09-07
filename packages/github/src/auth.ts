/**
 * GitHub App authentication built on Web Crypto only.
 *
 * The API runs on Cloudflare Workers, where Node's `crypto` and `Buffer` are not the
 * native path, so the JWT is signed here rather than by a Node-only library. The one
 * subtlety is the key format: GitHub hands out PKCS#1 PEM ("BEGIN RSA PRIVATE KEY")
 * and Web Crypto only imports PKCS#8, so we rewrap it below.
 */

/** GitHub rejects an app JWT that lives longer than ten minutes. */
const JWT_LIFETIME_SECONDS = 540;
/** GitHub also rejects a JWT issued in its future, so back-date `iat`. */
const CLOCK_SKEW_SECONDS = 60;
/** Refresh an installation token a minute before it actually expires. */
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export const GITHUB_API_BASE_URL = "https://api.github.com";
export const GITHUB_API_VERSION = "2022-11-28";
export const GITHUB_USER_AGENT = "proofwork";

export interface GitHubAppCredentials {
  appId: string;
  /** The PEM GitHub generated for the app. PKCS#1 or PKCS#8, with real or escaped newlines. */
  privateKey: string;
}

export interface GitHubAuthOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Injectable clock, so token expiry is testable without waiting an hour. */
  now?: () => number;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const PEM_BODY = /-----BEGIN (?:RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/;

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

/** DER length prefix: short form under 128 bytes, long form above it. */
function derLength(length: number): number[] {
  if (length < 0x80) return [length];
  const bytes: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest % 256);
  }
  return [0x80 | bytes.length, ...bytes];
}

/**
 * Wraps a PKCS#1 RSA key in the PKCS#8 envelope Web Crypto expects:
 * SEQUENCE { INTEGER 0, AlgorithmIdentifier(rsaEncryption, NULL), OCTET STRING key }.
 */
export function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const version = [0x02, 0x01, 0x00];
  // AlgorithmIdentifier for 1.2.840.113549.1.1.1 (rsaEncryption) with NULL parameters.
  const algorithm = [
    0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
  ];
  const key = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const body = [...version, ...algorithm, ...key];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

/** PEM text (either format, either newline style) to the PKCS#8 DER Web Crypto imports. */
export function privateKeyDer(pem: string): Uint8Array<ArrayBuffer> {
  const normalised = pem.replace(/\\n/g, "\n");
  const body = PEM_BODY.exec(normalised)?.[1];
  if (!body) {
    throw new Error("GITHUB_APP_PRIVATE_KEY is not a PEM-encoded private key");
  }
  const der = decodeBase64(body.replace(/\s+/g, ""));
  return normalised.includes("BEGIN RSA PRIVATE KEY") ? pkcs1ToPkcs8(der) : der;
}

/**
 * The imported signing key. Named off `importKey` rather than the global `CryptoKey`,
 * which Workers declare and Node's types do not, so this package compiles under both.
 */
type SigningKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

/** Signs app JWTs and exchanges them for installation tokens. */
export class GitHubAppAuth {
  readonly baseUrl: string;
  private readonly credentials: GitHubAppCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private signingKey: Promise<SigningKey> | undefined;
  private readonly installationTokens = new Map<number, CachedToken>();

  constructor(credentials: GitHubAppCredentials, options: GitHubAuthOptions = {}) {
    if (!credentials.appId) throw new Error("GITHUB_APP_ID is required");
    if (!credentials.privateKey) throw new Error("GITHUB_APP_PRIVATE_KEY is required");
    this.credentials = credentials;
    this.baseUrl = options.baseUrl ?? GITHUB_API_BASE_URL;
    // Bound: workerd rejects `fetch` called with a class instance as its `this`.
    this.fetchImpl = options.fetch ?? fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
  }

  /** A signed app JWT. Used for app-level endpoints and to mint installation tokens. */
  async appJwt(): Promise<string> {
    const issuedAt = Math.floor(this.now() / 1000) - CLOCK_SKEW_SECONDS;
    const header = base64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64UrlFromString(
      JSON.stringify({
        iat: issuedAt,
        exp: issuedAt + JWT_LIFETIME_SECONDS,
        iss: this.credentials.appId,
      }),
    );
    const signingInput = `${header}.${payload}`;
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      await this.key(),
      new TextEncoder().encode(signingInput),
    );
    return `${signingInput}.${base64UrlFromBytes(new Uint8Array(signature))}`;
  }

  /**
   * A token scoped to one installation, cached until shortly before it expires.
   * Workers reuse an isolate across requests, so most webhook deliveries skip the
   * round trip entirely.
   */
  async installationToken(installationId: number): Promise<string> {
    const cached = this.installationTokens.get(installationId);
    if (cached && cached.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > this.now()) {
      return cached.token;
    }

    const response = await this.fetchImpl(
      `${this.baseUrl}/app/installations/${installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await this.appJwt()}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": GITHUB_API_VERSION,
          "user-agent": GITHUB_USER_AGENT,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `installation token request failed for ${installationId}: ${response.status} ${await response.text()}`,
      );
    }

    const body = (await response.json()) as { token: string; expires_at: string };
    this.installationTokens.set(installationId, {
      token: body.token,
      expiresAtMs: Date.parse(body.expires_at),
    });
    return body.token;
  }

  /** Drops a cached token, so a revoked or suspended installation is not retried with it. */
  forget(installationId: number): void {
    this.installationTokens.delete(installationId);
  }

  private key(): Promise<SigningKey> {
    if (!this.signingKey) {
      this.signingKey = crypto.subtle.importKey(
        "pkcs8",
        privateKeyDer(this.credentials.privateKey),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      );
    }
    return this.signingKey;
  }
}
