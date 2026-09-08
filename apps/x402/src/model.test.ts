import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import { endpoint, ModelError, model, modelConfigured, modelStyle } from "./model";

function env(overrides: Partial<Env> = {}): Env {
  return { MODEL_API_KEY: "k-test", ...overrides } as Env;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Captures the one request the client makes, and answers it with `body`. */
function stubFetch(body: unknown, init: { status?: number; text?: string } = {}) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  vi.stubGlobal("fetch", async (url: string, request: RequestInit) => {
    calls.push({
      url,
      headers: request.headers as Record<string, string>,
      body: JSON.parse(String(request.body)),
    });
    return {
      ok: (init.status ?? 200) < 400,
      status: init.status ?? 200,
      json: async () => body,
      text: async () => init.text ?? "",
    } as unknown as Response;
  });
  return calls;
}

describe("modelStyle", () => {
  it("assumes a gateway speaks OpenAI, because nearly all of them do", () => {
    expect(modelStyle(env({ MODEL_BASE_URL: "https://api.aifiesta.ai/v1" }))).toBe("openai");
  });

  it("uses Anthropic's own shape for Anthropic's own host", () => {
    expect(modelStyle(env())).toBe("anthropic");
    expect(modelStyle(env({ MODEL_BASE_URL: "https://api.anthropic.com" }))).toBe("anthropic");
  });

  it("is not fooled by a host that merely ends in the same letters", () => {
    expect(modelStyle(env({ MODEL_BASE_URL: "https://notanthropic.com" }))).toBe("openai");
  });

  it("lets the deployment override the guess", () => {
    const style = modelStyle(
      env({ MODEL_BASE_URL: "https://gateway.example/v1", MODEL_API_STYLE: "anthropic" }),
    );
    expect(style).toBe("anthropic");
  });

  it("still reads the older ANTHROPIC_BASE_URL", () => {
    expect(modelStyle(env({ ANTHROPIC_BASE_URL: "https://gateway.example" }))).toBe("openai");
  });
});

describe("endpoint", () => {
  it("does not double a /v1 the base already carries", () => {
    expect(endpoint("https://g.example/v1", "/v1/chat/completions")).toBe(
      "https://g.example/v1/chat/completions",
    );
  });

  it("adds the /v1 when the base stops short of it", () => {
    expect(endpoint("https://g.example", "/v1/messages")).toBe("https://g.example/v1/messages");
  });
});

describe("modelConfigured", () => {
  it("is false with no key, so nobody is charged for a call that cannot be made", () => {
    expect(modelConfigured({} as Env)).toBe(false);
    expect(modelConfigured(env({ MODEL_API_KEY: "" }))).toBe(false);
  });

  it("accepts the older ANTHROPIC_API_KEY", () => {
    expect(modelConfigured({ ANTHROPIC_API_KEY: "k" } as Env)).toBe(true);
  });
});

describe("model.complete", () => {
  it("sends and reads the OpenAI shape", async () => {
    const calls = stubFetch({ choices: [{ message: { content: "  hello  " } }] });
    const text = await model(env({ MODEL_BASE_URL: "https://g.example/v1" })).complete({
      system: "sys",
      user: "usr",
      maxTokens: 100,
    });

    expect(text).toBe("hello");
    expect(calls[0]?.url).toBe("https://g.example/v1/chat/completions");
    expect(calls[0]?.headers.authorization).toBe("Bearer k-test");
    expect(calls[0]?.body).toMatchObject({
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "usr" },
      ],
    });
  });

  it("sends and reads the Anthropic shape", async () => {
    const calls = stubFetch({ content: [{ type: "text", text: "verdict" }] });
    const text = await model(env()).complete({ system: "sys", user: "usr", maxTokens: 100 });

    expect(text).toBe("verdict");
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.headers["x-api-key"]).toBe("k-test");
    expect(calls[0]?.body).toMatchObject({ system: "sys" });
  });

  it("reads a gateway that answers OpenAI-shaped with Anthropic-style blocks", async () => {
    stubFetch({ choices: [{ message: { content: [{ text: "mixed" }] } }] });
    const text = await model(env({ MODEL_BASE_URL: "https://g.example" })).complete({
      system: "s",
      user: "u",
      maxTokens: 10,
    });
    expect(text).toBe("mixed");
  });

  it("names the likely cause when the endpoint rejects the key", async () => {
    stubFetch({}, { status: 401, text: "unauthorized" });
    const call = model(env({ MODEL_BASE_URL: "https://g.example" })).complete({
      system: "s",
      user: "u",
      maxTokens: 10,
    });

    await expect(call).rejects.toThrow(ModelError);
    await expect(call).rejects.toThrow(/MODEL_API_STYLE/);
  });

  it("fails loudly rather than inventing a verdict from an empty answer", async () => {
    stubFetch({ choices: [] });
    await expect(
      model(env({ MODEL_BASE_URL: "https://g.example" })).complete({
        system: "s",
        user: "u",
        maxTokens: 10,
      }),
    ).rejects.toThrow(/no completion/);
  });
});
