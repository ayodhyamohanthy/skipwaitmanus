import { describe, expect, it } from "vitest";

const runExternalCredentialTests = process.env.RUN_EXTERNAL_CREDENTIAL_TESTS === "true" && !process.env.ZEPTOMAIL_API_KEY;

describe("Resend direct-error-alert configuration", () => {
  it("keeps the verified skipwait.me sender address", () => {
    // Unset on bare clones/CI is fine: production wrangler.jsonc pins noreply@skipwait.me.
    const sender = process.env.ERROR_ALERT_FROM_EMAIL;
    expect(sender === undefined || sender === "noreply@skipwait.me").toBe(true);
  });

  it.runIf(runExternalCredentialTests)("authenticates the configured API key without sending an email", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey).toMatch(/^re_/);

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    expect(response.ok, await response.text()).toBe(true);
  });
});
