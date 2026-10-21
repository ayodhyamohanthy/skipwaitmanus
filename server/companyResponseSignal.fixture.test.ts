// Fixture for the QA contract: jobs.company holds the company DOMAIN, joined
// against the company's owned domains. A job whose company column carries the
// company NAME instead of the domain must not count toward the signal.
import { describe, expect, it } from "vitest";
import { jobs, profiles, referralRequests, referralTransitionEvents, type Row } from "../drizzle/schema";
import { createInMemoryDrizzle } from "./inMemoryDrizzle.testkit";
import { loadCompanyResponseSignal } from "./companyResponseSignal";

const NOW = new Date("2026-10-21T09:00:00Z");
const referrer = (userId: number, domain: string): Row => ({ id: userId, userId, accountType: "referrer", workEmailDomain: domain, workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") });
const job = (id: number, company: string): Row => ({ id, title: "Engineer", company, location: null, compensation: null, seniority: null, description: null, targetRoleUrl: null, jobFunction: "engineering", createdAt: new Date("2026-10-01T00:00:00Z") });
const ask = (id: number, jobId: number): Row => ({ id, jobId, jobSeekerId: 900, status: "approved", createdAt: new Date("2026-10-02T00:00:00Z"), coverageVisibleAt: new Date("2026-10-02T01:00:00Z") });
const decision = (id: number, requestId: number, hours: number): Row => ({ id, referralRequestId: requestId, operationKey: `approve:${requestId}`, actorUserId: 1, action: "approve", fromStatus: "pending", resultingStatus: "approved", resultingRevision: 1, referenceId: null, createdAt: new Date(Date.UTC(2026, 9, 2, 1 + hours)) });

function seed() {
  const store = createInMemoryDrizzle();
  store.reset([
    [profiles, [referrer(1, "quillmint.com"), referrer(2, "quillmint.com"), referrer(3, "quillmint.com")]],
    [jobs, [job(10, "quillmint.com"), job(11, "quillmint.com"), job(12, "quillmint.com"), job(13, "Quillmint")]],
    [referralRequests, [ask(100, 10), ask(101, 11), ask(102, 12), ask(103, 13)]],
    [referralTransitionEvents, [decision(1000, 100, 24), decision(1001, 101, 48), decision(1002, 102, 72), decision(1003, 103, 1)]],
  ]);
  return store;
}

// D-035 records a not-fixable pass as `pass_release`; it is still the referrer
// answering, so it must count exactly like an approve or a legacy pass.
const pendingAsk = (id: number, jobId: number): Row => ({ ...ask(id, jobId), status: "pending" });
const passRelease = (id: number, requestId: number, hours: number): Row => ({ id, referralRequestId: requestId, operationKey: `pass:${requestId}`, actorUserId: 1, action: "pass_release", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, referenceId: null, createdAt: new Date(Date.UTC(2026, 9, 2, 1 + hours)) });

describe("D-035: a not-fixable pass is still a first decision", () => {
  it("asks decided only by pass_release count like any pass", async () => {
    const store = createInMemoryDrizzle();
    store.reset([
      [profiles, [referrer(1, "quillmint.com"), referrer(2, "quillmint.com"), referrer(3, "quillmint.com")]],
      [jobs, [job(10, "quillmint.com"), job(11, "quillmint.com"), job(12, "quillmint.com")]],
      [referralRequests, [pendingAsk(100, 10), pendingAsk(101, 11), pendingAsk(102, 12)]],
      [referralTransitionEvents, [passRelease(1000, 100, 24), passRelease(1001, 101, 48), passRelease(1002, 102, 72)]],
    ]);
    const signal = await loadCompanyResponseSignal(["quillmint.com"], NOW, store.db);
    expect(signal.state).toBe("shown");
    if (signal.state !== "shown") return;
    expect(signal.answeredThisMonth).toBe(3);
    expect(signal.usualFirstReplyDays).toBe(2);
    expect(signal.referrersInside).toBe(3);
  });
});

describe("jobs.company <-> companyDomains fixture (QA)", () => {
  it("only jobs whose company column is the owned domain count", async () => {
    const store = seed();
    const signal = await loadCompanyResponseSignal(["quillmint.com"], NOW, store.db);
    expect(signal.state).toBe("shown");
    if (signal.state !== "shown") return;
    // Three domain-matching asks answered; the name-matching job (13) is invisible.
    expect(signal.answeredThisMonth).toBe(3);
    expect(signal.referrersInside).toBe(3);
    expect(signal.usualFirstReplyDays).toBe(2);
  });
  it("a name-only job company value counts nothing", async () => {
    const store = seed();
    const signal = await loadCompanyResponseSignal(["Quillmint"], NOW, store.db);
    expect(signal.state).toBe("insufficient");
  });
});
