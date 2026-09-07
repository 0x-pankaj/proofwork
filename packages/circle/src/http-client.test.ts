import { describe, expect, it, vi } from "vitest";
import { CircleHttpClient } from "./http-client";

/** 32 bytes, as Circle's entity secret is. */
const ENTITY_SECRET = "a".repeat(64);

async function circlePublicKey() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  )) as CryptoKeyPair;

  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  let binary = "";
  for (const byte of spki) binary += String.fromCharCode(byte);
  const pem = `-----BEGIN PUBLIC KEY-----\n${btoa(binary).replace(/(.{64})/g, "$1\n")}\n-----END PUBLIC KEY-----`;
  return { pem, privateKey: pair.privateKey };
}

function client(pem: string, responses: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    calls.push({
      url: path,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });

    if (path.endsWith("/config/entity/publicKey")) {
      return Response.json({ data: { publicKey: pem } });
    }
    for (const [suffix, payload] of Object.entries(responses)) {
      if (path.includes(suffix)) return Response.json(payload);
    }
    return new Response("not found", { status: 404 });
  });

  return {
    calls,
    fetchImpl,
    circle: new CircleHttpClient({
      apiKey: "TEST_API_KEY:x",
      entitySecret: ENTITY_SECRET,
      fetch: fetchImpl as unknown as typeof fetch,
    }),
  };
}

describe("CircleHttpClient", () => {
  it("encrypts the entity secret to Circle's key, and only Circle can read it", async () => {
    const { pem, privateKey } = await circlePublicKey();
    const { circle } = client(pem);

    const ciphertext = await circle.entitySecretCiphertext();
    const decrypted = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      Uint8Array.from(atob(ciphertext), (character) => character.charCodeAt(0)),
    );

    const hex = [...new Uint8Array(decrypted)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(hex).toBe(ENTITY_SECRET);
  });

  it("never sends the same ciphertext twice", async () => {
    const { pem } = await circlePublicKey();
    const { circle } = client(pem);

    const first = await circle.entitySecretCiphertext();
    expect(await circle.entitySecretCiphertext()).not.toBe(first);
  });

  it("fetches Circle's public key once, however many calls follow", async () => {
    const { pem } = await circlePublicKey();
    const { circle, calls } = client(pem, { contractExecution: { data: { id: "tx-1" } } });

    await circle.createContractExecutionTransaction(execution());
    await circle.createContractExecutionTransaction(execution());

    expect(calls.filter((call) => call.url.endsWith("/config/entity/publicKey"))).toHaveLength(1);
  });

  it("posts a contract execution with an idempotency key and the ciphertext", async () => {
    const { pem } = await circlePublicKey();
    const { circle, calls } = client(pem, { contractExecution: { data: { id: "tx-1" } } });

    const result = await circle.createContractExecutionTransaction(execution());

    expect(result?.data?.id).toBe("tx-1");
    const call = calls.find((entry) => entry.url.includes("contractExecution"));
    expect(call?.url).toBe(
      "https://api.circle.com/v1/w3s/developer/transactions/contractExecution",
    );
    expect(call?.method).toBe("POST");
    expect(call?.body).toMatchObject({
      walletId: "wallet-1",
      contractAddress: "0x36",
      callData: "0xdeadbeef",
      feeLevel: "MEDIUM",
      idempotencyKey: "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b",
    });
    expect(call?.body).not.toHaveProperty("fee");
    expect(typeof (call?.body as { entitySecretCiphertext?: string })?.entitySecretCiphertext).toBe(
      "string",
    );
  });

  it("reads a transaction back by id", async () => {
    const { pem } = await circlePublicKey();
    const { circle, calls } = client(pem, {
      "/transactions/tx-1": { data: { transaction: { state: "COMPLETE", txHash: "0xabc" } } },
    });

    const result = await circle.getTransaction({ id: "tx-1" });

    expect(result?.data?.transaction).toMatchObject({ state: "COMPLETE", txHash: "0xabc" });
    expect(calls.at(-1)?.url).toBe("https://api.circle.com/v1/w3s/transactions/tx-1");
  });

  it("reports what Circle said when a call fails", async () => {
    const { pem } = await circlePublicKey();
    const { circle } = client(pem);

    await expect(circle.getTransaction({ id: "missing" })).rejects.toThrow(/404 not found/);
  });
});

function execution() {
  return {
    walletId: "wallet-1",
    contractAddress: "0x36",
    callData: "0xdeadbeef",
    fee: { type: "level" as const, config: { feeLevel: "MEDIUM" as const } },
    idempotencyKey: "0f2f1a5e-9a1a-4f0e-9e3a-2c4d5e6f7a8b",
  };
}
