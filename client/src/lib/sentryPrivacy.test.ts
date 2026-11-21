// @vitest-environment jsdom
import * as Sentry from "@sentry/react";
import { afterAll, describe, expect, it, vi } from "vitest";

const TOKEN = "fixture-reset-token";
const EMAIL = "seeker@example.invalid";
const PASSWORD = "fixture-password-value";
const RELEASE = "a".repeat(40);

afterAll(async () => {
  await Sentry.close(2000);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("browser Sentry transport privacy", () => {
  it("scrubs reset navigation, fetch breadcrumbs, error events and sampled transactions", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://publickey@sentry.invalid/1");
    vi.stubEnv("VITE_GIT_COMMIT_SHA", RELEASE);
    const fetchFixture = vi.fn(async () => new Response("{}"));
    fetchFixture.toString = () => "function fetch() { [native code] }";
    vi.stubGlobal("fetch", fetchFixture);
    const wire: string[] = [];
    const transport: NonNullable<Sentry.BrowserOptions["transport"]> = options => Sentry.createTransport(options, async ({ body }) => {
      wire.push(typeof body === "string" ? body : new TextDecoder().decode(body));
      return { statusCode: 200 };
    });
    const opening = `/reset-password?token=${TOKEN}#private-section`;
    window.history.replaceState({}, "", opening);
    const { initClientSentry } = await import("./sentry");
    expect(initClientSentry({ transport, tracesSampleRate: 1 })).toBe(true);

    await Sentry.startSpan({ name: opening, op: "navigation", forceTransaction: true }, async () => {
      window.history.replaceState(window.history.state, "", "/reset-password");
      await fetch(`/api/auth/password/reset/verify?token=${TOKEN}&email=${encodeURIComponent(EMAIL)}`);
      Sentry.captureEvent({
        message: "Reset page privacy probe",
        request: { url: opening, data: { password: PASSWORD, email: EMAIL, token: TOKEN } },
      });
    });
    expect(await Sentry.flush(2000)).toBe(true);

    const sent = wire.join("\n");
    expect(sent).toContain("Reset page privacy probe");
    expect(sent).toContain('"category":"navigation"');
    expect(sent).toContain('"category":"fetch"');
    expect(sent).toContain('"type":"transaction"');
    expect(sent).toContain('"transaction":"/reset-password"');
    expect(sent).toContain(`"release":"${RELEASE}"`);
    for (const secret of [TOKEN, EMAIL, encodeURIComponent(EMAIL), PASSWORD, "private-section"]) {
      expect(sent).not.toContain(secret);
    }
  });
});
