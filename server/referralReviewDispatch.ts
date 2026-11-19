/**
 * Referrer review email + Slack dispatch after a company ask is committed.
 * Extracted from privateReferralRoutes so every surface that creates an ask
 * (the normal ask page and Skippy, D-137) notifies referrers the same way.
 * Fire-and-forget: the ask is already committed; each send has a durable
 * claim/lease row and every outcome (with elapsedMs) goes to the audit log,
 * so a slow or dead send never holds the seeker.
 */
import { randomUUID } from "node:crypto";
import { sendReferrerReviewEmail } from "./referrerReviewEmail";
import { sendReferrerSlackDelivery } from "./referrerSlackDelivery";

export type ReferralReviewDispatchDeps = {
  prepareReferrerReviewEmailNotifications?: (requestId: number) => Promise<Array<{ referrerId: number; email: string; linkToken: string; companyDomain: string }>>;
  sendReferrerReviewEmail?: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<{ sent: boolean; reason: string }>;
  claimReferralReviewDelivery?: (requestId: number, referrerId: number, channel: "email" | "slack", leaseOwner: string) => Promise<{ id: number } | undefined>;
  completeReferralReviewDelivery?: (id: number, leaseOwner: string, result: { status: "sent" | "failed" | "unknown"; providerMessageId?: string; error?: string }) => Promise<{ recorded: boolean }>;
  getActiveReferrerSlackWebhooks?: (referrerIds: number[]) => Promise<Array<{ referrerId: number; webhookUrl: string }>>;
  sendReferrerSlackDelivery?: (input: { to: string; companyDomain: string; reviewUrl: string }) => Promise<{ sent: boolean; reason: string }>;
};

export type ReferralReviewDispatchRecord = (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; companyDomain?: string; metadata?: Record<string, string | number | boolean | null | undefined> }) => void;

export function dispatchReferralReviewDeliveries(args: {
  deps: ReferralReviewDispatchDeps;
  record: ReferralReviewDispatchRecord;
  origin: string;
  result: { requestId: number; companyDomain: string; replayed?: boolean };
  actorUserId: number;
}): void {
  const { deps, record, origin, result, actorUserId } = args;
  const run = async () => {
    const t0 = Date.now();
    let reviewLinks: Array<{ referrerId: number; email: string; linkToken: string; companyDomain: string }> = [];
    if (!result.replayed && deps.prepareReferrerReviewEmailNotifications) {
      try {
        reviewLinks = await deps.prepareReferrerReviewEmailNotifications(result.requestId);
        const reviewEmailSender = deps.sendReferrerReviewEmail ?? sendReferrerReviewEmail;
        const delivery = await Promise.all(reviewLinks.map(async link => { const leaseOwner = randomUUID(); const claim = deps.claimReferralReviewDelivery ? await deps.claimReferralReviewDelivery(result.requestId, link.referrerId, "email", leaseOwner) : { id: 0 }; if (!claim) return { sent: false, reason: "already_claimed" }; try { const sent = await reviewEmailSender({ to: link.email, companyDomain: link.companyDomain, reviewUrl: `${origin}/email-review/${encodeURIComponent(link.linkToken)}` }); await deps.completeReferralReviewDelivery?.(claim.id, leaseOwner, { status: sent.sent ? "sent" : "failed", error: sent.sent ? undefined : sent.reason }); return sent; } catch (error) { await deps.completeReferralReviewDelivery?.(claim.id, leaseOwner, { status: "unknown", error: error instanceof Error ? error.message : "delivery interrupted" }); throw error; } }));
        const sentCount = delivery.filter(item => item.sent).length;
        record({ actorUserId, action: "company_referral.review_email_dispatched", outcome: sentCount === reviewLinks.length ? "success" : "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { intendedRecipientCount: reviewLinks.length, sentCount, elapsedMs: Date.now() - t0 } });
      } catch (error) { record({ actorUserId, action: "company_referral.review_email_dispatched", outcome: "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { error: error instanceof Error ? error.message : "dispatch failed", elapsedMs: Date.now() - t0 } }); }
    }
    if (deps.getActiveReferrerSlackWebhooks && reviewLinks.length > 0) {
      try {
        const slackTargets = await deps.getActiveReferrerSlackWebhooks(reviewLinks.map(link => link.referrerId));
        const slackSender = deps.sendReferrerSlackDelivery ?? sendReferrerSlackDelivery;
        const slackDelivery = await Promise.all(slackTargets.map(async target => {
          const link = reviewLinks.find(item => item.referrerId === target.referrerId);
          if (!link) return { sent: false as const, reason: "not_configured" as const };
          const leaseOwner = randomUUID(); const claim = deps.claimReferralReviewDelivery ? await deps.claimReferralReviewDelivery(result.requestId, target.referrerId, "slack", leaseOwner) : { id: 0 }; if (!claim) return { sent: false as const, reason: "already_claimed" as const };
          try { const sent = await slackSender({ to: target.webhookUrl, companyDomain: link.companyDomain, reviewUrl: `${origin}/email-review/${encodeURIComponent(link.linkToken)}` }); await deps.completeReferralReviewDelivery?.(claim.id, leaseOwner, { status: sent.sent ? "sent" : "failed", error: sent.sent ? undefined : sent.reason }); return sent; } catch (error) { await deps.completeReferralReviewDelivery?.(claim.id, leaseOwner, { status: "unknown", error: error instanceof Error ? error.message : "delivery interrupted" }); return { sent: false as const, reason: "delivery_failed" as const }; }
        }));
        const slackSentCount = slackDelivery.filter(item => item.sent).length;
        record({ actorUserId, action: "company_referral.review_slack_dispatched", outcome: slackSentCount === slackTargets.length ? "success" : "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { intendedRecipientCount: slackTargets.length, sentCount: slackSentCount, elapsedMs: Date.now() - t0 } });
      } catch (error) { record({ actorUserId, action: "company_referral.review_slack_dispatched", outcome: "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { error: error instanceof Error ? error.message : "dispatch failed", elapsedMs: Date.now() - t0 } }); }
    }
  };
  void run().catch(error => record({ actorUserId, action: "company_referral.review_dispatch_crashed", outcome: "failure", resourceType: "referral_request", resourceId: result.requestId, companyDomain: result.companyDomain, metadata: { error: error instanceof Error ? error.message : "dispatch crashed" } }));
}
