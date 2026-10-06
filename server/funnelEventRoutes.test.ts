import { describe, expect, it } from "vitest";
import { sanitizeFunnelEvent } from "./funnelEventRoutes";

describe("sanitizeFunnelEvent", () => {
  it("accepts allowlisted names and props", () => {
    expect(sanitizeFunnelEvent({ name: "request_sent", props: { companyDomain: "Google.com", coverage: "covered", utm_source: "whatsapp" } })).toEqual({ name: "request_sent", props: { companyDomain: "google.com", coverage: "covered", utm_source: "whatsapp" } });
  });
  it("rejects unknown names", () => { expect(sanitizeFunnelEvent({ name: "purchase" })).toBeNull(); expect(sanitizeFunnelEvent(null)).toBeNull(); });
  it("drops unknown or malformed props so no personal data is stored", () => {
    expect(sanitizeFunnelEvent({ name: "landing_view", props: { email: "a@b.com", resume: "x", companyDomain: "not a domain!", channel: "sms" } })).toEqual({ name: "landing_view", props: {} });
  });
});
