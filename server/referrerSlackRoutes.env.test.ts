import { describe, expect, it, vi } from "vitest";
import { createResendSender, createTransactionalEmailSender, createZeptoMailSender } from "./emailDelivery";

const okResponse = { ok: true } as Response;

describe("transactional email delivery", () => {
  it("sends through ZeptoMail with the Zoho-enczapikey scheme and v1.1 payload shape", async () => {
    const fetchImpl = vi.fn(async () => okResponse);
    process.env.ZEPTOMAIL_API_KEY = "test-key";
    process.env.ZEPTOMAIL_FROM_EMAIL = "noreply@skipwait.me";
    const send = createZeptoMailSender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await send({ to: "ref@acme.com", subject: "Private review", text: "body" });
    expect(result).toEqual({ sent: true, reason: "sent" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.zeptomail.com/v1.1/email");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Zoho-enczapikey test-key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.from.address).toBe("noreply@skipwait.me");
    expect(body.to[0].email_address.address).toBe("ref@acme.com");
    expect(body.textbody).toBe("body");
    delete process.env.ZEPTOMAIL_API_KEY;
    delete process.env.ZEPTOMAIL_FROM_EMAIL;
  });

  it("falls back from not-configured ZeptoMail to Resend, but never double-sends after a failure", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.ERROR_ALERT_FROM_EMAIL = "noreply@skipwait.me";
    delete process.env.ZEPTOMAIL_API_KEY;
    const fetchImpl = vi.fn(async () => okResponse);
    const send = createTransactionalEmailSender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await send({ to: "a@b.com", subject: "s", text: "t" })).toEqual({ sent: true, reason: "sent" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("resend.com");
    delete process.env.RESEND_API_KEY;
  });

  it("returns not_configured without network calls when neither provider is configured", async () => {
    const fetchImpl = vi.fn();
    const send = createTransactionalEmailSender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await send({ to: "a@b.com", subject: "s", text: "t" })).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
