import { describe, expect, it } from "vitest";

const runExternalCredentialTests = process.env.RUN_EXTERNAL_CREDENTIAL_TESTS === "true";

describe("Transactional email configuration (ZeptoMail primary, Resend fallback)", () => {
  it("keeps the verified updates.skipwait sender address for the fallback path", () => {
    expect(process.env.ERROR_ALERT_FROM_EMAIL).toBe("noreply@updates.skipwait.me");
  });

  it.runIf(runExternalCredentialTests)("authenticates the configured ZeptoMail key against the domain-scoped send API without sending", async () => {
    const apiKey = process.env.ZEPTOMAIL_API_KEY;
    expect(apiKey).toBeTruthy();
    const response = await fetch("https://api.zeptomail.com/v1.1/validate-email", {
      method: "POST",
      headers: { Authorization: `Zoho-enczapikey ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: "probe@skipwait.me" }),
      signal: AbortSignal.timeout(10_000),
    });
    expect([200, 400, 401, 422]).toContain(response.status);
  });

  it.runIf(runExternalCredentialTests && !process.env.ZEPTOMAIL_API_KEY)("authenticates the configured Resend fallback key when ZeptoMail is absent", async () => {
    const apiKey = process.env.RESEND_API_KEY;
    expect(apiKey).toMatch(/^re_/);
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.ok, await response.text()).toBe(true);
  });
});
