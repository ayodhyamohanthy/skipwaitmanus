import { describe, expect, it } from "vitest";
import { createTelemetryLimiter, parsePartnerModuleCreation, parsePartnerModulePatch } from "./partnerContracts";

const WINDOW_MS = 60_000;

describe("partner telemetry limiter", () => {
  it("allows the budgeted writes in a window and blocks the next one", () => {
    const limiter = createTelemetryLimiter({ limitPerWindow: 3, windowMs: WINDOW_MS });
    const start = 1_700_000_000_000;
    expect([0, 1, 2].map(offset => limiter.allow("1.2.3.4", start + offset))).toEqual([true, true, true]);
    expect(limiter.allow("1.2.3.4", start + 3)).toBe(false);
  });

  it("resets on the window boundary and does not let blocked requests consume the next window", () => {
    const limiter = createTelemetryLimiter({ limitPerWindow: 1, windowMs: WINDOW_MS });
    const start = 1_700_000_000_000;
    expect(limiter.allow("1.2.3.4", start)).toBe(true);
    for (let offset = 1; offset < 5; offset += 1) expect(limiter.allow("1.2.3.4", start + offset * 1_000)).toBe(false);
    expect(limiter.allow("1.2.3.4", start + WINDOW_MS)).toBe(true);
  });

  it("tracks each caller separately", () => {
    const limiter = createTelemetryLimiter({ limitPerWindow: 1, windowMs: WINDOW_MS });
    const start = 1_700_000_000_000;
    expect(limiter.allow("10.0.0.1", start)).toBe(true);
    expect(limiter.allow("10.0.0.2", start)).toBe(true);
    expect(limiter.allow("10.0.0.1", start + 1)).toBe(false);
  });

  it("keeps its bookkeeping bounded, dropping expired windows first", () => {
    const limiter = createTelemetryLimiter({ limitPerWindow: 2, windowMs: WINDOW_MS, maxKeys: 8 });
    const start = 1_700_000_000_000;
    for (let index = 0; index < 40; index += 1) limiter.allow(`10.0.0.${index}`, start);
    expect(limiter.tracked()).toBeLessThanOrEqual(8);
    for (let index = 0; index < 40; index += 1) limiter.allow(`11.0.0.${index}`, start + WINDOW_MS);
    expect(limiter.tracked()).toBeLessThanOrEqual(8);
  });
});

describe("admin partner module patch contract", () => {
  it("passes through only the declared editable fields", () => {
    const parsed = parsePartnerModulePatch({ headline: "Sharpen up", isActive: false, targetRoles: "backend,qa" });
    expect(parsed).toEqual({ ok: true, value: { headline: "Sharpen up", isActive: false, targetRoles: "backend,qa" } });
  });

  it("refuses a field the persistence contract does not expose", () => {
    const parsed = parsePartnerModulePatch({ headline: "Sharpen up", impressions: 999_999 });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/impressions/i);
  });

  it("refuses an empty patch rather than writing an updatedAt-only row", () => {
    expect(parsePartnerModulePatch({}).ok).toBe(false);
    expect(parsePartnerModulePatch(undefined).ok).toBe(false);
    expect(parsePartnerModulePatch("headline=new").ok).toBe(false);
  });

  it("checks each value against the column it writes", () => {
    const rejects = (body: unknown, field: string) => {
      const parsed = parsePartnerModulePatch(body);
      expect(parsed.ok, JSON.stringify(body)).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(new RegExp(field, "i"));
    };
    rejects({ partnerName: "   " }, "partnerName");
    rejects({ partnerName: "n".repeat(121) }, "partnerName");
    rejects({ headline: "h".repeat(181) }, "headline");
    rejects({ ctaLabel: "c".repeat(81) }, "ctaLabel");
    rejects({ ctaUrl: "u".repeat(2049) }, "ctaUrl");
    rejects({ ctaUrl: "javascript:alert(document.cookie)" }, "ctaUrl");
    rejects({ ctaUrl: "data:text/html,hi" }, "ctaUrl");
    rejects({ ctaUrl: "not-a-link" }, "ctaUrl");
    rejects({ description: 12 }, "description");
    rejects({ description: "d".repeat(601) }, "description");
    rejects({ isActive: "false" }, "isActive");
    rejects({ category: "sponsored_spam" }, "category");
  });

  it("accepts the schema enum values and clearing the optional text columns", () => {
    expect(parsePartnerModulePatch({ category: "resume_vetting" })).toEqual({ ok: true, value: { category: "resume_vetting" } });
    expect(parsePartnerModulePatch({ description: null, targetRoles: null })).toEqual({ ok: true, value: { description: null, targetRoles: null } });
    expect(parsePartnerModulePatch({ ctaUrl: "https://prep.example/a?x=1" })).toEqual({ ok: true, value: { ctaUrl: "https://prep.example/a?x=1" } });
  });
});

describe("admin partner module create contract", () => {
  const valid = { partnerName: "Prep", category: "interview_prep", headline: "Get ready", ctaLabel: "Open", ctaUrl: "https://prep.example" };

  it("keeps the optional notes optional instead of demanding empty strings", () => {
    expect(parsePartnerModuleCreation(valid)).toEqual({ ok: true, value: valid });
    expect(parsePartnerModuleCreation({ ...valid, description: " How it helps ", targetRoles: "backend" }).ok).toBe(true);
  });

  it("requires every field the card renders", () => {
    for (const field of ["partnerName", "category", "headline", "ctaLabel", "ctaUrl"] as const) {
      const without = { ...valid };
      delete without[field];
      const parsed = parsePartnerModuleCreation(without);
      expect(parsed.ok, field).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(new RegExp(field, "i"));
    }
  });

  it("refuses a non-web CTA link and an invented field", () => {
    expect(parsePartnerModuleCreation({ ...valid, ctaUrl: "javascript:alert(document.cookie)" }).ok).toBe(false);
    expect(parsePartnerModuleCreation({ ...valid, isActive: false }).ok).toBe(false);
    expect(parsePartnerModuleCreation({ ...valid, impressions: 5 }).ok).toBe(false);
  });
});
