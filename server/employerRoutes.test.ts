import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerEmployerRoutes, type EmployerRouteDeps } from "./employerRoutes";
import { PARTNER_CLICK_LIMIT_PER_WINDOW, PARTNER_IMPRESSION_LIMIT_PER_WINDOW, TELEMETRY_WINDOW_MS } from "./partnerContracts";

type Call = { name: string; args: unknown[] };

function buildApp(overrides: Partial<EmployerRouteDeps> & { employers?: number[]; admins?: number[]; unlocked?: boolean } = {}) {
  const calls: Call[] = [];
  const employers = new Set(overrides.employers ?? [11]);
  const admins = new Set(overrides.admins ?? [77]);
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); return Promise.resolve(undefined); };
  const deps: EmployerRouteDeps = {
    resolveIdentity: async req => {
      const id = Number(req.header("x-test-user"));
      if (!Number.isInteger(id) || id <= 0) return undefined;
      return { account: { id, openId: `workos-${id}`, role: admins.has(id) ? "admin" : "user" }, primaryEmail: { emailAddress: `user${id}@acme.com` } };
    },
    recordActivity: record("activity"),
    isEmployer: async userId => { calls.push({ name: "isEmployer", args: [userId] }); return employers.has(userId); },
    ensureEmployerAccount: async (userId, companyName, billingEmail) => { calls.push({ name: "ensureEmployerAccount", args: [userId, companyName, billingEmail] }); return { userId }; },
    getEmployerAccount: async userId => { calls.push({ name: "getEmployerAccount", args: [userId] }); return { userId, credits: 3 }; },
    listAnonymizedSeekerProfiles: async (employerUserId, input) => { calls.push({ name: "listAnonymizedSeekerProfiles", args: [employerUserId, input] }); return [{ displayRef: "Ref-1001" }]; },
    resolveEmployerTalentRef: async (employerUserId, displayRef) => { calls.push({ name: "resolveEmployerTalentRef", args: [employerUserId, displayRef] }); return displayRef === "Ref-1001" ? 41 : undefined; },
    spendEmployerUnlockCredit: async (employerUserId, seekerUserId) => { calls.push({ name: "spendEmployerUnlockCredit", args: [employerUserId, seekerUserId] }); return { ok: true, remaining: 2, credits: 2 }; },
    getUnlockedProfile: async (employerUserId, seekerUserId) => { calls.push({ name: "getUnlockedProfile", args: [employerUserId, seekerUserId] }); return overrides.unlocked === false ? null : { id: seekerUserId, name: "Seeker" }; },
    requestEmployerTalentIntro: async (employerUserId, seekerUserId) => { calls.push({ name: "requestEmployerTalentIntro", args: [employerUserId, seekerUserId] }); return { ok: true, created: true }; },
    createNotification: record("createNotification"),
    sponsorCompanyOpportunity: async (userId, opportunityId, input) => { calls.push({ name: "sponsorCompanyOpportunity", args: [userId, opportunityId, input] }); return { id: 5, replayed: input.tier === "spotlight" }; },
    endCompanyOpportunitySponsorship: async (adminUserId, opportunityId) => { calls.push({ name: "endCompanyOpportunitySponsorship", args: [adminUserId, opportunityId] }); return { id: opportunityId, status: "ended" }; },
    listSponsoredCompanyOpportunities: async () => { calls.push({ name: "listSponsoredCompanyOpportunities", args: [] }); return []; },
    listEmployerOpportunities: async userId => { calls.push({ name: "listEmployerOpportunities", args: [userId] }); return []; },
    listPartnerModules: async input => { calls.push({ name: "listPartnerModules", args: [input] }); return [{ id: 3 }, { id: 4 }]; },
    recordPartnerImpression: record("recordPartnerImpression"),
    recordPartnerClick: async moduleId => { calls.push({ name: "recordPartnerClick", args: [moduleId] }); return { recorded: moduleId === 3 }; },
    createPartnerModule: record("createPartnerModule"),
    updatePartnerModule: async (moduleId, patch) => { calls.push({ name: "updatePartnerModule", args: [moduleId, patch] }); return { id: moduleId }; },
    listAllPartnerModules: async () => { calls.push({ name: "listAllPartnerModules", args: [] }); return [{ id: 3 }]; },
    listEmployerSpendHistory: async userId => { calls.push({ name: "listEmployerSpendHistory", args: [userId] }); return []; },
    createRazorpayUnlockOrder: async input => { calls.push({ name: "createRazorpayUnlockOrder", args: [input] }); return { id: "order_1", amount: input.amountInPaise, currency: "INR" }; },
    prepareUnlockCreditCheckout: async input => { calls.push({ name: "prepareUnlockCreditCheckout", args: [input] }); return { id: 9, providerReceipt: `rcpt_${input.checkoutKey}`, status: "open", amount: input.amount, currency: input.currency, pack: input.pack, action: "create" }; },
    bindUnlockCreditProviderOrder: record("bindUnlockCreditProviderOrder"),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerEmployerRoutes(app, deps);
  return { app, calls };
}

const EMPLOYER_ROUTES: Array<[string, string, unknown?]> = [
  ["get", "/api/employer/talent"],
  ["get", "/api/employer/talent/Ref-1001"],
  ["post", "/api/employer/talent/Ref-1001/unlock"],
  ["post", "/api/employer/talent/Ref-1001/intro"],
  ["get", "/api/employer/opportunities"],
  ["get", "/api/employer/spend-history"],
  ["post", "/api/employer/unlock-credits/purchase", { pack: "starter" }],
  ["post", "/api/employer/opportunities/12/sponsor", { tier: "featured" }],
];
const ADMIN_ROUTES: Array<[string, string, unknown?]> = [
  ["get", "/api/admin/partners"],
  ["get", "/api/admin/sponsorships"],
  ["post", "/api/admin/partners", { partnerName: "Prep", category: "interview_prep", headline: "Get ready", ctaLabel: "Open", ctaUrl: "https://prep.example" }],
  ["patch", "/api/admin/partners/3", { headline: "Sharpen up" }],
  ["post", "/api/admin/opportunities/12/end-sponsorship"],
];
// Employer onboarding has to stay reachable before accountType flips to
// "employer", so these routes gate on identity alone.
const IDENTITY_ROUTES: Array<[string, string, unknown?]> = [
  ["get", "/api/employer/account"],
  ["post", "/api/employer/account", { companyName: "Acme" }],
];

describe("employer REST authorization", () => {
  it("refuses every employer and admin route without a session", async () => {
    for (const [method, path, body] of [...EMPLOYER_ROUTES, ...ADMIN_ROUTES, ...IDENTITY_ROUTES]) {
      const { app, calls } = buildApp();
      const response = await request(app)[method](path).send(body);
      expect(`${method} ${path} -> ${response.status}`).toBe(`${method} ${path} -> 401`);
      expect(calls.filter(call => call.name !== "activity")).toEqual([]);
    }
  });

  it("keeps a signed-in non-employer out of the talent, credit, and sponsorship surface", async () => {
    for (const [method, path, body] of EMPLOYER_ROUTES) {
      const { app, calls } = buildApp({ employers: [] });
      const response = await request(app)[method](path).set("x-test-user", "11").send(body);
      expect(`${method} ${path} -> ${response.status}`).toBe(`${method} ${path} -> 403`);
      expect(calls.some(call => call.name === "isEmployer")).toBe(true);
      expect(calls.map(call => call.name)).not.toContain("spendEmployerUnlockCredit");
    }
  });

  it("keeps an employer out of admin inventory and an administrator without an employer account out of the talent pool", async () => {
    const asEmployer = await request(buildApp({ employers: [11] }).app).get("/api/admin/partners").set("x-test-user", "11");
    expect(asEmployer.status).toBe(403);
    expect(asEmployer.body.error).toMatch(/administrator/i);
    const asAdmin = await request(buildApp({ employers: [], admins: [77] }).app).get("/api/employer/talent").set("x-test-user", "77");
    expect(asAdmin.status).toBe(403);
  });

  it("lets an administrator manage partner inventory without an employer account", async () => {
    const { app, calls } = buildApp({ employers: [], admins: [77] });
    const response = await request(app).post("/api/admin/partners").set("x-test-user", "77").send({ partnerName: "Prep", category: "interview_prep", headline: "Get ready", ctaLabel: "Open", ctaUrl: "https://prep.example" });
    expect(response.status).toBe(201);
    expect(calls.map(call => call.name)).toContain("createPartnerModule");
  });

  it("opens an employer account only for the verified sign-in email", async () => {
    const { app, calls } = buildApp({ employers: [] });
    const onboarding = await request(app).get("/api/employer/account").set("x-test-user", "11");
    expect(onboarding.status).toBe(200);
    const hijacked = await request(app).post("/api/employer/account").set("x-test-user", "11").send({ companyName: "Acme", billingEmail: "invoices@other-corp.com" });
    expect(hijacked.status).toBe(400);
    expect(calls.map(call => call.name)).not.toContain("ensureEmployerAccount");
    const created = await request(app).post("/api/employer/account").set("x-test-user", "11").send({ companyName: "Acme", billingEmail: "user11@acme.com" });
    expect(created.status).toBe(201);
    expect(calls.find(call => call.name === "ensureEmployerAccount")?.args).toEqual([11, "Acme", "user11@acme.com"]);
  });
});

describe("employer REST tenant scoping and money contracts", () => {
  it("resolves a talent reference inside the caller's employer scope only", async () => {
    const { app, calls } = buildApp();
    const unknown = await request(app).get("/api/employer/talent/Ref-9999").set("x-test-user", "11");
    expect(unknown.status).toBe(404);
    expect(calls.find(call => call.name === "resolveEmployerTalentRef")?.args).toEqual([11, "Ref-9999"]);
    expect(calls.map(call => call.name)).not.toContain("getUnlockedProfile");
  });

  it("never returns an identity that has not been paid for", async () => {
    const { app } = buildApp({ unlocked: false });
    const response = await request(app).get("/api/employer/talent/Ref-1001").set("x-test-user", "11");
    expect(response.status).toBe(402);
    expect(JSON.stringify(response.body)).not.toContain("Seeker");
  });

  it("spends one credit per unlock and notifies the seeker, not the caller", async () => {
    const { app, calls } = buildApp();
    const response = await request(app).post("/api/employer/talent/Ref-1001/unlock").set("x-test-user", "11");
    expect(response.status).toBe(201);
    expect(calls.find(call => call.name === "spendEmployerUnlockCredit")?.args).toEqual([11, 41]);
    const notification = calls.find(call => call.name === "createNotification")?.args;
    expect(notification?.[0]).toBe(41);
    expect(typeof notification?.[3]).toBe("string");
  });

  it("refuses to start a credit or sponsorship checkout twice without the same idempotency key", async () => {
    const credits = await request(buildApp().app).post("/api/employer/unlock-credits/purchase").set("x-test-user", "11").send({ pack: "starter" });
    expect(credits.status).toBe(428);
    const sponsor = await request(buildApp().app).post("/api/employer/opportunities/12/sponsor").set("x-test-user", "11").send({ tier: "featured" });
    expect(sponsor.status).toBe(428);
    const badPack = await request(buildApp().app).post("/api/employer/unlock-credits/purchase").set("x-test-user", "11").set("Idempotency-Key", "unlock-key-00000001").send({ pack: "enterprise" });
    expect(badPack.status).toBe(400);
  });

  it("prices the pack in paise and binds the provider order to the caller", async () => {
    const { app, calls } = buildApp();
    const response = await request(app).post("/api/employer/unlock-credits/purchase").set("x-test-user", "11").set("Idempotency-Key", "unlock-key-00000001").send({ pack: "growth" });
    expect(response.status).toBe(200);
    const order = calls.find(call => call.name === "createRazorpayUnlockOrder")?.args[0] as { amountInPaise: number; notes: Record<string, string> };
    expect(order.amountInPaise).toBeGreaterThan(0);
    expect(order.notes.userId).toBe("11");
    expect(order.notes.kind).toBe("unlock_credits");
    expect(response.body.amount).toBe(order.amountInPaise);
    expect(response.body.currency).toBe("INR");
  });

  it("replays a sponsorship rather than charging twice", async () => {
    const { app } = buildApp();
    const first = await request(app).post("/api/employer/opportunities/12/sponsor").set("x-test-user", "11").set("Idempotency-Key", "sponsor-key-0000001").send({ tier: "featured" });
    const replay = await request(app).post("/api/employer/opportunities/12/sponsor").set("x-test-user", "11").set("Idempotency-Key", "sponsor-key-0000002").send({ tier: "spotlight" });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
  });
});

describe("admin partner module writes", () => {
  const validCreate = { partnerName: "Prep", category: "interview_prep", headline: "Get ready", ctaLabel: "Open", ctaUrl: "https://prep.example" };

  it("forwards only the fields the edit surface owns", async () => {
    const { app, calls } = buildApp({ employers: [], admins: [77] });
    const response = await request(app).patch("/api/admin/partners/3").set("x-test-user", "77").send({ isActive: false, description: null });
    expect(response.status).toBe(200);
    expect(calls.find(call => call.name === "updatePartnerModule")?.args).toEqual([3, { isActive: false, description: null }]);
  });

  it("refuses a patch that names a column nobody may set, and writes nothing", async () => {
    const { app, calls } = buildApp({ employers: [], admins: [77] });
    const response = await request(app).patch("/api/admin/partners/3").set("x-test-user", "77").send({ headline: "Sharpen up", impressions: 999_999 });
    expect(response.status).toBe(400);
    expect(calls.map(call => call.name)).not.toContain("updatePartnerModule");
  });

  it("keeps a script URL out of the CTA both when creating and when editing", async () => {
    const { app, calls } = buildApp({ employers: [], admins: [77] });
    const created = await request(app).post("/api/admin/partners").set("x-test-user", "77").send({ ...validCreate, ctaUrl: "javascript:alert(document.cookie)" });
    const patched = await request(app).patch("/api/admin/partners/3").set("x-test-user", "77").send({ ctaUrl: "javascript:alert(document.cookie)" });
    expect([created.status, patched.status]).toEqual([400, 400]);
    expect(calls.map(call => call.name)).not.toContain("createPartnerModule");
    expect(calls.map(call => call.name)).not.toContain("updatePartnerModule");
  });
});

describe("public partner module surface", () => {
  it("records one impression per returned module and passes role keywords, not raw text", async () => {
    const { app, calls } = buildApp();
    const response = await request(app).get("/api/partners?role=Senior%20Backend%20Engineer&category=interview_prep");
    expect(response.status).toBe(200);
    expect(calls.filter(call => call.name === "recordPartnerImpression").map(call => call.args[0])).toEqual([3, 4]);
    const listed = calls.find(call => call.name === "listPartnerModules")?.args[0] as { roleKeywords: string[]; category: string; limit: number };
    expect(listed.roleKeywords).toEqual(["senior", "backend", "engineer"]);
    expect(listed.category).toBe("interview_prep");
    expect(listed.limit).toBe(3);
  });

  it("ignores an unknown category instead of trusting the query", async () => {
    const { app, calls } = buildApp();
    await request(app).get("/api/partners?category=sponsored%20spam");
    expect(calls.find(call => call.name === "listPartnerModules")?.args[0]).toMatchObject({ category: undefined });
  });

  it("404s a click the module table rejected and never accepts a non-numeric reference", async () => {
    const { app, calls } = buildApp();
    const missing = await request(app).post("/api/partners/99/click");
    expect(missing.status).toBe(404);
    const invalid = await request(app).post("/api/partners/not-a-number/click");
    expect(invalid.status).toBe(400);
    expect(calls.filter(call => call.name === "recordPartnerClick").map(call => call.args[0])).toEqual([99]);
  });

  it("budgets anonymous click telemetry per client IP and resets in the next window", async () => {
    let clock = 1_700_000_000_000;
    const { app, calls } = buildApp({ telemetryNow: () => clock });
    const statuses: number[] = [];
    for (let index = 0; index <= PARTNER_CLICK_LIMIT_PER_WINDOW; index += 1) statuses.push((await request(app).post("/api/partners/3/click")).status);
    expect(statuses.slice(0, PARTNER_CLICK_LIMIT_PER_WINDOW).every(status => status === 200)).toBe(true);
    expect(statuses[statuses.length - 1]).toBe(429);
    expect(calls.filter(call => call.name === "recordPartnerClick")).toHaveLength(PARTNER_CLICK_LIMIT_PER_WINDOW);
    clock += TELEMETRY_WINDOW_MS;
    expect((await request(app).post("/api/partners/3/click")).status).toBe(200);
  });

  it("keeps serving partner slots once the impression budget is spent, without recording them", async () => {
    let clock = 1_700_000_000_000;
    const { app, calls } = buildApp({ telemetryNow: () => clock });
    for (let index = 0; index < PARTNER_IMPRESSION_LIMIT_PER_WINDOW; index += 1) await request(app).get("/api/partners");
    const written = () => calls.filter(call => call.name === "recordPartnerImpression").length;
    expect(written()).toBe(PARTNER_IMPRESSION_LIMIT_PER_WINDOW * 2);
    clock += 1_000;
    const response = await request(app).get("/api/partners");
    expect(response.status).toBe(200);
    expect(response.body.modules).toHaveLength(2);
    expect(response.headers["retry-after"]).toBe(String(TELEMETRY_WINDOW_MS / 1000));
    expect(written()).toBe(PARTNER_IMPRESSION_LIMIT_PER_WINDOW * 2);
  });
});
