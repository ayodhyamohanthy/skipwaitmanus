import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { claimCompanyReferralRequest } from "./db";
import { LINK_OWNER, REQUEST_ID, askRow, seedHeldAsks, store } from "./heldAsk.testkit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const s=readFileSync(new URL("./db.ts",import.meta.url),"utf8"),f=s.slice(s.indexOf("export async function claimCompanyReferralRequest"),s.indexOf("export async function referralWasClaimedTx"));
// The claim mechanism moved to the shared transition primitive (revision CAS +
// per-user operation keys); these guards pin the claim-specific load-bearing
// elements of the current shape. Transition mechanics themselves are covered
// behaviorally in referralTransitionIntegrity.test.ts.
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  seedHeldAsks({ asks: [askRow({ referrerId: null, revision: 0, createdAt: new Date(), updatedAt: new Date() })] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("atomic referral claim",()=>{
 it("locks, checks pass, CAS assigns and emits inside one transaction",()=>{expect(f).toContain("db.transaction");expect(f).toContain('.for("update")');expect(f).toContain("referralRequestPasses");expect(f).toContain("Another verified employee already claimed this request");expect(f).toContain("operationKey: `claim:${userId}`");expect(f).toContain("patch: { referrerId: userId }");expect(f).toContain("Your referral request was claimed");});
 it("replay returns the canonical shape and one deterministic event, and a claim writes no document grant (D-019(e))",()=>{expect(f).not.toContain("return { requestId, claimed: true }");expect(f).toContain("replayed: result.replayed");expect(f).not.toContain("referralDocumentAccessGrants");expect(f).toContain("jobSeekerId: current.request.jobSeekerId");expect(f).toContain("companyDomain: current.company");expect(f).toContain("operationKey: `claim:${userId}`");});
 it("the 5-claim cap is one bounded aggregate read and a replay skips it (D-038-reconcile R-4/R-6)",()=>{
  const cap=f.slice(f.indexOf("D-038-A (§4.7)"),f.indexOf("const result = await transitionReferralRequestTx"));
  // One lock, on the claimant's own profiles row; one non-locking count over their own asks.
  expect(cap.match(/\.for\("update"\)/g)).toHaveLength(1);
  expect(cap).toContain("profiles");expect(cap).toContain("count()");expect(cap).toContain("actorUserId");
  // No per-request locking read and no loop over assigned asks: the count never locks another person's rows.
  expect(cap).not.toContain("referralWasClaimedTx");expect(cap).not.toContain("for (const assignedRow");
  // R-6: a claimant repeating "I'm on it" on an ask they already hold never meets the cap.
  expect(f).toContain("current.request.referrerId !== userId");
 });
 // D-038-reconcile A-1: MySQL defaults to REPEATABLE READ, where the plain read of the claimant's
 // pass at the top of the transaction fixes its snapshot; the count after the profiles lock would then
 // reuse that snapshot and miss a concurrent claim that committed while this one waited. READ COMMITTED
 // makes the count a current read without locking the claimant's ask rows (R-4). The kit runs
 // transactions serially and models no snapshots, so the interleaving itself cannot run here; this pins
 // the isolation level the guarantee rests on.
 it("opens the claim transaction at READ COMMITTED so the cap count sees a concurrent claim (A-1)",async()=>{
  const transaction=vi.spyOn(store.db,"transaction");
  await claimCompanyReferralRequest(LINK_OWNER,REQUEST_ID);
  expect(transaction.mock.calls).toHaveLength(1);
  expect(transaction.mock.calls[0]?.slice(1)).toEqual([{ isolationLevel: "read committed" }]);
 });
});
