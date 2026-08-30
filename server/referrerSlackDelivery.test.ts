import { describe, expect, it, vi } from "vitest";
import { createReferrerSlackDeliverySender, isValidSlackIncomingWebhookUrl, maskSlackWebhookUrl } from "./referrerSlackDelivery";

const validWebhook = "https://hooks.slack.com/services/T000/B000/XXXXXXXXXXXXXXXX";

describe("Slack incoming-webhook URL validation", () => {
  it("accepts only https hooks.slack.com endpoints without credentials, query, or fragment", () => {
    expect(isValidSlackIncomingWebhookUrl(validWebhook)).toBe(true);
    expect(isValidSlackIncomingWebhookUrl("https://hooks.slack-trusted.com/services/T000/B000/XXXX")).toBe(true);
    expect(isValidSlackIncomingWebhookUrl("http://hooks.slack.com/services/T000/B000/XXXX")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl("https://evil.example/services/T000")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl("https://hooks.slack.com.evil.example/services")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl("https://user:pass@hooks.slack.com/services")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl("https://hooks.slack.com/services?track=1")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl("")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl("not a url")).toBe(false);
    expect(isValidSlackIncomingWebhookUrl(`https://hooks.slack.com/${"x".repeat(600)}`)).toBe(false);
  });

  it("masks webhook URLs to host-only form", () => {
    expect(maskSlackWebhookUrl(validWebhook)).toBe("https://hooks.slack.com/…");
  });
});

describe("opt-in Slack review delivery sender", () => {
  it("posts a company-level Block Kit message with the authenticated review link and never candidate details", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true } as Response));
    const send = createReferrerSlackDeliverySender({ fetchImpl });
    const result = await send({ to: validWebhook, companyDomain: "acme.com", reviewUrl: "https://skipwait.me/email-review/TOKEN123" });
    expect(result).toEqual({ sent: true, reason: "sent" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(validWebhook);
    const body = JSON.parse((init as RequestInit).body as string);
    expect(JSON.stringify(body)).toContain("acme.com");
    expect(JSON.stringify(body)).toContain("https://skipwait.me/email-review/TOKEN123");
    expect(JSON.stringify(body)).not.toMatch(/resume|candidate name|queue position|hiring guarantee/i);
    expect((body.blocks as Array<{ type: string }>)[0].type).toBe("header");
  });

  it("skips delivery without calling fetch when the URL is not a valid Slack webhook", async () => {
    const fetchImpl = vi.fn();
    const send = createReferrerSlackDeliverySender({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await send({ to: "https://evil.example/hook", companyDomain: "acme.com", reviewUrl: "https://skipwait.me/email-review/T" });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports delivery_failed without throwing when Slack responds with an error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 500 } as Response));
    const send = createReferrerSlackDeliverySender({ fetchImpl });
    const result = await send({ to: validWebhook, companyDomain: "acme.com", reviewUrl: "https://skipwait.me/email-review/T" });
    expect(result).toEqual({ sent: false, reason: "delivery_failed" });
  });
});
