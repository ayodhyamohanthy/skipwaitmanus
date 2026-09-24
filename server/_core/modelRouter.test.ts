import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelRouterConfigured, routeChat } from "./modelRouter";

const AI_KEYS = ["AI_PROVIDER_BASE_URL", "AI_PROVIDER_API_KEY", "AI_MODEL"] as const;
const CONFIGURED = { AI_PROVIDER_BASE_URL: "https://api.example.test/v1/", AI_PROVIDER_API_KEY: "sk_router_test_key", AI_MODEL: "model-from-config" };
const FALLBACK = "deterministic local draft";

const completion = (content: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });

function stubFetch(handler: () => Promise<unknown>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return handler();
  }));
  return calls;
}

beforeEach(() => {
  for (const key of AI_KEYS) delete process.env[key];
  Object.assign(process.env, CONFIGURED);
});

afterEach(() => {
  for (const key of AI_KEYS) delete process.env[key];
  vi.unstubAllGlobals();
});

describe("model router", () => {
  it("is configured only when the base URL, key, and model are all present", () => {
    expect(modelRouterConfigured()).toBe(true);
    delete process.env.AI_MODEL;
    expect(modelRouterConfigured()).toBe(false);
  });

  it("builds the request entirely from configuration, so a swap needs no code change", async () => {
    const calls = stubFetch(async () => completion("  swapped model answer  "));
    await expect(routeChat({ system: "be brief", user: "draft my pitch", maxTokens: 64, fallback: FALLBACK })).resolves.toBe("swapped model answer");
    expect(calls).toHaveLength(1);
    const body = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(calls[0].url).toBe("https://api.example.test/v1/chat/completions");
    expect(body).toMatchObject({ model: "model-from-config", max_tokens: 64, messages: [{ role: "system", content: "be brief" }, { role: "user", content: "draft my pitch" }] });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer sk_router_test_key");
  });

  it("passes a deadline to the provider so a hung model cannot hang a request", async () => {
    const calls = stubFetch(async () => completion("ok"));
    await routeChat({ system: "s", user: "u", fallback: FALLBACK });
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it("falls back instead of throwing when the provider answers with an error", async () => {
    stubFetch(async () => ({ ok: false, status: 503, text: async () => "upstream unavailable" }));
    await expect(routeChat({ system: "s", user: "u", fallback: FALLBACK })).resolves.toBe(FALLBACK);
  });

  it("falls back when the provider call itself fails", async () => {
    stubFetch(async () => { throw new Error("ECONNREFUSED"); });
    await expect(routeChat({ system: "s", user: "u", fallback: FALLBACK })).resolves.toBe(FALLBACK);
  });

  it("treats a blank completion as no answer at all", async () => {
    stubFetch(async () => completion("   \n "));
    await expect(routeChat({ system: "s", user: "u", fallback: FALLBACK })).resolves.toBe(FALLBACK);
  });

  it("does not contact a provider when the configuration is incomplete", async () => {
    delete process.env.AI_PROVIDER_API_KEY;
    const calls = stubFetch(async () => completion("should never be used"));
    await expect(routeChat({ system: "s", user: "u", fallback: FALLBACK })).resolves.toBe(FALLBACK);
    expect(calls).toEqual([]);
  });
});
