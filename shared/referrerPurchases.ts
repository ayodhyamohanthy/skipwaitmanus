/**
 * D-055 follow-up (D-067 lane): referrers never pay on SkipWait. Referring is
 * never charged, and SkipWait never pays a referrer (D-055).
 *
 * Every referrer-role purchase (a kit credit pack, a kit pass or Keep warm, or
 * the /premium per-credit checkout with role "referrer") is refused first by
 * server/chargebeeRoutes.ts: 403 with REFERRER_PURCHASE_REFUSED_ERROR and a
 * denied activity row, before any availability probe, provider call or
 * checkout intent. The client shows no purchase control for the referrer role.
 *
 * Switched off, not deleted (D-042), the same pattern as
 * REFERRER_ACCEPT_REWARDS_ENABLED in server/db.ts: the referrer arms of the
 * checkout code stay. A payment started before the switch-off keeps working,
 * because credit recovery, webhook fulfilment, refunds, receipts and
 * cancellation read the role stored on the intent or subscription and never
 * consult this switch. A seeker purchase by a person who is also a verified
 * referrer sends role "job_seeker" and is never refused here.
 */
export const REFERRER_PURCHASES_ENABLED: boolean = false;

export const REFERRER_PURCHASE_REFUSED_CODE = "referrers_never_pay" as const;

/** The plain fact, for any surface that would otherwise offer a referrer a purchase. */
export const REFERRERS_NEVER_PAY = "Referrers never pay on SkipWait.";

/** The 403 body's error for a refused referrer-role checkout. */
export const REFERRER_PURCHASE_REFUSED_ERROR = `${REFERRERS_NEVER_PAY} Nothing has been charged.`;

/**
 * True when a purchase names the referrer role while referrer purchases are
 * off. It reads the raw body value, which is "referrer" exactly when the
 * checkout's role parsers would treat it as the referrer role.
 */
export function isReferrerPurchaseRefused(role: unknown): boolean {
  return !REFERRER_PURCHASES_ENABLED && role === "referrer";
}
