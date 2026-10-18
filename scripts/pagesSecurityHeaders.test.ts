import { describe, expect, it } from "vitest";
import { onRequest, referrerPolicyFor } from "../functions/_middleware";

/**
 * Security headers the Pages middleware sets on every response. The reset page is special: its URL carries a
 * live WorkOS token until the page drops it from the address bar, and the requests the browser makes before
 * the app runs (scripts, styles, fonts) would otherwise send that URL as their Referer.
 */
async function headersFor(path: string): Promise<Headers> {
  const context = {
    request: new Request(`https://skipwait.me${path}`),
    next: async () => new Response("<!doctype html><title>SkipWait</title>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }),
  };
  const response = await onRequest(context as never);
  return response.headers;
}

describe("Referrer-Policy", () => {
  it("is no-referrer on the reset page, with or without its token", async () => {
    expect((await headersFor("/reset-password?token=wos_reset_abc")).get("Referrer-Policy")).toBe("no-referrer");
    expect((await headersFor("/reset-password/")).get("Referrer-Policy")).toBe("no-referrer");
    expect(referrerPolicyFor("/reset-password")).toBe("no-referrer");
  });

  it("stays strict-origin-when-cross-origin everywhere else", async () => {
    for (const path of ["/", "/sign-in", "/forgot-password", "/reset-passwords", "/explore"]) {
      expect((await headersFor(path)).get("Referrer-Policy"), path).toBe("strict-origin-when-cross-origin");
    }
  });
});
