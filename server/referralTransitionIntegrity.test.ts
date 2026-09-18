import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./privateReferralRoutes.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");
function fn(start: string, end: string) { return db.slice(db.indexOf(start), db.indexOf(end, db.indexOf(start))); }

describe("referral transition integrity", () => {
  it("uses revision CAS and a deterministic in-transaction event + notification", () => {
    const transition = fn("async function transitionReferralRequestTx", "export async function reviewReferralRequest");
    expect(schema).toContain('revision: int("revision").default(0).notNull()');
    expect(transition).toContain("eq(referralRequests.revision, current.revision)");
    expect(transition).toContain("referralTransitionEvents");
    expect(transition).toContain("eventKey: `referral:${input.requestId}:v${nextRevision}:${input.toStatus}`");
    expect(transition.indexOf("tx.update(referralRequests)")).toBeLessThan(transition.indexOf("tx.insert(referralTransitionEvents)"));
    expect(transition.indexOf("tx.insert(referralTransitionEvents)")).toBeLessThan(transition.indexOf("tx.insert(notifications)"));
  });

  it("routes review, one-click, email-link, withdraw, claim and progress through one primitive", () => {
    for (const [start,end] of [
      ["export async function oneClickReviewReferralRequest", "export async function consumeReferrerReviewEmailLink"],
      ["export async function withdrawCompanyReferralRequest", "export async function listJobSeekerCompanyReferrals"],
      ["export async function claimCompanyReferralRequest", "export async function getClaimedCompanyReferralDetail"],
      ["export async function reviewReferralRequest", "export function authorizeApprovedReferralConversation"],
      ["export async function updateReferralProgress", "async function getApprovedReferralConversationParticipants"],
    ]) expect(fn(start,end)).toContain("transitionReferralRequestTx");
    expect(routes).toContain("reviewLinkToken: linkToken");
    expect(fn("export async function oneClickReviewReferralRequest", "export async function consumeReferrerReviewEmailLink")).toContain("input.reviewLinkToken");
  });

  it("makes exact retries replay and stale or conflicting work return current state", () => {
    const transition = fn("async function transitionReferralRequestTx", "export async function reviewReferralRequest");
    expect(transition).toContain("replayed: true");
    expect(transition).toContain("ReferralTransitionConflict");
    expect(routes).toContain("currentState");
  });

  it("keeps progress monotonic and prevents duplicate route in-app notifications", () => {
    const progress = fn("export async function updateReferralProgress", "async function getApprovedReferralConversationParticipants");
    expect(progress).toContain("nextIndex <= currentIndex");
    expect(progress).toContain('existing.status === "closed"');
    expect(routes).toContain("result.revision === undefined");
  });
});
