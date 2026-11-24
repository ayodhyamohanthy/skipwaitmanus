// ADMIN-support-view (D-393): the admin support view's contract. One person's account, identity, wallet,
// requests, activity and the plain-words cause of what went wrong, plus the trouble signals on /admin.
// The server assembles it (server/adminSupport.ts); the page parses it (client/src/pages/goal/admin/).
// Counts and rows are only what the admin role may already read; nothing here is public or exportable.
import { z } from "zod";
import { getJobSeekerReferralState, referralStatuses, type ReferralStatus } from "./referral";

/** A stored status narrowed without a cast: anything else stays unknown and is shown as it is. */
const isReferralStatus = (value: string): value is ReferralStatus => (referralStatuses as readonly string[]).includes(value);

export const SUPPORT_ACTIVITY_DAYS = 90;
export const SUPPORT_ACTIVITY_LIMIT = 100;
export const SUPPORT_LEDGER_LIMIT = 50;
export const SUPPORT_REQUEST_LIMIT = 50;
export const SUPPORT_TIMELINE_LIMIT = 20;
export const SUPPORT_SIGNAL_WINDOWS = ["24h", "7d"] as const;
export type SupportSignalWindow = (typeof SUPPORT_SIGNAL_WINDOWS)[number];
export const SUPPORT_SIGNAL_WINDOW_HOURS: Readonly<Record<SupportSignalWindow, number>> = { "24h": 24, "7d": 168 };

/**
 * "Try this in the sandbox" (packet item 4) opens the same company and job link for the demo seeker.
 * The sandbox itself is `QA-sandbox-requests` (D-393 (3)(a)): until that row lands, a demo-seeker send
 * would reach a real company's real employees, so the control stays off rather than sending one.
 * Turning it on is that row's release, not this page's.
 */
export const SANDBOX_ASKS_AVAILABLE = false;

const stamp = z.union([z.string(), z.date()]);
const text = z.string().nullable();

export const supportAliasSchema = z.object({ provider: z.string(), email: text, verifiedAt: stamp.nullable() });
export type SupportAlias = z.infer<typeof supportAliasSchema>;

export const supportAccountSchema = z.object({
  id: z.number(),
  email: text,
  name: text,
  role: text,
  accountType: text,
  company: text,
  createdAt: stamp,
  suspended: z.boolean(),
  canonicalPersonId: z.number().nullable(),
  workEmailVerifiedAt: stamp.nullable(),
  workEmailDomain: text,
  signInMethods: z.array(z.string()).default([]),
  aliases: z.array(supportAliasSchema).default([]),
});
export type SupportAccount = z.infer<typeof supportAccountSchema>;

export const supportLedgerRowSchema = z.object({
  id: z.number(),
  kind: z.string(),
  credits: z.number(),
  bucket: text,
  createdAt: stamp,
});
export type SupportLedgerRow = z.infer<typeof supportLedgerRowSchema>;

export const supportWalletSchema = z.object({
  role: z.enum(["job_seeker", "referrer"]),
  plan: z.string(),
  totalAvailable: z.number(),
  monthlyCreditsRemaining: z.number(),
  purchasedCreditsRemaining: z.number(),
  promoCreditsRemaining: z.number(),
  subscriptionStatus: text,
  subscriptionCurrentTermEnd: stamp.nullable(),
  cardValidated: z.boolean(),
  freeCreditsLocked: z.boolean(),
  ledger: z.array(supportLedgerRowSchema).default([]),
});
export type SupportWallet = z.infer<typeof supportWalletSchema>;

export const supportCheckoutIntentSchema = z.object({
  id: z.number(),
  kind: z.string(),
  status: z.string(),
  createdAt: stamp,
});
export type SupportCheckoutIntent = z.infer<typeof supportCheckoutIntentSchema>;

export const supportReferrerSchema = z.object({
  verifiedDomain: text,
  verifiedAt: stamp.nullable(),
  openClaims: z.number(),
  available: z.boolean(),
});
export type SupportReferrer = z.infer<typeof supportReferrerSchema>;

export const supportBlockSchema = z.object({ otherUserId: z.number(), direction: z.enum(["they_blocked", "blocked_by_them"]), createdAt: stamp });
export type SupportBlock = z.infer<typeof supportBlockSchema>;

export const supportTimelineRowSchema = z.object({
  id: z.number(),
  action: z.string(),
  fromStatus: z.string(),
  resultingStatus: z.string(),
  role: z.enum(["seeker", "referrer", "actor"]),
  createdAt: stamp,
});
export type SupportTimelineRow = z.infer<typeof supportTimelineRowSchema>;

/** The plain-words cause of a failure, and the existing audited admin action that fixes it. */
export const supportCauseSchema = z.object({ cause: z.string(), fix: z.string(), adminAction: z.object({ label: z.string(), href: z.string() }).nullable() });
export type SupportCause = z.infer<typeof supportCauseSchema>;

export const supportRequestSchema = z.object({
  id: z.number(),
  title: text,
  companyDomain: text,
  targetRoleUrl: text,
  status: z.string(),
  waitingForCoverage: z.boolean(),
  referrerId: z.number().nullable(),
  createdAt: stamp,
  updatedAt: stamp,
  state: z.object({ label: z.string(), reason: z.string() }),
  timeline: z.array(supportTimelineRowSchema).default([]),
  sandbox: z.object({ available: z.boolean(), companySlug: text, targetRoleUrl: text }),
});
export type SupportRequest = z.infer<typeof supportRequestSchema>;

export const supportActivityRowSchema = z.object({
  id: z.number(),
  action: z.string(),
  outcome: z.string(),
  createdAt: stamp,
  metadata: text,
});
export type SupportActivityRow = z.infer<typeof supportActivityRowSchema>;

export const supportViewSchema = z.object({
  account: supportAccountSchema,
  wallet: supportWalletSchema.nullable(),
  checkoutIntents: z.array(supportCheckoutIntentSchema).default([]),
  referrer: supportReferrerSchema.nullable(),
  blocks: z.array(supportBlockSchema).default([]),
  requests: z.array(supportRequestSchema).default([]),
  activity: z.array(supportActivityRowSchema).default([]),
  newestFailures: z.array(supportActivityRowSchema.extend({ cause: supportCauseSchema.nullable() })).default([]),
});
export type SupportView = z.infer<typeof supportViewSchema>;

export const supportSignalCountSchema = z.object({ reason: z.string(), count: z.number() });
export type SupportSignalCount = z.infer<typeof supportSignalCountSchema>;

export const supportSignalWindowSchema = z.object({
  signInFailures: z.array(supportSignalCountSchema).default([]),
  sendRefusals: z.array(supportSignalCountSchema).default([]),
  checkoutRefusals: z.array(supportSignalCountSchema).default([]),
  heldRequests: z.number(),
  reviewEmailFailures: z.number(),
  clientErrors: z.number(),
});
export type SupportSignalWindowCounts = z.infer<typeof supportSignalWindowSchema>;

export const supportSignalsSchema = z.object({ windows: z.record(z.enum(SUPPORT_SIGNAL_WINDOWS), supportSignalWindowSchema) });
export type SupportSignals = z.infer<typeof supportSignalsSchema>;

const ADMIN_ACTIONS = {
  payments: { label: "Open payment review", href: "/admin/payments" },
  tokenRecovery: { label: "Open token recovery", href: "/admin/token-recovery" },
  activity: { label: "Open the activity log", href: "/admin/activity" },
  users: { label: "Open the people directory", href: "/admin/users" },
  moneyCheck: { label: "Open the money check", href: "/admin/money-check" },
} as const;

/**
 * The plain-words cause for a refusal or failure the activity log recorded, keyed by its action. Each
 * entry states what happened and the fix in the words the person would use, and names the existing
 * audited admin action that resolves it — never a new money path (packet item 2).
 */
const CAUSES: Readonly<Record<string, SupportCause>> = {
  "company_referral.company_cap_reached": { cause: "Send was blocked: this person already has two open referral requests at that company.", fix: "Wait for one of those requests to be decided, or withdraw one.", adminAction: ADMIN_ACTIONS.activity },
  "company_referral.slot_cap_reached": { cause: "Send was blocked: this person already has the most open referral requests their plan allows.", fix: "Wait for a request to be decided, or withdraw one.", adminAction: ADMIN_ACTIONS.activity },
  "company_referral.price_changed": { cause: "Send was blocked: the price changed while the request was being composed, so nothing was charged.", fix: "Ask them to review the new price and send again.", adminAction: ADMIN_ACTIONS.activity },
  "company_referral.blocked_denied": { cause: "Send was blocked: these two people have blocked each other, so neither can reach the other.", fix: "The block is theirs to lift; an admin cannot remove it for them.", adminAction: ADMIN_ACTIONS.users },
  "company_referral.block_check_unavailable": { cause: "The block check could not run, so the send was refused rather than risk a blocked pair.", fix: "Retry once the database answers; nothing was charged.", adminAction: ADMIN_ACTIONS.activity },
  "company_referral.pinned_work_limit_reached": { cause: "Send was blocked: this person already pinned the most work samples a request allows.", fix: "Remove a pinned sample, or send fewer.", adminAction: ADMIN_ACTIONS.activity },
  "company_referral.conversation_rate_limited": { cause: "A message was refused: too many messages were sent in a short time.", fix: "Wait for the limit to clear; the thread is unchanged.", adminAction: ADMIN_ACTIONS.activity },
  "billing.banded_checkout_refused": { cause: "Checkout was refused before any provider call, so nothing was charged.", fix: "Read the refusal reason on the activity row; a plan or band limit is the usual cause.", adminAction: ADMIN_ACTIONS.payments },
  "billing.credit_checkout_refused": { cause: "Checkout was refused before any provider call, so nothing was charged.", fix: "Referrers never pay; any other refusal is a catalog or role limit.", adminAction: ADMIN_ACTIONS.payments },
  "billing.subscription_checkout_refused": { cause: "Subscription checkout was refused before any provider call, so nothing was charged.", fix: "A retired plan or a referrer role is the usual cause.", adminAction: ADMIN_ACTIONS.payments },
  "payment.review_refused": { cause: "An admin decision on a parked payment was refused, so nothing was written.", fix: "The payment's own reason forbids that decision; read it before choosing another.", adminAction: ADMIN_ACTIONS.payments },
  "work_email.step_up_denied": { cause: "The work-email step-up code was refused, so the action that needed it did not run.", fix: "Send a fresh code and enter it in the same session.", adminAction: ADMIN_ACTIONS.activity },
  "auth.password_sign_in": { cause: "A password sign-in failed.", fix: "Check the password, or use a sign-in method the account already has.", adminAction: ADMIN_ACTIONS.activity },
  "auth.social_sign_in": { cause: "A social sign-in failed.", fix: "Retry the provider; a cancelled consent screen is the usual cause.", adminAction: ADMIN_ACTIONS.activity },
  "auth.work_email_code_verified": { cause: "A work-email code was refused.", fix: "Send a fresh code; codes expire and allow a limited number of tries.", adminAction: ADMIN_ACTIONS.activity },
  "auth.passkey_sign_in": { cause: "A passkey sign-in failed.", fix: "Use another method, or register the passkey again.", adminAction: ADMIN_ACTIONS.activity },
  "auth.reviewer_sign_in": { cause: "A demo reviewer sign-in failed.", fix: "The repository secrets and the live release disagree; run the reviewer reset.", adminAction: ADMIN_ACTIONS.activity },
};

/** The plain-words cause for one activity row, or null when the row is not a failure we explain. */
export function supportCauseOf(action: string, outcome: string): SupportCause | null {
  if (outcome === "success") return null;
  return CAUSES[action] ?? null;
}

/** The reason a request is where it is, in the words the seeker would use. */
export function supportRequestStateOf(row: { status: string; waitingForCoverage: boolean; coverageHeldAt?: unknown; referrerId: number | null }): { label: string; reason: string } {
  if (row.waitingForCoverage) {
    return row.coverageHeldAt
      ? { label: "Held", reason: "No verified employee was available when it became visible, and this person had no referral left, so it waits without being charged." }
      : { label: "Waiting", reason: "No verified employee at this company can see it yet. It waits free and is delivered when one can." };
  }
  // One source of truth for the seeker-facing words: shared/referral.ts.
  const status = isReferralStatus(row.status) ? row.status : null;
  if (!status) return { label: row.status.replace(/_/g, " "), reason: "No plain-words reason is recorded for this state." };
  const state = getJobSeekerReferralState({ status, referrerId: row.referrerId });
  return { label: state.label, reason: state.detail };
}

/** The sandbox ask for one request: the same company and job link, for the demo seeker. */
export function sandboxAskTarget(input: { companySlug: string | null; targetRoleUrl: string | null }): { available: boolean; companySlug: string | null; targetRoleUrl: string | null } {
  return { available: SANDBOX_ASKS_AVAILABLE && Boolean(input.targetRoleUrl), companySlug: input.companySlug, targetRoleUrl: input.targetRoleUrl };
}
