import { describe, expect, it } from "vitest";
import { resolvePlanEntitlements } from "./planEntitlements";
import {
  APPROVAL_TTL_MS,
  ASSISTANT_PLAN_REQUIRED_MESSAGE,
  assistantAccessFrom,
  DEVELOPER_APP_REVIEW_SCOPES,
  getApprovalExpiresAtMs,
  isApprovalExpired,
  normalizeAppKind,
  normalizeAssistantProvider,
  normalizeDeveloperAppStatus,
  normalizeScopes,
  validateApprovalNote,
  validateAppName,
  validateDescription,
  validateRedirectUrls,
  validateUrl,
} from "./assistant";

describe("assistant access contract", () => {
  it("follows the entitlement: Land, or grandfathered legacy Max", () => {
    const termEnd = new Date("2026-11-01T00:00:00.000Z");
    const now = new Date("2026-10-14T00:00:00.000Z");
    const access = (plan: string) => assistantAccessFrom(resolvePlanEntitlements({ plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: termEnd }, now)).hasAccess;
    expect(access("max")).toBe(true);
    expect(access("land_100")).toBe(true);
    expect(access("momentum")).toBe(false);
    expect(access("pro")).toBe(false);
    expect(ASSISTANT_PLAN_REQUIRED_MESSAGE).toMatch(/Land and Concierge/);
  });

  it("accepts only known providers, kinds and statuses", () => {
    expect(normalizeAssistantProvider("chatgpt")).toBe("chatgpt");
    expect(normalizeAssistantProvider("gemini")).toBeNull();
    expect(normalizeAssistantProvider(1)).toBeNull();
    expect(normalizeAppKind("agent_mcp")).toBe("agent_mcp");
    expect(normalizeAppKind("ats")).toBeNull();
    expect(normalizeDeveloperAppStatus("in_review")).toBe("in_review");
    expect(normalizeDeveloperAppStatus("approved")).toBeNull();
  });

  it("validates scopes strictly against the allow-list", () => {
    expect(normalizeScopes(["read", "draft"], ["read", "draft", "send"])).toEqual(["read", "draft"]);
    expect(normalizeScopes(["read", "bogus"], ["read", "draft"])).toBeNull();
    expect(normalizeScopes([], ["read"])).toBeNull();
    expect(normalizeScopes("read", ["read"])).toBeNull();
    expect(normalizeScopes(["read", "read"], ["read"])).toEqual(["read"]);
  });

  it("validates names, urls, redirect lists and descriptions", () => {
    expect(validateAppName("  My  Tracker ")).toBe("My Tracker");
    expect(validateAppName("x")).toBeNull();
    expect(validateAppName("a".repeat(81))).toBeNull();
    expect(validateUrl("https://instinct.app")).toBe("https://instinct.app");
    expect(validateUrl("ftp://instinct.app")).toBeNull();
    expect(validateUrl("not a url")).toBeNull();
    expect(validateRedirectUrls(["https://a.app/cb", "https://b.app/cb"])).toEqual(["https://a.app/cb", "https://b.app/cb"]);
    expect(validateRedirectUrls([])).toBeNull();
    expect(validateRedirectUrls(["https://a.app/cb", "nope"])).toBeNull();
    expect(validateDescription("  Builds  things. ")).toBe("Builds things.");
    expect(validateDescription("")).toBeNull();
    expect(validateDescription("x".repeat(2001))).toBeNull();
  });

  it("expires approvals after 24 hours, computed in JS", () => {
    expect(APPROVAL_TTL_MS).toBe(24 * 60 * 60 * 1000);
    const created = Date.now();
    expect(getApprovalExpiresAtMs(created)).toBe(created + APPROVAL_TTL_MS);
    expect(isApprovalExpired(getApprovalExpiresAtMs(created), created)).toBe(false);
    expect(isApprovalExpired(getApprovalExpiresAtMs(created), created + APPROVAL_TTL_MS)).toBe(true);
  });

  it("requires review for send, profile and credit scopes", () => {
    expect(DEVELOPER_APP_REVIEW_SCOPES).toContain("asks:send");
    expect(DEVELOPER_APP_REVIEW_SCOPES).toContain("profile:read");
    expect(DEVELOPER_APP_REVIEW_SCOPES).toContain("credits:spend");
  });

  it("accepts assistant approval notes with a sane length", () => {
    expect(validateApprovalNote("Hi — I'd love a referral.")).toBe("Hi — I'd love a referral.");
    expect(validateApprovalNote("   ")).toBeNull();
    expect(validateApprovalNote("x".repeat(4001))).toBeNull();
  });
});
