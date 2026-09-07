import { describe, expect, it, vi } from "vitest";
import { GitHubAppAuth, pkcs1ToPkcs8, privateKeyDer } from "./auth";

const RSA_OID = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
];

async function generateKeyPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
}

async function privateKeyPem(privateKey: CryptoKey): Promise<string> {
  return toPem(new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey)), "PRIVATE KEY");
}

function toPem(der: Uint8Array, label: string): string {
  let binary = "";
  for (const byte of der) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`;
}

/** Pulls the PKCS#1 key back out of a PKCS#8 envelope, so the rewrap can be checked. */
function unwrapPkcs8(pkcs8: Uint8Array): Uint8Array {
  const start = indexOfSequence(pkcs8, RSA_OID);
  if (start < 0) throw new Error("no rsaEncryption identifier in the key");
  let cursor = start + RSA_OID.length;
  if (pkcs8[cursor] !== 0x04) throw new Error("expected an octet string after the identifier");
  cursor += 1;
  const first = pkcs8[cursor] ?? 0;
  cursor += first < 0x80 ? 1 : 1 + (first & 0x7f);
  return pkcs8.slice(cursor);
}

function indexOfSequence(haystack: Uint8Array, needle: number[]): number {
  outer: for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)));
}

function decodeBase64Url(segment: string): Uint8Array<ArrayBuffer> {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

describe("privateKeyDer", () => {
  it("passes a pkcs#8 key through untouched", async () => {
    const { privateKey } = await generateKeyPair();
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));

    expect(privateKeyDer(toPem(pkcs8, "PRIVATE KEY"))).toEqual(pkcs8);
  });

  it("rewraps the pkcs#1 key GitHub actually hands out", async () => {
    const { privateKey } = await generateKeyPair();
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", privateKey));
    const pkcs1 = unwrapPkcs8(pkcs8);

    expect(pkcs1ToPkcs8(pkcs1)).toEqual(pkcs8);
    expect(privateKeyDer(toPem(pkcs1, "RSA PRIVATE KEY"))).toEqual(pkcs8);
  });

  it("accepts the escaped newlines an env file stores", async () => {
    const { privateKey } = await generateKeyPair();
    const pem = await privateKeyPem(privateKey);

    expect(privateKeyDer(pem.replace(/\n/g, "\\n"))).toEqual(privateKeyDer(pem));
  });

  it("rejects anything that is not a pem key", () => {
    expect(() => privateKeyDer("not a key")).toThrow(/not a PEM-encoded private key/);
  });
});

describe("GitHubAppAuth", () => {
  it("signs an app jwt that verifies against the app's public key", async () => {
    const { privateKey, publicKey } = await generateKeyPair();
    const auth = new GitHubAppAuth(
      { appId: "4857347", privateKey: await privateKeyPem(privateKey) },
      { now: () => 1_700_000_000_000 },
    );

    const [header, payload, signature] = (await auth.appJwt()).split(".");

    expect(decodeSegment(header ?? "")).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeSegment(payload ?? "")).toEqual({
      iat: 1_699_999_940,
      exp: 1_700_000_480,
      iss: "4857347",
    });
    await expect(
      crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        publicKey,
        decodeBase64Url(signature ?? ""),
        new TextEncoder().encode(`${header}.${payload}`),
      ),
    ).resolves.toBe(true);
  });

  it("reuses an installation token until it is nearly expired", async () => {
    const { privateKey } = await generateKeyPair();
    let clock = 1_700_000_000_000;
    const fetchImpl = vi.fn(async () =>
      Response.json({
        token: `ghs_${clock}`,
        expires_at: new Date(clock + 3_600_000).toISOString(),
      }),
    );
    const auth = new GitHubAppAuth(
      { appId: "1", privateKey: await privateKeyPem(privateKey) },
      { fetch: fetchImpl as unknown as typeof fetch, now: () => clock },
    );

    const first = await auth.installationToken(42);
    expect(await auth.installationToken(42)).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clock += 3_560_000;
    expect(await auth.installationToken(42)).not.toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports why a token exchange failed", async () => {
    const { privateKey } = await generateKeyPair();
    const auth = new GitHubAppAuth(
      { appId: "1", privateKey: await privateKeyPem(privateKey) },
      {
        fetch: (async () => new Response("suspended", { status: 403 })) as unknown as typeof fetch,
      },
    );

    await expect(auth.installationToken(7)).rejects.toThrow(/403 suspended/);
  });
});
