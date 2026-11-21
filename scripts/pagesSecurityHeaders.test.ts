import { describe, expect, it } from "vitest";
import { onRequest } from "../functions/_middleware";

function pageResponse(path: string, host = "skipwait.me") {
  const context = {
    request: new Request(`https://${host}${path}`),
    next: async () => new Response("<!doctype html><title>SkipWait</title>", { headers: { "content-type": "text/html; charset=utf-8" } }),
  } satisfies Pick<Parameters<typeof onRequest>[0], "request" | "next">;
  // Only these two Pages bindings are used on this middleware path.
  return onRequest(context as Parameters<typeof onRequest>[0]);
}

describe("Pages Referrer-Policy", () => {
  it.each(["/reset-password?token=example", "/reset-password/", "/RESET-PASSWORD", "/%72eset-password"])(
    "does not disclose the reset page address as a Referer (%s)",
    async path => expect((await pageResponse(path)).headers.get("Referrer-Policy")).toBe("no-referrer"),
  );

  it("also applies the policy to the canonical reset redirect", async () => {
    const response = await pageResponse("/reset-password?token=example", "www.skipwait.me");
    expect(response.status).toBe(301);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it.each(["/", "/sign-in", "/forgot-password", "/reset-passwords", "/explore"])(
    "keeps the default policy elsewhere (%s)",
    async path => expect((await pageResponse(path)).headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin"),
  );
});
