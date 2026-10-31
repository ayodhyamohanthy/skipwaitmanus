import { afterEach, describe, expect, it, vi } from "vitest";
import { createTransactionalEmailSender } from "./emailDelivery";

describe("transactional email sender", () => {
  const saved = { key: process.env.ZEPTOMAIL_API_KEY, from: process.env.ZEPTOMAIL_FROM_EMAIL, resend: process.env.RESEND_API_KEY };
  afterEach(() => { for (const [name, value] of [["ZEPTOMAIL_API_KEY", saved.key], ["ZEPTOMAIL_FROM_EMAIL", saved.from], ["RESEND_API_KEY", saved.resend]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  it("sends through ZeptoMail from the skipwait.me address with a skipwait.me display name", async () => {
    process.env.ZEPTOMAIL_API_KEY = "test-key"; process.env.ZEPTOMAIL_FROM_EMAIL = "noreply@skipwait.me"; delete process.env.RESEND_API_KEY;
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    const result = await createTransactionalEmailSender({ fetchImpl: fetchImpl as unknown as typeof fetch })({ to: "a@acme.com", subject: "Your skipwait.me verification code", text: "123456" });
    expect(result.sent).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe("https://api.zeptomail.com/v1.1/email");
    expect(JSON.parse(init.body).from).toEqual({ address: "noreply@skipwait.me", name: "skipwait.me" });
  });
});

describe("provider status on a refused send (REL-review-email-retry)", () => {
  const saved = { key: process.env.ZEPTOMAIL_API_KEY, from: process.env.ZEPTOMAIL_FROM_EMAIL, resend: process.env.RESEND_API_KEY, alertFrom: process.env.ERROR_ALERT_FROM_EMAIL };
  afterEach(() => { for (const [name, value] of [["ZEPTOMAIL_API_KEY", saved.key], ["ZEPTOMAIL_FROM_EMAIL", saved.from], ["RESEND_API_KEY", saved.resend], ["ERROR_ALERT_FROM_EMAIL", saved.alertFrom]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });

  it("returns ZeptoMail's non-2xx status with the failure, without throwing", async () => {
    process.env.ZEPTOMAIL_API_KEY = "test-key"; process.env.ZEPTOMAIL_FROM_EMAIL = "noreply@skipwait.me"; delete process.env.RESEND_API_KEY;
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 422 }));
    const result = await createTransactionalEmailSender({ fetchImpl: fetchImpl as unknown as typeof fetch })({ to: "a@acme.com", subject: "s", text: "t" });
    expect(result).toEqual({ sent: false, reason: "delivery_failed", providerStatus: 422 });
  });

  it("returns Resend's non-2xx status when Resend is the configured path", async () => {
    delete process.env.ZEPTOMAIL_API_KEY; delete process.env.ZEPTOMAIL_FROM_EMAIL; process.env.RESEND_API_KEY = "test-key"; process.env.ERROR_ALERT_FROM_EMAIL = "alerts@skipwait.me";
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 503 }));
    const result = await createTransactionalEmailSender({ fetchImpl: fetchImpl as unknown as typeof fetch })({ to: "a@acme.com", subject: "s", text: "t" });
    expect(result).toEqual({ sent: false, reason: "delivery_failed", providerStatus: 503 });
  });

  it("carries no provider status on a network failure or on success", async () => {
    process.env.ZEPTOMAIL_API_KEY = "test-key"; process.env.ZEPTOMAIL_FROM_EMAIL = "noreply@skipwait.me"; delete process.env.RESEND_API_KEY;
    const thrown = vi.fn(async () => { throw new TypeError("network down"); });
    expect(await createTransactionalEmailSender({ fetchImpl: thrown as unknown as typeof fetch })({ to: "a@acme.com", subject: "s", text: "t" })).toEqual({ sent: false, reason: "delivery_failed" });
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await createTransactionalEmailSender({ fetchImpl: ok as unknown as typeof fetch })({ to: "a@acme.com", subject: "s", text: "t" })).toEqual({ sent: true, reason: "sent" });
  });
});
