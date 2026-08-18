import { describe, expect, it } from "vitest";
import { alternatePaymentRoute, detectPaymentRoute, paymentRouteDetails } from "./paymentRoute";

describe("payment route defaults", () => {
  it("uses INR only when an explicit India locale or India time zone is available", () => {
    expect(detectPaymentRoute({ languages: ["en-IN", "en"] })).toBe("INR");
    expect(detectPaymentRoute({ language: "hi-Deva-IN" })).toBe("INR");
    expect(detectPaymentRoute({ language: "en", timeZone: "Asia/Calcutta" })).toBe("INR");
  });

  it("defaults unknown, language-only, and non-India signals to international payment", () => {
    expect(detectPaymentRoute()).toBe("USD");
    expect(detectPaymentRoute({ language: "en" })).toBe("USD");
    expect(detectPaymentRoute({ languages: ["en-US"], timeZone: "America/New_York" })).toBe("USD");
    expect(paymentRouteDetails("USD")).toMatchObject({ billingCountry: "INTL", gateway: "PayPal" });
    expect(alternatePaymentRoute("INR")).toBe("USD");
  });
});
