// REL-review-email-retry: real MySQL cap and owner-alert recovery, no provider calls.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { jobs, referralRequests, referralReviewDeliveries, referrerReviewEmailLinks, users } from "../drizzle/schema";
import { expect, test } from "./fixtures";

const target = new URL(process.env.E2E_DATABASE_URL || "mysql://root:e2e@127.0.0.1:3306/skipwait");
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.pathname !== "/skipwait") throw new Error("Review retry verification requires the local e2e database");
process.env.DATABASE_URL = target.href;

test("review email attempt cap and owner-alert leases survive competing MySQL workers", async () => {
  const { claimReferralReviewDelivery, completeReferralReviewDelivery, getDb } = await import("../server/db");
  const { deliverReviewOwnerAlerts, REVIEW_DELIVERY_ALERT_LEASE_MS } = await import("../server/reviewDeliveryAlerts");
  const db = await getDb();
  if (!db) throw new Error("Local e2e MySQL is unavailable");
  const suffix = randomUUID();
  const userIds: number[] = [];
  let jobId: number | undefined;
  try {
    for (const kind of ["seeker", "referrer"]) {
      const result = await db.insert(users).values({ openId: `retry-${kind}-${suffix}`, email: `${kind}.${suffix}@example.invalid`, name: `Retry ${kind}`, loginMethod: "test_seed" });
      userIds.push(Number(result[0].insertId));
    }
    const seekerId = userIds[0];
    const referrerId = userIds[1];
    if (!seekerId || !referrerId) throw new Error("Synthetic retry accounts were not created");
    const job = await db.insert(jobs).values({ title: "Retry concurrency fixture", company: "example.invalid", location: "Remote", seniority: "Mid", employmentType: "Full time", workMode: "Remote", description: "Synthetic email retry verification" });
    jobId = Number(job[0].insertId);
    const request = await db.insert(referralRequests).values({ jobId, jobSeekerId: seekerId, personalPitch: "Synthetic retry verification" });
    const requestId = Number(request[0].insertId);
    await db.insert(referrerReviewEmailLinks).values({ referralRequestId: requestId, referrerId, linkToken: suffix.replaceAll("-", "").padEnd(48, "x"), expiresAt: new Date(Date.now() + 86_400_000), grantVersion: 1 });
    const delivery = await db.insert(referralReviewDeliveries).values({ referralRequestId: requestId, referrerId, channel: "email", status: "failed", attemptCount: 4, nextAttemptAt: new Date(Date.now() - 60_000) });
    const id = Number(delivery[0].insertId);
    const owners = Array.from({ length: 6 }, () => randomUUID());
    const claims = await Promise.all(owners.map(owner => claimReferralReviewDelivery(requestId, referrerId, "email", owner)));
    const winners = claims.flatMap((claim, index) => claim ? [{ claim, owner: owners[index] }] : []);
    expect(winners).toHaveLength(1);
    const winner = winners[0];
    if (!winner) throw new Error("No concurrent claim won");
    expect(winner.claim.attemptCount).toBe(4);
    expect(await completeReferralReviewDelivery(id, winner.owner, { status: "failed", error: "delivery_failed:503" })).toEqual({ recorded: true });
    expect(await claimReferralReviewDelivery(requestId, referrerId, "email", randomUUID())).toBeUndefined();
    const row = async () => (await db.select().from(referralReviewDeliveries).where(eq(referralReviewDeliveries.id, id)).limit(1))[0];
    expect(await row()).toMatchObject({ status: "failed", attemptCount: 5, ownerAlertStatus: "pending" });

    const failures: string[] = [];
    const fail = (error: Error) => { failures.push(error.message); };
    let alerts = 0;
    await deliverReviewOwnerAlerts(new Date(), async () => { alerts += 1; return { sent: false }; }, fail);
    expect(await row()).toMatchObject({ ownerAlertStatus: "pending", ownerAlertSentAt: null });
    expect(failures).toHaveLength(1);
    failures.length = 0;
    await Promise.all(Array.from({ length: 6 }, () => deliverReviewOwnerAlerts(new Date(), async input => {
      expect(input.text).toContain(`referral request ${requestId}`);
      expect(input.text).not.toContain("@example.invalid");
      alerts += 1;
      return { sent: true };
    }, fail)));
    expect(alerts).toBe(2);
    expect(failures).toEqual([]);
    expect(await row()).toMatchObject({ attemptCount: 5, ownerAlertStatus: "sent", ownerAlertLeaseOwner: null });
    await deliverReviewOwnerAlerts(new Date(Date.now() + REVIEW_DELIVERY_ALERT_LEASE_MS + 60_000), async () => { throw new Error("Confirmed alert must not be sent again"); }, fail);
    expect(failures).toEqual([]);

    // An abandoned final user send is reported as unknown, without a sixth claim.
    await db.update(referralReviewDeliveries).set({ status: "leased", leaseOwner: "dead-worker", leaseExpiresAt: new Date(Date.now() - 60_000), ownerAlertStatus: null, ownerAlertSentAt: null }).where(eq(referralReviewDeliveries.id, id));
    await deliverReviewOwnerAlerts(new Date(), async input => { expect(input.text).toContain("outcome is unknown"); alerts += 1; return { sent: true }; }, fail);
    expect(await row()).toMatchObject({ status: "unknown", attemptCount: 5, ownerAlertStatus: "sent", leaseOwner: null });
    expect(await claimReferralReviewDelivery(requestId, referrerId, "email", randomUUID())).toBeUndefined();
    expect(alerts).toBe(3);
    expect(failures).toEqual([]);
  } finally {
    if (jobId) await db.delete(jobs).where(eq(jobs.id, jobId));
    for (const id of userIds) await db.delete(users).where(eq(users.id, id));
  }
});
