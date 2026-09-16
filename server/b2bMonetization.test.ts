import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerEmployerRoutes, type EmployerRouteDeps } from "./employerRoutes";
import { EMPLOYER_UNLOCK_CREDIT_COST, SPONSOR_TIERS, UNLOCK_CREDIT_PACKS, orderOpportunitiesSponsoredFirst } from "./db";

const employerIdentity = { account: { id: 11, openId: "workos_employer", role: "user" as const }, primaryEmail: { emailAddress: "hiring@acme.com" } };
const seekerIdentity = { account: { id: 22, openId: "workos_seeker", role: "user" as const }, primaryEmail: { emailAddress: "seeker@example.com" } };
const adminIdentity = { account: { id: 1, openId: "workos_admin", role: "admin" as const }, primaryEmail: { emailAddress: "admin@skipwait.me" } };

function baseDeps(overrides: Partial<EmployerRouteDeps> = {}): EmployerRouteDeps {
  return {
    resolveIdentity: async () => employerIdentity,
    isEmployer: async () => true,
    ensureEmployerAccount: async (userId, companyName, billingEmail) => ({ userId, companyName, billingEmail, credits: 0, budgetMonthlyUsdCents: 0 }),
    getEmployerAccount: async () => ({ id: 1, userId: 11, companyName: "Acme", billingEmail: "hiring@acme.com", credits: 20, budgetMonthlyUsdCents: 0 }),
    listAnonymizedSeekerProfiles: async () => [],
    resolveEmployerTalentRef: async (_employerId, displayRef) => displayRef === "tal_candidate_reference_12345" ? 22 : undefined,
    spendEmployerUnlockCredit: async () => ({ ok: true, remaining: 15 }),
    getUnlockedProfile: async () => ({ displayRef: "tal_candidate_reference_12345", headline: "Frontend engineer", skills: ["react"] }),
    requestEmployerTalentIntro: async () => ({ ok: true, created: true }),
    sponsorCompanyOpportunity: async (_userId, opportunityId, input) => ({ opportunityId, tier: input.tier, creditsSpent: SPONSOR_TIERS[input.tier].cost }),
    endCompanyOpportunitySponsorship: async (_adminUserId, opportunityId) => ({ opportunityId, ended: true }),
    listSponsoredCompanyOpportunities: async () => [],
    listEmployerOpportunities: async () => [],
    listPartnerModules: async () => [],
    recordPartnerImpression: async () => undefined,
    recordPartnerClick: async () => ({ recorded: true }),
    listEmployerSpendHistory: async () => [],
    createRazorpayUnlockOrder: async input => ({ id: "order_test_1", amount: input.amountInPaise, currency: "INR" }),
    ...overrides,
  };
}

function buildApp(deps: EmployerRouteDeps) {
  const app = express();
  app.use(express.json());
  registerEmployerRoutes(app, deps);
  return app;
}

describe("b2b monetization constants", () => {
  it("prices unlock credits and sponsor tiers exactly as the PRD specifies", () => {
    expect(EMPLOYER_UNLOCK_CREDIT_COST).toBe(5);
    expect(UNLOCK_CREDIT_PACKS.starter).toMatchObject({ credits: 10, amountInPaise: 2900 });
    expect(UNLOCK_CREDIT_PACKS.growth).toMatchObject({ credits: 50, amountInPaise: 12900 });
    expect(UNLOCK_CREDIT_PACKS.scale).toMatchObject({ credits: 200, amountInPaise: 39900 });
    expect(SPONSOR_TIERS.featured).toEqual({ days: 7, cost: 10 });
    expect(SPONSOR_TIERS.spotlight).toEqual({ days: 30, cost: 25 });
  });

  it("orders sponsored opportunities first, then organic by recency", () => {
    const now = Date.now();
    const ordered = orderOpportunitiesSponsoredFirst([
      { id: 1, createdAt: new Date(now - 1000), sponsoredUntil: null },
      { id: 2, createdAt: new Date(now - 3000), sponsoredUntil: new Date(now + 86_400_000) },
      { id: 3, createdAt: new Date(now - 2000), sponsoredUntil: null },
      { id: 4, createdAt: new Date(now - 5000), sponsoredUntil: new Date(now - 1000) },
      { id: 5, createdAt: new Date(now - 4000), sponsoredUntil: new Date(now + 7 * 86_400_000) },
    ]);
    expect(ordered.map(row => row.id)).toEqual([5, 2, 1, 3, 4]);
  });
});

describe("employer account routes", () => {
  it("creates an employer account on first POST with the signed-in billing email", async () => {
    const seen: Array<[number, string, string]> = [];
    const activities: string[] = [];
    const app = buildApp(baseDeps({
      ensureEmployerAccount: async (userId, companyName, billingEmail) => { seen.push([userId, companyName, billingEmail]); return { userId, companyName, billingEmail, credits: 0 }; },
      recordActivity: async input => { activities.push(input.action); },
    }));
    const response = await request(app).post("/api/employer/account").send({ companyName: "Acme Robotics" });
    expect(response.status).toBe(201);
    expect(response.body.account).toMatchObject({ companyName: "Acme Robotics", billingEmail: "hiring@acme.com" });
    expect(seen).toEqual([[11, "Acme Robotics", "hiring@acme.com"]]);
    expect(activities).toContain("employer.account_created");
  });

  it("rejects a typed billing identity that differs from verified sign-in email", async () => {
    const app = buildApp(baseDeps());
    const response = await request(app).post("/api/employer/account").send({ companyName: "Acme", billingEmail: "attacker@other.test" });
    expect(response.status).toBe(400);
  });

  it("returns the existing account on GET", async () => {
    const app = buildApp(baseDeps());
    const response = await request(app).get("/api/employer/account");
    expect(response.status).toBe(200);
    expect(response.body.account).toMatchObject({ credits: 20 });
  });

  it("requires a signed-in identity for employer routes", async () => {
    const app = buildApp(baseDeps({ resolveIdentity: async () => undefined }));
    expect((await request(app).get("/api/employer/account")).status).toBe(401);
    expect((await request(app).get("/api/employer/talent")).status).toBe(401);
  });

  it("rejects non-employer accounts with 403", async () => {
    const app = buildApp(baseDeps({ isEmployer: async () => false }));
    const response = await request(app).get("/api/employer/talent");
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Employer access is required");
  });
});

describe("unlock credit purchases", () => {
  it("creates a paise-native Razorpay order with unlock_credits notes", async () => {
    const orders: Array<{ amountInPaise: number; receipt: string; notes: Record<string, string> }> = [];
    const app = buildApp(baseDeps({ createRazorpayUnlockOrder: async input => { orders.push(input); return { id: "order_pack", amount: input.amountInPaise, currency: "INR" }; } }));
    const response = await request(app).post("/api/employer/unlock-credits/purchase").send({ pack: "growth" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ orderId: "order_pack", amount: 12900, currency: "INR", pack: "growth", credits: 50 });
    expect(orders[0]).toMatchObject({ amountInPaise: 12900 });
    expect(orders[0].receipt).toMatch(/^employer_11_\d+$/);
    expect(orders[0].notes).toMatchObject({ userId: "11", kind: "unlock_credits", pack: "growth" });
  });

  it("rejects an unknown pack with 400", async () => {
    const app = buildApp(baseDeps());
    expect((await request(app).post("/api/employer/unlock-credits/purchase").send({ pack: "mega" })).status).toBe(400);
  });
});

describe("talent discovery", () => {
  const anonymizedRow = { displayRef: "tal_opaque_test", headline: "Frontend engineer", location: "Bengaluru", skills: ["react", "typescript"], isUnlocked: false };

  it("returns the anonymized list and never leaks name, email, or resume fields", async () => {
    const app = buildApp(baseDeps({ listAnonymizedSeekerProfiles: async () => [anonymizedRow] }));
    const response = await request(app).get("/api/employer/talent?query=frontend&location=Bengaluru");
    expect(response.status).toBe(200);
    expect(response.body.talent).toHaveLength(1);
    const row = response.body.talent[0];
    for (const forbidden of ["userId", "name", "email", "resumeUrl", "phone", "experience", "bio"]) expect(row).not.toHaveProperty(forbidden);
    expect(row).toMatchObject({ displayRef: "tal_opaque_test", headline: "Frontend engineer" });
  });

  it("passes the search filters through to the list function", async () => {
    const calls: Array<{ query?: string; location?: string }> = [];
    const app = buildApp(baseDeps({ listAnonymizedSeekerProfiles: async (_userId, input) => { calls.push(input); return []; } }));
    await request(app).get("/api/employer/talent?query=react&location=Pune");
    expect(calls).toEqual([{ query: "react", location: "Pune" }]);
  });

  it("unlocks a profile, notifies the seeker, and returns the remaining credits", async () => {
    const notifications: Array<{ userId: number; title: string; category: string }> = [];
    const unlocks: Array<[number, number]> = [];
    const app = buildApp(baseDeps({
      spendEmployerUnlockCredit: async (employerUserId, seekerUserId) => { unlocks.push([employerUserId, seekerUserId]); return { ok: true, remaining: 15 }; },
      createNotification: async (userId, category, title) => { notifications.push({ userId, category, title }); },
    }));
    const response = await request(app).post("/api/employer/talent/tal_candidate_reference_12345/unlock");
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ unlocked: true, remaining: 15 });
    expect(unlocks).toEqual([[11, 22]]);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ userId: 22, category: "referral", title: "An employer unlocked your profile" });
  });


  it("uses only opaque employer-scoped references across unlock and profile URLs", async () => {
    const seen: Array<[number, string]> = [];
    const app = buildApp(baseDeps({ resolveEmployerTalentRef: async (employerId, ref) => { seen.push([employerId, ref]); return ref === "tal_candidate_reference_12345" ? 22 : undefined; } }));
    const unlock = await request(app).post("/api/employer/talent/tal_candidate_reference_12345/unlock");
    const profile = await request(app).get("/api/employer/talent/tal_candidate_reference_12345");
    expect(unlock.status).toBe(201); expect(profile.status).toBe(200);
    expect(seen).toEqual([[11, "tal_candidate_reference_12345"], [11, "tal_candidate_reference_12345"]]);
    expect(JSON.stringify([unlock.body, profile.body])).not.toMatch(/(?:userId|seekerUserId|\/22(?:\/|$))/);
  });

  it("returns 404 without spending when a reference is missing, cross-employer, or opted out", async () => {
    let spends = 0;
    const app = buildApp(baseDeps({ resolveEmployerTalentRef: async () => undefined, spendEmployerUnlockCredit: async () => { spends += 1; return { ok: true, remaining: 15 }; } }));
    expect((await request(app).post("/api/employer/talent/tal_other_employer_reference/unlock")).status).toBe(404);
    expect((await request(app).get("/api/employer/talent/tal_opted_out_reference_123")).status).toBe(404);
    expect(spends).toBe(0);
  });

  it("keeps repeated unlock idempotent and sends one notification", async () => {
    let calls = 0; const notified: number[] = [];
    const app = buildApp(baseDeps({
      spendEmployerUnlockCredit: async () => ({ ok: true, remaining: 15, alreadyUnlocked: calls++ > 0 }),
      createNotification: async userId => { notified.push(userId); },
    }));
    expect((await request(app).post("/api/employer/talent/tal_candidate_reference_12345/unlock")).status).toBe(201);
    expect((await request(app).post("/api/employer/talent/tal_candidate_reference_12345/unlock")).status).toBe(200);
    expect(notified).toEqual([22]);
  });

  it("uses a dedicated idempotent intro endpoint rather than unlock purchase reuse", async () => {
    const notifications: number[] = []; let intros = 0;
    const app = buildApp(baseDeps({ requestEmployerTalentIntro: async () => ({ ok: true, created: intros++ === 0 }), createNotification: async userId => { notifications.push(userId); } }));
    expect((await request(app).post("/api/employer/talent/tal_candidate_reference_12345/intro")).status).toBe(201);
    expect((await request(app).post("/api/employer/talent/tal_candidate_reference_12345/intro")).status).toBe(200);
    expect(notifications).toEqual([22]);
  });

  it("answers insufficient credits with 402 and the current balance", async () => {
    const app = buildApp(baseDeps({ spendEmployerUnlockCredit: async () => ({ ok: false, reason: "insufficient_credits", credits: 3 }) }));
    const response = await request(app).post("/api/employer/talent/tal_candidate_reference_12345/unlock");
    expect(response.status).toBe(402);
    expect(response.body).toEqual({ error: "Not enough unlock credits", credits: 3 });
  });

  it("serves the fuller unlocked profile only after an unlock", async () => {
    const app = buildApp(baseDeps());
    const unlocked = await request(app).get("/api/employer/talent/tal_candidate_reference_12345");
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.profile.displayRef).toBe("tal_candidate_reference_12345");
    const lockedApp = buildApp(baseDeps({ getUnlockedProfile: async () => undefined }));
    const locked = await request(lockedApp).get("/api/employer/talent/tal_candidate_reference_12345");
    expect(locked.status).toBe(402);
    expect(locked.body.error).toContain("Unlock this profile");
  });
});

describe("sponsored roles", () => {
  it("lets an employer sponsor their own opportunity and reports the tier cost", async () => {
    const sponsorships: Array<[number, { tier: string }]> = [];
    const app = buildApp(baseDeps({ requestEmployerTalentIntro: async () => ({ ok: true, created: true }),
    sponsorCompanyOpportunity: async (userId, opportunityId, input) => { sponsorships.push([opportunityId, input]); return { opportunityId, tier: input.tier, creditsSpent: 10 }; } }));
    const response = await request(app).post("/api/employer/opportunities/7/sponsor").send({ tier: "featured" });
    expect(response.status).toBe(201);
    expect(response.body.sponsorship).toMatchObject({ tier: "featured", creditsSpent: 10 });
    expect(sponsorships).toEqual([[7, { tier: "featured" }]]);
  });

  it("rejects an invalid tier and an invalid opportunity id", async () => {
    const app = buildApp(baseDeps());
    expect((await request(app).post("/api/employer/opportunities/7/sponsor").send({ tier: "mega" })).status).toBe(400);
    expect((await request(app).post("/api/employer/opportunities/not-a-number/sponsor").send({ tier: "featured" })).status).toBe(400);
  });

  it("lists the employer's own opportunities with sponsor flags", async () => {
    const app = buildApp(baseDeps({ listEmployerOpportunities: async userId => (userId === 11 ? [{ id: 7, roleTitle: "Backend", isSponsored: false }] : []) }));
    const response = await request(app).get("/api/employer/opportunities");
    expect(response.status).toBe(200);
    expect(response.body.opportunities).toEqual([{ id: 7, roleTitle: "Backend", isSponsored: false }]);
  });
});

describe("partner modules", () => {
  it("serves contextual modules for role keywords and records impressions", async () => {
    const calls: Array<{ roleKeywords?: string[] }> = [];
    const impressions: number[] = [];
    const app = buildApp(baseDeps({
      listPartnerModules: async input => { calls.push(input); return [{ id: 3, partnerName: "PrepCo", headline: "Ace the loop", ctaLabel: "Start", ctaUrl: "https://prep.example" }]; },
      recordPartnerImpression: async moduleId => { impressions.push(moduleId); },
    }));
    const response = await request(app).get("/api/partners?role=frontend%20react%20engineer");
    expect(response.status).toBe(200);
    expect(response.body.modules).toHaveLength(1);
    expect(calls[0]?.roleKeywords).toEqual(["frontend", "react", "engineer"]);
    expect(impressions).toEqual([3]);
  });

  it("records a public partner click and 404s unknown modules", async () => {
    const clicks: number[] = [];
    const app = buildApp(baseDeps({ recordPartnerClick: async moduleId => { clicks.push(moduleId); return { recorded: moduleId !== 999 }; } }));
    expect((await request(app).post("/api/partners/3/click")).status).toBe(200);
    expect(clicks).toEqual([3]);
    expect((await request(app).post("/api/partners/999/click")).status).toBe(404);
  });

  it("guards admin partner management behind the admin role", async () => {
    const app = buildApp(baseDeps({ resolveIdentity: async () => seekerIdentity }));
    expect((await request(app).get("/api/admin/partners")).status).toBe(403);
    expect((await request(app).post("/api/admin/partners").send({ partnerName: "x", category: "other", headline: "h", ctaLabel: "c", ctaUrl: "https://x.example" })).status).toBe(403);
    expect((await request(app).get("/api/admin/sponsorships")).status).toBe(403);
    expect((await request(app).post("/api/admin/opportunities/7/end-sponsorship")).status).toBe(403);
  });

  it("creates a partner module as an administrator", async () => {
    const created: Array<Record<string, unknown>> = [];
    const app = buildApp(baseDeps({ resolveIdentity: async () => adminIdentity, createPartnerModule: async input => { created.push(input); return { id: 5 }; } }));
    const response = await request(app).post("/api/admin/partners").send({ partnerName: "Vet.ly", category: "resume_vetting", headline: "Resumes reviewed in 24h", ctaLabel: "Submit resume", ctaUrl: "https://vet.example" });
    expect(response.status).toBe(201);
    expect(created[0]).toMatchObject({ partnerName: "Vet.ly", category: "resume_vetting" });
  });

  it("ends a sponsorship early as an administrator", async () => {
    const app = buildApp(baseDeps({ resolveIdentity: async () => adminIdentity }));
    const response = await request(app).post("/api/admin/opportunities/7/end-sponsorship");
    expect(response.status).toBe(200);
    expect(response.body.sponsorship).toEqual({ opportunityId: 7, ended: true });
  });
});

describe("spend history", () => {
  it("returns the employer's own spend rows", async () => {
    const app = buildApp(baseDeps({ listEmployerSpendHistory: async userId => (userId === 11 ? [{ kind: "profile_unlock", creditsSpent: 5, displayRef: "Talent-0022", createdAt: new Date() }] : []) }));
    const response = await request(app).get("/api/employer/spend-history");
    expect(response.status).toBe(200);
    expect(response.body.spend).toHaveLength(1);
    expect(response.body.spend[0]).toMatchObject({ kind: "profile_unlock", creditsSpent: 5 });
  });
});
