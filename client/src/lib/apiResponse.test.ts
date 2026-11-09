import { describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureClientError: vi.fn() }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureClientError: sentry.captureClientError }));
import { readApiJson } from "./apiResponse";

describe("readApiJson", () => {
  it("returns parsed JSON without throwing the reporter on server failures", async () => {
    const result = await readApiJson<{ ok: boolean }>(new Response(JSON.stringify({ ok: true }), { status: 500 }), "fallback");
    expect(result).toEqual({ ok: true });
  });

  it("throws the fallback message when the body is not JSON", async () => {
    await expect(readApiJson(new Response("<html></html>", { status: 200 }), "fallback")).rejects.toThrow("fallback");
  });

  it("reports a server failure with the token-free path only (FND-4)", async () => {
    sentry.captureClientError.mockClear();
    const response = new Response(JSON.stringify({ error: "x" }), { status: 502 });
    Object.defineProperty(response, "url", { value: "https://skipwait.me/api/referrer-review-links/abc123/decision?x=1" });
    await readApiJson(response, "fallback");
    expect(sentry.captureClientError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ url: "/api/referrer-review-links/:token/decision" }));
    expect(JSON.stringify(sentry.captureClientError.mock.calls)).not.toContain("abc123");
  });
});
