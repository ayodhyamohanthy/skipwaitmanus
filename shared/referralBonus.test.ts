// D-099 slice A (D-374): the bonus contract's own rules. Written before the
// implementation: every case below failed with "Cannot find module" first.
import { describe, expect, it } from "vitest";
import {
  BONUS_FRESHNESS_DAYS,
  adminBonusUpsertSchema,
  bonusDetailResponseSchema,
  bonusListResponseSchema,
  bonusReportInputSchema,
  formatBonus,
  isFresh,
  publicBonusSchema,
  sourceHostAllowed,
  sourceHostOf,
} from "./referralBonus";

const bonus = { amountMinor: 5_000_000, currency: "INR", upTo: false, scopeNote: null, sourceUrl: "https://www.wipro.com/careers/referrals", sourceHost: "www.wipro.com", checkedAt: "2026-11-01T00:00:00.000Z" };

describe("formatBonus (ruling 5)", () => {
  it("formats INR in en-IN with no decimals when the minor part is zero", () => {
    expect(formatBonus({ amountMinor: 5_000_000, currency: "INR", upTo: false })).toBe("₹50,000");
  });

  it("formats USD in en-US", () => {
    expect(formatBonus({ amountMinor: 200_000, currency: "USD", upTo: false })).toBe("$2,000");
  });

  it("formats JPY, which has no minor unit", () => {
    expect(formatBonus({ amountMinor: 100_000, currency: "JPY", upTo: false })).toBe("¥100,000");
  });

  it("keeps the minor part when it is not zero", () => {
    expect(formatBonus({ amountMinor: 200_050, currency: "USD", upTo: false })).toBe("$2,000.50");
  });

  it("says 'Up to' for a ceiling", () => {
    expect(formatBonus({ amountMinor: 200_000, currency: "USD", upTo: true })).toBe("Up to $2,000");
  });
});

describe("isFresh (ruling 4)", () => {
  const now = new Date("2026-11-24T12:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  it("is fresh one second inside the window", () => {
    expect(isFresh(new Date(now.getTime() - BONUS_FRESHNESS_DAYS * day + 1000), now)).toBe(true);
  });

  it("is stale one second past the window", () => {
    expect(isFresh(new Date(now.getTime() - BONUS_FRESHNESS_DAYS * day - 1000), now)).toBe(false);
  });

  it("treats an unparseable date as stale", () => {
    expect(isFresh("not a date", now)).toBe(false);
  });
});

describe("sourceHostAllowed (ruling 2)", () => {
  const domains = ["wipro.com", "careers.wipro.com"];

  it("accepts the exact domain", () => {
    expect(sourceHostAllowed("https://wipro.com/referrals", domains)).toBe(true);
  });

  it("accepts a subdomain of an owned domain", () => {
    expect(sourceHostAllowed("https://www.wipro.com/referrals", domains)).toBe(true);
  });

  it("refuses another domain", () => {
    expect(sourceHostAllowed("https://example.com/referrals", domains)).toBe(false);
  });

  it("refuses a lookalike domain", () => {
    expect(sourceHostAllowed("https://evilwipro.com/referrals", domains)).toBe(false);
  });

  it("refuses http", () => {
    expect(sourceHostAllowed("http://wipro.com/referrals", domains)).toBe(false);
  });

  it("refuses credentials", () => {
    expect(sourceHostAllowed("https://user:pass@wipro.com/referrals", domains)).toBe(false);
  });

  it("refuses a port", () => {
    expect(sourceHostAllowed("https://wipro.com:8443/referrals", domains)).toBe(false);
  });

  it("refuses a non-URL", () => {
    expect(sourceHostAllowed("not a url", domains)).toBe(false);
  });
});

describe("sourceHostOf", () => {
  it("returns the lowercase host", () => {
    expect(sourceHostOf("https://WWW.Wipro.com/x")).toBe("www.wipro.com");
  });

  it("returns an empty string for a non-URL", () => {
    expect(sourceHostOf("nope")).toBe("");
  });
});

describe("strict schemas (§7 test 1)", () => {
  it("accepts a complete public bonus", () => {
    expect(publicBonusSchema.safeParse(bonus).success).toBe(true);
  });

  it("rejects an unknown key", () => {
    expect(publicBonusSchema.safeParse({ ...bonus, updatedByUserId: 7 }).success).toBe(false);
  });

  it("rejects a zero amount", () => {
    expect(publicBonusSchema.safeParse({ ...bonus, amountMinor: 0 }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(publicBonusSchema.safeParse({ ...bonus, amountMinor: -1 }).success).toBe(false);
  });

  it("rejects a lowercase currency", () => {
    expect(publicBonusSchema.safeParse({ ...bonus, currency: "usd" }).success).toBe(false);
  });

  it("rejects a made-up currency code", () => {
    expect(publicBonusSchema.safeParse({ ...bonus, currency: "ABC" }).success).toBe(false);
  });

  it("rejects a scope note longer than 120 characters", () => {
    expect(publicBonusSchema.safeParse({ ...bonus, scopeNote: "x".repeat(121) }).success).toBe(false);
  });

  it("accepts a list and a detail payload", () => {
    const company = { slug: "wipro", name: "Wipro", initials: "W" };
    expect(bonusListResponseSchema.safeParse({ bonuses: [{ company, bonus }] }).success).toBe(true);
    expect(bonusDetailResponseSchema.safeParse({ company, state: "published", bonus }).success).toBe(true);
    expect(bonusDetailResponseSchema.safeParse({ company, state: "not_published", bonus: null }).success).toBe(true);
  });

  it("rejects a detail payload that claims published with no bonus", () => {
    const company = { slug: "wipro", name: "Wipro", initials: "W" };
    expect(bonusDetailResponseSchema.safeParse({ company, state: "published", bonus: null }).success).toBe(true);
  });

  it("rejects an unknown report reason and accepts the four offered ones", () => {
    for (const reason of ["figure_changed", "source_gone", "not_this_company", "other"]) {
      expect(bonusReportInputSchema.safeParse({ reason, note: null, suggestedSourceUrl: null }).success).toBe(true);
    }
    expect(bonusReportInputSchema.safeParse({ reason: "new_source", note: null, suggestedSourceUrl: null }).success).toBe(false);
  });

  it("rejects a report note longer than 280 characters and an http suggested source", () => {
    expect(bonusReportInputSchema.safeParse({ reason: "other", note: "x".repeat(281), suggestedSourceUrl: null }).success).toBe(false);
    expect(bonusReportInputSchema.safeParse({ reason: "other", note: null, suggestedSourceUrl: "http://wipro.com/x" }).success).toBe(false);
  });

  it("rejects a future checked date on the admin upsert", () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect(adminBonusUpsertSchema.safeParse({ amountMinor: 100, currency: "USD", upTo: false, scopeNote: null, sourceUrl: "https://wipro.com/x", checkedAt: future }).success).toBe(false);
  });

  it("accepts a past checked date on the admin upsert", () => {
    expect(adminBonusUpsertSchema.safeParse({ amountMinor: 100, currency: "USD", upTo: false, scopeNote: null, sourceUrl: "https://wipro.com/x", checkedAt: "2026-01-01T00:00:00.000Z" }).success).toBe(true);
  });
});
