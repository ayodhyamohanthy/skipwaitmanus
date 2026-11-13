import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_FIRST_LOOK_MS,
  OPPORTUNITY_TTL_MS,
  companyOpportunitiesResponseSchema,
  firstLookUntilFrom,
  isOpportunityExpired,
  myOpportunitiesResponseSchema,
  opportunityAskSelectionSchema,
  opportunityExpiresAtFrom,
  ownerOpportunityPostSchema,
  parseOpportunityAskSearch,
  publicOpportunityPostSchema,
} from "../shared/companyOpportunities";

// D-022 contract pin. The public projections are what every client accepts for
// a post: they must round-trip exactly, strip anything that is not part of the
// contract (owner ids, emails, verification evidence), and reject malformed
// values instead of guessing. The ask search helper is the single parser for
// "/ask?post=<id>&job=<link>".

const validPublicPost = {
  id: 7,
  companyDomain: "acme.com",
  kind: "hiring_now" as const,
  roleTitle: "Backend engineer",
  targetRoleUrl: "https://acme.com/careers/backend-engineer",
  location: "Pune",
  compensation: "30-40 LPA",
  walkInAt: null,
  walkInEndsAt: null,
  postedAt: "2026-10-01T08:00:00.000Z",
  expiresAt: "2026-10-31T08:00:00.000Z",
  poster: { kind: "anonymous" as const },
};

describe("public opportunity post contract", () => {
  it("round-trips a valid anonymous post unchanged", () => {
    expect(publicOpportunityPostSchema.parse(validPublicPost)).toEqual(validPublicPost);
  });

  it("round-trips a first-name post and a walk-in with no role link", () => {
    const named = { ...validPublicPost, poster: { kind: "firstName", firstName: "Priya" } };
    expect(publicOpportunityPostSchema.parse(named)).toEqual(named);
    const walkIn = { ...validPublicPost, kind: "walk_in", targetRoleUrl: null, walkInAt: "2026-10-20T09:00:00.000Z", walkInEndsAt: "2026-10-20T15:00:00.000Z" };
    expect(publicOpportunityPostSchema.parse(walkIn)).toEqual(walkIn);
  });

  it("never lets owner ids, emails or verification evidence through", () => {
    const leaked = { ...validPublicPost, ownerId: 42, ownerEmail: "priya@acme.com", workEmailVerifiedAt: "2026-09-01T00:00:00.000Z" };
    const parsed = publicOpportunityPostSchema.parse(leaked);
    expect(parsed).toEqual(validPublicPost);
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed).not.toHaveProperty("ownerEmail");
    expect(parsed).not.toHaveProperty("workEmailVerifiedAt");
  });

  it("rejects malformed posts instead of guessing", () => {
    const rejected = [
      { ...validPublicPost, id: 0 },
      { ...validPublicPost, id: "7" },
      { ...validPublicPost, kind: "sponsored" },
      { ...validPublicPost, roleTitle: "   " },
      { ...validPublicPost, companyDomain: "" },
      { ...validPublicPost, targetRoleUrl: "" },
      { ...validPublicPost, postedAt: "yesterday" },
      { ...validPublicPost, expiresAt: undefined },
      { ...validPublicPost, poster: { kind: "firstName", firstName: "  " } },
      { ...validPublicPost, poster: { kind: "lastName", firstName: "Sharma" } },
    ];
    for (const candidate of rejected) {
      expect(publicOpportunityPostSchema.safeParse(candidate).success, JSON.stringify(candidate)).toBe(false);
    }
  });

  it("drops a stray first name from an anonymous poster", () => {
    const parsed = publicOpportunityPostSchema.parse({ ...validPublicPost, poster: { kind: "anonymous", firstName: "Priya" } });
    expect(parsed.poster).toEqual({ kind: "anonymous" });
  });

  it("accepts the two GET responses only with a usable posts array", () => {
    expect(companyOpportunitiesResponseSchema.parse({ opportunities: [validPublicPost] }).opportunities).toHaveLength(1);
    expect(companyOpportunitiesResponseSchema.safeParse({ opportunities: null }).success).toBe(false);
    expect(companyOpportunitiesResponseSchema.safeParse({}).success).toBe(false);
  });

  it("extends the public post with the owner's control facts", () => {
    const owner = { ...validPublicPost, isActive: true, expired: false, renewable: false };
    expect(ownerOpportunityPostSchema.parse(owner)).toEqual(owner);
    expect(myOpportunitiesResponseSchema.parse({ opportunities: [owner] }).opportunities[0]?.renewable).toBe(false);
    expect(ownerOpportunityPostSchema.safeParse({ ...validPublicPost, isActive: true, expired: false }).success).toBe(false);
    expect(ownerOpportunityPostSchema.safeParse({ ...owner, renewable: "yes" }).success).toBe(false);
  });
});

describe("ask selection contract", () => {
  it("accepts only a positive integer opportunity id", () => {
    expect(opportunityAskSelectionSchema.parse({ opportunityId: 3 })).toEqual({ opportunityId: 3 });
    for (const bad of [0, -1, 1.5, Number.NaN, "3", null, undefined]) {
      expect(opportunityAskSelectionSchema.safeParse({ opportunityId: bad }).success, String(bad)).toBe(false);
    }
  });

  it("parses /ask?post=<id>&job=<link> and refuses unusable ids", () => {
    expect(parseOpportunityAskSearch("?post=12&job=https%3A%2F%2Facme.com%2Fcareers%2F123")).toEqual({ opportunityId: 12, jobUrl: "https://acme.com/careers/123" });
    expect(parseOpportunityAskSearch("?post=12")).toEqual({ opportunityId: 12, jobUrl: null });
    expect(parseOpportunityAskSearch("?post=12&job=%20%20")).toEqual({ opportunityId: 12, jobUrl: null });
    expect(parseOpportunityAskSearch("?post=12&job=&referCompany=acme&referAlias=pri-s")).toEqual({ opportunityId: 12, jobUrl: null });
    for (const bad of ["", "?", "?job=https%3A%2F%2Facme.com%2F1", "?post=", "?post=abc", "?post=0", "?post=-2", "?post=1.5", "?post=1e3"]) {
      expect(parseOpportunityAskSearch(bad), bad).toBeNull();
    }
  });
});

describe("opportunity clocks", () => {
  const now = new Date("2026-10-16T00:00:00.000Z");

  it("publishes for 30 days and holds the first look for 24 hours (owner rule, Oct 25 2026)", () => {
    expect(opportunityExpiresAtFrom(now).getTime() - now.getTime()).toBe(OPPORTUNITY_TTL_MS);
    expect(OPPORTUNITY_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(firstLookUntilFrom(now).getTime() - now.getTime()).toBe(OPPORTUNITY_FIRST_LOOK_MS);
    expect(OPPORTUNITY_FIRST_LOOK_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("hides only known past expiries, never missing ones", () => {
    const nowMs = now.getTime();
    expect(isOpportunityExpired(new Date(nowMs - 1), nowMs)).toBe(true);
    expect(isOpportunityExpired(new Date(nowMs), nowMs)).toBe(true);
    expect(isOpportunityExpired(new Date(nowMs + 1), nowMs)).toBe(false);
    expect(isOpportunityExpired("2026-10-15T00:00:00.000Z", nowMs)).toBe(true);
    expect(isOpportunityExpired(null, nowMs)).toBe(false);
    expect(isOpportunityExpired(undefined, nowMs)).toBe(false);
    expect(isOpportunityExpired("not-a-date", nowMs)).toBe(false);
  });
});

// 0094 backfills `expiresAt` on deploy day. The backfill must reproduce the
// pre-migration wall exactly from the one clock it installs, or a post's
// visible state flips on deploy: hiring-now rows kept their 30-day createdAt
// window, walk-in rows lived only until walkInEndsAt, and a legacy walk-in
// with no end time was never live — it must never be revived.
describe("postings migration (0094) backfill", () => {
  const migration = readFileSync(new URL("../drizzle/deploy/0094_opportunity_postings.sql", import.meta.url), "utf8");

  it("fills every existing row from its pre-migration visible state", () => {
    expect(migration).toContain("SET `expiresAt` = CASE WHEN `kind` = 'walk_in' THEN COALESCE(`walkInEndsAt`, `createdAt`) ELSE DATE_ADD(`createdAt`, INTERVAL 30 DAY) END WHERE `expiresAt` IS NULL");
  });

  it("keeps one guarded data write and ends with the column NOT NULL", () => {
    const body = migration.replace(/--.*$/gm, "");
    const writes = body.match(/^\s*(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\b.*$/gim) ?? [];
    expect(writes).toHaveLength(1);
    expect(body).toContain("MODIFY `expiresAt` TIMESTAMP NOT NULL");
    expect(body).not.toMatch(/^\s*ALTER TABLE/im);
  });
});
