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

// D-035: a not-fixable pass is recorded as pass_release. It is still the company answering the ask, so
// the signal must count it; otherwise a company whose employees pass for reasons the seeker cannot fix
// looks like nobody there ever responds.
describe("D-035: a not-fixable pass is the company's answer", () => {
  it("counts pass_release as a first decision", async () => {
    const store = createInMemoryDrizzle();
    store.reset([
      [profiles, [referrer(1, "quillmint.com"), referrer(2, "quillmint.com"), referrer(3, "quillmint.com")]],
      [jobs, [job(10, "quillmint.com"), job(11, "quillmint.com"), job(12, "quillmint.com")]],
      [referralRequests, [ask(100, 10), ask(101, 11), ask(102, 12)]],
      [referralTransitionEvents, [
        { ...decision(1000, 100, 24), action: "pass_release", operationKey: "one-click:1:declined:role_not_a_fit" },
        { ...decision(1001, 101, 48), action: "pass_release", operationKey: "one-click:1:declined:role_closed" },
        { ...decision(1002, 102, 72), action: "pass_release", operationKey: "one-click:1:declined:at_capacity" },
      ]],
    ]);
    const signal = await loadCompanyResponseSignal(["quillmint.com"], NOW, store.db);
    expect(signal.state).toBe("shown");
    if (signal.state !== "shown") return;
    expect(signal.answeredThisMonth).toBe(3);
    expect(signal.usualFirstReplyDays).toBe(2);
  });
});
