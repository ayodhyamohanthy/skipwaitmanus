import { describe, expect, it } from "vitest";
import {
  APPROVAL_TTL_MS,
  ASSISTANT_MIN_PLAN,
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
  it("maps the kit top tier to the live max plan", () => {
    expect(ASSISTANT_MIN_PLAN).toBe("max");
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
