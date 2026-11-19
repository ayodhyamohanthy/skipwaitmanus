import { describe, expect, it } from "vitest";
import { FREE_ALERT_LIMIT, canAddAlert, normalizeAlertDomain } from "./alerts";

describe("saved alert contract", () => {
  it("normalizes company domains strictly", () => {
    expect(normalizeAlertDomain("Wipro.COM")).toBe("wipro.com");
    expect(normalizeAlertDomain("https://careers.acme.com/jobs")).toBe("careers.acme.com");
    expect(normalizeAlertDomain("  merkle  ")).toBeNull();
    expect(normalizeAlertDomain("not a domain")).toBeNull();
    expect(normalizeAlertDomain(42)).toBeNull();
    expect(normalizeAlertDomain("")).toBeNull();
  });

  it("caps at the entitlement's savedAlerts: Free 3, null unlimited", () => {
    expect(FREE_ALERT_LIMIT).toBe(3);
    expect(canAddAlert({ existingCount: 2, cap: FREE_ALERT_LIMIT })).toBe(true);
    expect(canAddAlert({ existingCount: 3, cap: FREE_ALERT_LIMIT })).toBe(false);
    expect(canAddAlert({ existingCount: 30, cap: null })).toBe(true);
  });
});
