import { describe, expect, it } from "vitest";

const runExternalCredentialTests = process.env.RUN_EXTERNAL_CREDENTIAL_TESTS === "true";

describe("Resend direct-error-alert configuration", () => {
  it("uses the verified updates.skipwait sender address", () => {
    expect(process.env.ERROR_ALERT_FROM_EMAIL).toBe("noreply@updates.skipwait.me");
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
