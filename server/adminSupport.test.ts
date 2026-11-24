import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  SANDBOX_ASKS_AVAILABLE, SUPPORT_SIGNAL_WINDOWS, sandboxAskTarget, supportCauseOf, supportRequestStateOf,
  type SupportAccount, type SupportActivityRow, type SupportRequest, type SupportSignalWindowCounts, type SupportWallet,
} from "../shared/adminSupport";
import { buildSupportSignals, buildSupportView, newestFailuresOf, type SupportReaders } from "./adminSupport";
import { registerAdminSupportRoutes, type AdminSupportDeps } from "./adminSupportRoutes";

// ADMIN-support-view (D-393): admin-only, no-store, one person's rows only, plain-words causes, counted
// trouble signals, and every view logged. Fixtures are synthetic; no real account, email or request is used.

const identities: Record<string, { account: { id: number; role: string } }> = {
  admin: { account: { id: 1, role: "admin" } },
  seeker: { account: { id: 2, role: "user" } },
  referrer: { account: { id: 3, role: "user" } },
};

const account = (id: number, over: Partial<SupportAccount> = {}): SupportAccount => ({
  id, email: `person${id}@example.test`, name: `Person ${id}`, role: "user", accountType: "job_seeker", company: null,
  createdAt: "2026-11-01T00:00:00.000Z", suspended: false, canonicalPersonId: 10 + id,
  workEmailVerifiedAt: null, workEmailDomain: null, signInMethods: ["workos"], aliases: [], ...over,
});

const wallet = (over: Partial<SupportWallet> = {}): SupportWallet => ({
  role: "job_seeker", plan: "free", totalAvailable: 2, monthlyCreditsRemaining: 2, purchasedCreditsRemaining: 0,
  promoCreditsRemaining: 0, subscriptionStatus: null, subscriptionCurrentTermEnd: null, cardValidated: false,
  freeCreditsLocked: false, ledger: [{ id: 91, kind: "spend", credits: -1, bucket: "monthly", createdAt: "2026-11-20T10:00:00.000Z" }], ...over,
});

const ask = (id: number, over: Partial<SupportRequest> = {}): SupportRequest => ({
  id, title: `Role ${id}`, companyDomain: "example.test", targetRoleUrl: "https://example.test/jobs/1",
  status: "pending", waitingForCoverage: false, referrerId: null,
  createdAt: "2026-11-20T10:00:00.000Z", updatedAt: "2026-11-21T10:00:00.000Z",
  state: { label: "Privately routed", reason: "It remains private while a verified employee decides whether to claim it." },
  timeline: [{ id: id * 10, action: "created", fromStatus: "none", resultingStatus: "pending", role: "seeker", createdAt: "2026-11-20T10:00:00.000Z" }],
  sandbox: { available: SANDBOX_ASKS_AVAILABLE, companySlug: "example.test", targetRoleUrl: "https://example.test/jobs/1" }, ...over,
});

const activity = (id: number, over: Partial<SupportActivityRow> = {}): SupportActivityRow => ({
  id, action: "auth.password_sign_in", outcome: "failure", metadata: null, createdAt: "2026-11-24T09:00:00.000Z", ...over,
});

/** Readers that answer for exactly one person and record every id they were asked for. */
function readers(personId: number, over: Partial<SupportReaders> = {}) {
  const asked: number[] = [];
  const base: SupportReaders = {
    account: async id => { asked.push(id); return id === personId ? account(personId) : null; },
    wallet: async () => wallet(),
    checkoutIntents: async () => [{ id: 5, kind: "early_to_mid", status: "pending", createdAt: "2026-11-22T10:00:00.000Z" }],
    referrer: async () => null,
    blocks: async () => [{ otherUserId: 77, direction: "blocked_by_them", createdAt: "2026-11-19T10:00:00.000Z" }],
    requests: async () => [ask(41)],
    activity: async () => [activity(501), activity(502, { action: "company_referral.company_cap_reached", outcome: "denied" })],
    signals: async () => ({ signInFailures: [], sendRefusals: [], checkoutRefusals: [], heldRequests: 0, reviewEmailFailures: 0, clientErrors: 0 }),
    ...over,
  };
  return { readers: base, asked };
}

function setup(over: Partial<AdminSupportDeps> = {}, personId = 7) {
  const recorded: Array<{ action: string; resourceId?: string | number; metadata: Record<string, unknown> }> = [];
  const { readers: base, asked } = readers(personId);
  const deps: AdminSupportDeps = {
    resolveIdentity: async req => identities[String(req.header("x-test-user"))],
    readers: base,
    record: input => { recorded.push(input); },
    ...over,
  };
  const app = express();
  registerAdminSupportRoutes(app, deps);
  return { app, recorded, asked };
}

describe("/api/admin/users/:id/support", () => {
  it.each(["seeker", "referrer", "nobody"])("refuses a %s with 403 and no-store", async who => {
    const { app, asked, recorded } = setup();
    for (const path of ["/api/admin/users/7/support", "/api/admin/support/signals"]) {
      const res = await request(app).get(path).set("x-test-user", who);
      expect(res.status).toBe(403);
      expect(res.headers["cache-control"]).toBe("private, no-store");
    }
    expect(asked).toEqual([]);
    expect(recorded).toEqual([]);
  });

  it("rejects a non-numeric id and answers 404 for an account that does not exist", async () => {
    const { app } = setup();
    expect((await request(app).get("/api/admin/users/abc/support").set("x-test-user", "admin")).status).toBe(400);
    expect((await request(app).get("/api/admin/users/0/support").set("x-test-user", "admin")).status).toBe(400);
    expect((await request(app).get("/api/admin/users/8/support").set("x-test-user", "admin")).status).toBe(404);
  });

  it("shows that person's requests, ledger and activity, and asks only for that account", async () => {
    const { app, asked } = setup();
    const res = await request(app).get("/api/admin/users/7/support").set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(asked).toEqual([7]);
    expect(res.body.account.id).toBe(7);
    expect(res.body.requests.map((row: { id: number }) => row.id)).toEqual([41]);
    expect(res.body.wallet.ledger.map((row: { id: number }) => row.id)).toEqual([91]);
    expect(res.body.activity.map((row: { id: number }) => row.id)).toEqual([501, 502]);
    expect(res.body.checkoutIntents.map((row: { id: number }) => row.id)).toEqual([5]);
    expect(res.body.blocks.map((row: { otherUserId: number }) => row.otherUserId)).toEqual([77]);
  });

  it("never returns another person's rows even when a reader over-answers", async () => {
    // A reader that leaks a second person's rows must not be able to widen the page: the assembly is
    // keyed by the one account, and the payload carries no field a second account could occupy.
    const { app } = setup({
      readers: {
        ...readers(7).readers,
        requests: async () => [ask(41), ask(42, { companyDomain: "other.test" })],
      },
    });
    const res = await request(app).get("/api/admin/users/7/support").set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(res.body.account.id).toBe(7);
    expect(res.body.account.email).toBe("person7@example.test");
    expect(JSON.stringify(res.body)).not.toContain("person8@example.test");
  });

  it("logs the view with counts and no personal data", async () => {
    const { app, recorded } = setup();
    await request(app).get("/api/admin/users/7/support").set("x-test-user", "admin");
    expect(recorded).toEqual([expect.objectContaining({
      actorUserId: 1, action: "admin.support_viewed", outcome: "success", resourceType: "user", resourceId: 7,
      metadata: { requests: 1, ledgerRows: 1, activityRows: 2, failures: 2 },
    })]);
    expect(JSON.stringify(recorded)).not.toContain("person7@example.test");
  });

  it("answers a plain 500 when a reader fails, never a driver message", async () => {
    const { app } = setup({ readers: { ...readers(7).readers, wallet: async () => { throw new Error("Failed query: select * from tokenBalances params: 7"); } } });
    const res = await request(app).get("/api/admin/users/7/support").set("x-test-user", "admin");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("We could not load this person's support view");
  });
});

describe("buildSupportView", () => {
  it("puts the newest failures first with their plain-words cause", async () => {
    const { readers: base } = readers(7);
    const view = await buildSupportView(base, 7);
    expect(view?.newestFailures.map(row => row.id)).toEqual([501, 502]);
    expect(view?.newestFailures[1].cause?.cause).toContain("two open referral requests");
  });

  it("returns null for an account that does not exist", async () => {
    const { readers: base } = readers(7);
    expect(await buildSupportView(base, 8)).toBeNull();
  });

  it("keeps a failure it cannot explain, with no invented cause", () => {
    const rows = newestFailuresOf([activity(1, { action: "some.unknown_failure", outcome: "failure" })]);
    expect(rows).toEqual([expect.objectContaining({ action: "some.unknown_failure", cause: null })]);
  });
});

describe("supportCauseOf", () => {
  it.each([
    "company_referral.company_cap_reached",
    "company_referral.slot_cap_reached",
    "company_referral.price_changed",
    "company_referral.blocked_denied",
    "company_referral.block_check_unavailable",
    "company_referral.pinned_work_limit_reached",
    "company_referral.conversation_rate_limited",
    "billing.banded_checkout_refused",
    "billing.credit_checkout_refused",
    "billing.subscription_checkout_refused",
    "payment.review_refused",
    "work_email.step_up_denied",
    "auth.password_sign_in",
    "auth.social_sign_in",
    "auth.work_email_code_verified",
    "auth.passkey_sign_in",
    "auth.reviewer_sign_in",
  ])("states a cause and a fix for %s", action => {
    const cause = supportCauseOf(action, "denied");
    expect(cause).not.toBeNull();
    expect(cause?.cause.length).toBeGreaterThan(10);
    expect(cause?.fix.length).toBeGreaterThan(10);
  });

  it("explains nothing for a success", () => {
    expect(supportCauseOf("company_referral.company_cap_reached", "success")).toBeNull();
  });
});

describe("supportRequestStateOf", () => {
  it("says why a request waits, is held, or is with a referrer", () => {
    expect(supportRequestStateOf({ status: "pending", waitingForCoverage: true, referrerId: null }).label).toBe("Waiting");
    expect(supportRequestStateOf({ status: "pending", waitingForCoverage: true, coverageHeldAt: "2026-11-20T00:00:00.000Z", referrerId: null }).label).toBe("Held");
    expect(supportRequestStateOf({ status: "pending", waitingForCoverage: false, referrerId: 9 }).label).toBe("Under review");
    expect(supportRequestStateOf({ status: "withdrawn", waitingForCoverage: false, referrerId: null }).label).toBe("Withdrawn");
  });

  it("shows an unknown stored status as it is rather than inventing a reason", () => {
    expect(supportRequestStateOf({ status: "mystery_state", waitingForCoverage: false, referrerId: null })).toEqual({ label: "mystery state", reason: "No plain-words reason is recorded for this state." });
  });
});

describe("sandboxAskTarget", () => {
  it("stays off until QA-sandbox-requests lands, so no demo send can reach a real company", () => {
    expect(SANDBOX_ASKS_AVAILABLE).toBe(false);
    expect(sandboxAskTarget({ companySlug: "example.test", targetRoleUrl: "https://example.test/jobs/1" })).toEqual({ available: false, companySlug: "example.test", targetRoleUrl: "https://example.test/jobs/1" });
    expect(sandboxAskTarget({ companySlug: null, targetRoleUrl: null }).available).toBe(false);
  });
});

describe("/api/admin/support/signals", () => {
  const counts = (over: Partial<SupportSignalWindowCounts> = {}): SupportSignalWindowCounts => ({
    signInFailures: [{ reason: "bad_password", count: 4 }], sendRefusals: [{ reason: "company_cap_reached", count: 2 }],
    checkoutRefusals: [{ reason: "not_on_sale", count: 1 }], heldRequests: 3, reviewEmailFailures: 1, clientErrors: 0, ...over,
  });

  it("counts both windows from the injected readers and logs the view", async () => {
    const seen: Array<{ window: string; since: Date }> = [];
    const { app, recorded } = setup({
      readers: { ...readers(7).readers, signals: async (window, since) => { seen.push({ window, since }); return counts(); } },
    });
    const res = await request(app).get("/api/admin/support/signals").set("x-test-user", "admin");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(seen.map(entry => entry.window)).toEqual([...SUPPORT_SIGNAL_WINDOWS]);
    expect(res.body.windows["24h"].signInFailures).toEqual([{ reason: "bad_password", count: 4 }]);
    expect(res.body.windows["7d"].heldRequests).toBe(3);
    expect(recorded).toEqual([expect.objectContaining({ action: "admin.support_signals_viewed", resourceType: "support_signals" })]);
  });

  it("puts each window's start the right distance back", async () => {
    const nowMs = Date.parse("2026-11-24T12:00:00.000Z");
    const seen: Array<{ window: string; since: Date }> = [];
    await buildSupportSignals({ signals: async (window, since) => { seen.push({ window, since }); return counts(); } }, nowMs);
    expect(seen).toEqual([
      { window: "24h", since: new Date(nowMs - 24 * 3_600_000) },
      { window: "7d", since: new Date(nowMs - 168 * 3_600_000) },
    ]);
  });
});
