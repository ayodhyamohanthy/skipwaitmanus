import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Queue Open Alerts allocation contract", () => {
  it("uses one transaction to allocate only the oldest held exact-company request and records a unique active allocation", () => {
    const source = projectFile("server/db.ts");
    expect(source).toContain("export async function openCompanyReferralAvailability");
    expect(source).toContain("return db.transaction(async tx =>");
    expect(source).toContain("eq(jobs.company, companyDomain)");
    expect(source).toContain("eq(referralRequests.waitingForCoverage, true)");
    expect(source).toContain("orderBy(asc(referralRequests.coverageQueuedAt), asc(referralRequests.id))");
    expect(source).toContain("isNull(referralRequests.referrerId)");
    expect(source).toContain("activeRequestKey: `request:${candidate[0].id}`");
  });

  it("sends only a factual private candidate alert and never includes a Referrer identity", () => {
    const source = projectFile("server/db.ts");
    expect(source).toContain('title: "A referral review opened"');
    expect(source).toContain("A verified employee at ${companyDomain} can now review your request.");
    expect(source).not.toContain("body: `A verified employee ${profile");
    expect(source).not.toContain("body: `Your Referrer");
  });

  it("keeps capacity opening server-side, limits it to one through three real slots, and exposes only an allocated Referrer’s inbox item", () => {
    const routes = projectFile("server/privateReferralRoutes.ts");
    const helpers = projectFile("server/db.ts");
    expect(routes).toContain('app.post("/api/company-referrals/availability/open"');
    expect(routes).toContain("requestedSlotCount < 1 || requestedSlotCount > 3");
    expect(helpers).toContain("const isQueueAllocationForYou = row.queueAllocationId !== null && row.referrerId === userId");
    expect(helpers).toContain("queueStatus: row.referrerId && row.status === \"pending\" ? \"available_for_review\"");
  });

  it("preserves original eligible hold order and excludes invitation-driven position jumps or referral-rank rewards", () => {
    const source = projectFile("server/db.ts");
    const allocationStart = source.indexOf("export async function openCompanyReferralAvailability");
    const allocationEnd = source.indexOf("export async function getReferralFlowHealth", allocationStart);
    const allocation = source.slice(allocationStart, allocationEnd);
    const specification = projectFile("docs/queue-open-alerts-spec.md");
    expect(allocation).toContain("orderBy(asc(referralRequests.coverageQueuedAt), asc(referralRequests.id))");
    expect(allocation).not.toContain("personalReferralInvite");
    expect(allocation).not.toContain("personalReferralReward");
    expect(allocation).not.toContain("position");
    expect(allocation).not.toContain("rank");
    expect(specification).toMatch(/must \*\*not\*\* implement position jumping/i);
    expect(specification).toMatch(/hidden queue rank/i);
  });
});
