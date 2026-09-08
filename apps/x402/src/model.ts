import type { Env } from "./env";

/**
 * The one model call this service makes, over plain fetch.
 *
 * No SDK, for the same reason the Circle client has none: it has to run on workerd, and it
 * has to survive being pointed at a gateway rather than at a vendor. Nearly every
 * multi-model gateway speaks OpenAI's `/chat/completions`; Anthropic's own API does not.
 * Both shapes are here because which one is on the other end is a deployment decision, not
 * a code change.
 */

export type ModelStyle = "anthropic" | "openai";

export interface Completion {
  system: string;
  user: string;
  maxTokens: number;
}

export interface Model {
  readonly name: string;
  readonly style: ModelStyle;
  complete(request: Completion): Promise<string>;
}

export const DEFAULT_MODEL = "claude-sonnet-5";

/** Raised when the endpoint answers with anything but a usable completion. */
export class ModelError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ModelError";
  }
}

export function modelName(env: Env): string {
  return env.MODEL_NAME || DEFAULT_MODEL;
}

export function modelKey(env: Env): string {
  return env.MODEL_API_KEY || env.ANTHROPIC_API_KEY || "";
}

export function modelBaseUrl(env: Env): string {
  const base = env.MODEL_BASE_URL || env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  return base.replace(/\/+$/, "");
}

/**
 * Which wire format the other end speaks.
 *
 * Anthropic's own API is the default. Pointing the base URL somewhere else almost always
 * means a gateway, and gateways almost always speak OpenAI — so that is the assumption
 * unless `MODEL_API_STYLE` says otherwise.
 */
export function modelStyle(env: Env): ModelStyle {
  if (env.MODEL_API_STYLE === "anthropic" || env.MODEL_API_STYLE === "openai") {
    return env.MODEL_API_STYLE;
  }
  return /(^|\.)anthropic\.com$/.test(hostOf(modelBaseUrl(env))) ? "anthropic" : "openai";
}

/**
 * Whether a call could even be attempted. Checked before anyone is charged for one.
 *
 * A key on its own is not enough. With no base URL the request goes to Anthropic, and a key
 * that is not an Anthropic key will be refused there — so that pairing is a misconfigured
 * deployment, not a working one, and saying so up front is cheaper than saying it after
 * taking the money.
 */
export function modelConfigured(env: Env): boolean {
  const key = modelKey(env);
  if (key === "") return false;
  const routed = Boolean(env.MODEL_BASE_URL || env.ANTHROPIC_BASE_URL);
  return routed || key.startsWith("sk-ant-");
}

function hostOf(base: string): string {
  try {
    return new URL(base).hostname;
  } catch {
    return "";
  }
}

/** Joins a base that may or may not already carry the `/v1`, without doubling it. */
export function endpoint(base: string, path: string): string {
  const suffix = base.endsWith("/v1") ? path.replace(/^\/v1/, "") : path;
  return `${base}${suffix}`;
}

export function model(env: Env): Model {
  const style = modelStyle(env);
  const base = modelBaseUrl(env);
  const name = modelName(env);
  const key = modelKey(env);

  return {
    name,
    style,
    async complete(request: Completion): Promise<string> {
      const { url, headers, body } =
        style === "anthropic"
          ? anthropicCall(base, name, key, request)
          : openaiCall(base, name, key, request);

      let response: Response;
      try {
        response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
      } catch (cause) {
        throw new ModelError(502, `could not reach the model at ${hostOf(base)}: ${cause}`);
      }

      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        const hint =
          response.status === 401 || response.status === 403
            ? " — check MODEL_API_KEY and MODEL_API_STYLE match this endpoint"
            : "";
        throw new ModelError(
          502,
          `the model endpoint answered ${response.status}${hint}: ${detail}`,
        );
      }

      const payload = (await response.json().catch(() => undefined)) as unknown;
      const text = style === "anthropic" ? anthropicText(payload) : openaiText(payload);
      if (text === undefined) {
        throw new ModelError(502, "the model endpoint returned no completion");
      }
      return text.trim();
    },
  };
}

function anthropicCall(base: string, name: string, key: string, request: Completion) {
  return {
    url: endpoint(base, "/v1/messages"),
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: {
      model: name,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
    },
  };
}

function openaiCall(base: string, name: string, key: string, request: Completion) {
  return {
    url: endpoint(base, "/v1/chat/completions"),
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: {
      model: name,
      max_tokens: request.maxTokens,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    },
  };
}

function anthropicText(payload: unknown): string | undefined {
  const content = (payload as { content?: Array<{ type?: string; text?: string }> })?.content;
  if (!Array.isArray(content)) return undefined;
  return content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}

function openaiText(payload: unknown): string | undefined {
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices;
  const content = choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  // Some gateways mirror Anthropic's block array back through the OpenAI shape.
  if (Array.isArray(content)) {
    return content.map((block) => (block as { text?: string })?.text ?? "").join("");
  }
  return undefined;
}
