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

  it("caps free accounts at 3 alerts, paid unlimited", () => {
    expect(FREE_ALERT_LIMIT).toBe(3);
    expect(canAddAlert({ existingCount: 2, plan: "free" })).toBe(true);
    expect(canAddAlert({ existingCount: 3, plan: "free" })).toBe(false);
    expect(canAddAlert({ existingCount: 30, plan: "pro" })).toBe(true);
    expect(canAddAlert({ existingCount: 30, plan: "max" })).toBe(true);
  });
});
