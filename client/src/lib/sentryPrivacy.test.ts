// @vitest-environment jsdom
// A WorkOS reset link (/reset-password?token=…) carries a live token that sets a password and signs the browser
// in. Once the page has read it, nothing the browser Sentry SDK sends may contain it: not the event URL, not the
// navigation breadcrumb that dropping the token from the address bar records, not a fetch breadcrumb's query.
// Real SDK with a capturing transport, so nothing leaves the test.
import * as Sentry from "@sentry/react";
import { afterAll, describe, expect, it, vi } from "vitest";

const TOKEN = "wos_reset_SECRET_token_123";

afterAll(async () => {
  await Sentry.close(2000);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("client Sentry privacy (real SDK)", () => {
  it("a reset token or typed email never reaches an event, breadcrumb or transaction", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://publickey@o0.ingest.sentry.io/0");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })));
    const wire: string[] = [];
    const transport = (options: Parameters<typeof Sentry.createTransport>[0]) => Sentry.createTransport(options, async ({ body }) => {
      wire.push(typeof body === "string" ? body : new TextDecoder().decode(body));
      return { statusCode: 200 };
    });
    window.history.replaceState({}, "", `/reset-password?token=${TOKEN}#section`);
    const { captureClientError, initClientSentry } = await import("./sentry");
    expect(initClientSentry({ transport })).toBe(true);

    // What the reset page does once it holds the token, then a request with an email in its query string.
    window.history.replaceState(window.history.state, "", "/reset-password");
    await window.fetch("/api/example?email=asha%40gmail.com&token=" + TOKEN);
    captureClientError(new Error("Reset page privacy probe"));
    expect(await Sentry.flush(2000)).toBe(true);

    const everything = wire.join("\n");
    expect(everything).toContain("Reset page privacy probe");
    expect(everything).toContain('"category":"navigation"');
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain("asha%40gmail.com");
    expect(everything).not.toContain("#section");
  });
});
