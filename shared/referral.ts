export const referralStatuses = ["pending", "approved", "declined", "intro_made", "interview", "offer", "closed", "withdrawn"] as const;
export type ReferralStatus = (typeof referralStatuses)[number];

export const referralStatusLabels: Record<ReferralStatus, string> = {
  pending: "Request sent",
  approved: "Approved",
  declined: "Declined",
  intro_made: "Introduction made",
  interview: "Interview",
  offer: "Offer",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

export const referralStatusSteps: ReferralStatus[] = ["pending", "approved", "intro_made", "interview", "offer", "closed"];

export const postApprovalReferralStatuses = ["approved", "intro_made", "interview", "offer", "closed"] as const;
export const referralProgressUpdateStatuses = ["intro_made", "interview", "offer", "closed"] as const;
export type ReferralProgressUpdateStatus = (typeof referralProgressUpdateStatuses)[number];

export function isPostApprovalReferralStatus(status: string): status is (typeof postApprovalReferralStatuses)[number] {
  return (postApprovalReferralStatuses as readonly string[]).includes(status);
}

export function isReferralProgressUpdateStatus(status: unknown): status is ReferralProgressUpdateStatus {
  return typeof status === "string" && (referralProgressUpdateStatuses as readonly string[]).includes(status);
}

export function getReferralProgress(status: ReferralStatus): number {
  if (status === "declined" || status === "withdrawn") return 0;
  const step = referralStatusSteps.indexOf(status);
  return step < 0 ? 0 : Math.round((step / (referralStatusSteps.length - 1)) * 100);
}

export function canReviewReferral(status: ReferralStatus): boolean {
  return status === "pending";
}

export type JobSeekerReferralState = {
  label: string;
  title: string;
  detail: string;
  tone: "blue" | "amber" | "emerald" | "slate";
};

export function getJobSeekerReferralState(input: { status: ReferralStatus; referrerId?: number | null }): JobSeekerReferralState {
  if (input.status === "pending" && input.referrerId) return { label: "Under review", title: "A verified employee is reviewing your request.", detail: "Their identity remains private. You will see a factual update when they make a decision.", tone: "blue" };
  if (input.status === "pending") return { label: "Privately routed", title: "Your request is available to eligible employees.", detail: "It remains private while a verified employee decides whether to claim it.", tone: "amber" };
  if (input.status === "approved") return { label: "Referral approved", title: "A verified employee approved your referral request.", detail: "Use the next-step email draft when you are ready to continue with the hiring process.", tone: "emerald" };
  if (input.status === "intro_made") return { label: "Introduction made", title: "Your referral has moved to the next step.", detail: "Continue privately with your referral partner when there is a real update.", tone: "blue" };
  if (input.status === "interview") return { label: "Interview in progress", title: "An interview milestone was recorded.", detail: "Keep communication private and update this only when the next real step happens.", tone: "blue" };
  if (input.status === "offer") return { label: "Offer recorded", title: "An offer milestone was recorded.", detail: "This is a factual private progress update, not a public success claim.", tone: "emerald" };
  if (input.status === "closed") return { label: "Request closed", title: "This referral request is closed.", detail: "Your private request history and documents remain protected.", tone: "slate" };
  if (input.status === "declined") return { label: "Request closed", title: "This referral request was declined.", detail: "Your documents stay private. You can reuse your packet for another opportunity.", tone: "slate" };
  // Truthful in every withdrawal: the slot always frees; the credit comes back only
  // while no employee had picked the ask up (server/db.ts withdrawCompanyReferralRequest).
  if (input.status === "withdrawn") return { label: "Withdrawn", title: "You withdrew this request.", detail: "Its open slot is free again. The credit came back only if no verified employee had picked it up. You can request another referral anytime.", tone: "slate" };
  return { label: referralStatusLabels[input.status], title: referralStatusLabels[input.status], detail: "This request has a verified status update.", tone: input.status === "offer" ? "emerald" : "blue" };
}

export function getReferrerInboxState(input: { status: ReferralStatus; referrerId?: number | null; savedAt?: Date | string | null }): "new" | "saved" | "completed" {
  if (input.status !== "pending") return "completed";
  if (input.referrerId || input.savedAt) return "saved";
  return "new";
}

/**
 * Ask shelf life. A pending ask that no verified employee claims expires
 * ASK_TTL_DAYS after creation so early seekers are never left hanging: the
 * reserved credit returns automatically and the slot frees. Only unclaimed
 * pending asks expire — anything in conversation is untouched.
 *
 * Timestamps are always computed in JS (Date.now), never from DB NOW(),
 * because the app clock and Azure MySQL can skew.
 */
export const ASK_TTL_DAYS = 7;
export const ASK_TTL_MS = ASK_TTL_DAYS * 24 * 60 * 60 * 1000;
/** D-061: an ask at a company with no available verified referrer waits up to this long at no cost. */
export const COVERAGE_WAIT_DAYS = 90;
export const COVERAGE_WAIT_MS = COVERAGE_WAIT_DAYS * 24 * 60 * 60 * 1000;

/** D-038-A / D-076 (5): the claim and allocation timers only run for events at or after this instant,
 * set to the UTC midnight after the day this ships, so nothing lapses before referrers have had
 * 48 hours under the new rule. Claims and allocations made before it keep the old lifecycle. */
export const REFERRAL_TIMERS_SINCE = new Date("2026-10-23T00:00:00.000Z").getTime();

/** D-038-B, reviewed and passed in D-038-reconcile (part B's own Tier 1 review, Oct 22) and switched
 * on by the landing commit (R-2). Kept as a switch, never deleted (D-042): flipping it to false turns
 * the referred reminders and lapse off, the three routes answer 409 and the thread sends no deadline
 * fields, while steps 1–3 keep running. */
export const REFERRED_DEADLINE_ENABLED = true;

const HOUR_MS = 60 * 60 * 1000;
export const CLAIM_LAPSE_HOURS = 48;
export const CLAIM_LAPSE_MS = CLAIM_LAPSE_HOURS * HOUR_MS;
export const CLAIM_REMINDER_HOURS = 24;
export const CLAIM_REMINDER_MS = CLAIM_REMINDER_HOURS * HOUR_MS;
/** D-038-A: a referrer holds at most this many open claims at once. */
export const MAX_ACTIVE_CLAIMS = 5;

/** The instant a claim lapses: 48 h after the claim event, but never before REFERRAL_TIMERS_SINCE + 48 h. */
export function claimLapseAtMs(claimCreatedAt: number): number {
  return Math.max(claimCreatedAt, REFERRAL_TIMERS_SINCE) + CLAIM_LAPSE_MS;
}

/** The instant an allocation lapses: 48 h after first visibility (coverageVisibleAt), but never before REFERRAL_TIMERS_SINCE + 48 h.
 * Never read the slot's openedAt (a database clock) for timing. */
export function allocationLapseAtMs(coverageVisibleAt: number | null | undefined): number {
  const visibleAtMs = coverageVisibleAt == null ? null : createdAtMs(coverageVisibleAt);
  const visibleAt = visibleAtMs == null ? REFERRAL_TIMERS_SINCE : Math.max(visibleAtMs, REFERRAL_TIMERS_SINCE);
  return visibleAt + CLAIM_LAPSE_MS;
}

/** The instant the 24-hour reminder is due: one day before the lapse. */
export function reminderAtMs(lapseAtMs: number): number {
  return lapseAtMs - CLAIM_REMINDER_MS;
}

/** D-038-B: an accepted ask must be marked Referred within this many days. */
export const REFERRED_LAPSE_DAYS = 5;
/** D-038-B: one optional extension moves the deadline by this many days (5 -> 8). */
export const REFERRED_EXTENSION_DAYS = 3;
/** D-038-reconcile B-1: the extension's operation key — one per acceptance, never one per ask. */
export function referredExtensionOperationKey(acceptEventId: number): string {
  return `referred-extension:${acceptEventId}`;
}
/** D-038-B: reminder days after acceptance, before the deadline. */
export const REFERRED_REMINDER_DAYS = [2, 4] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The instant an accepted ask's Referred deadline is due: 5 days from acceptance,
 * or 8 days once the one extension was used, but never before REFERRAL_TIMERS_SINCE + 5 days. */
export function referredDueAtMs(acceptedAtMs: number, extended: boolean): number {
  const base = Math.max(acceptedAtMs, REFERRAL_TIMERS_SINCE);
  return base + (extended ? REFERRED_LAPSE_DAYS + REFERRED_EXTENSION_DAYS : REFERRED_LAPSE_DAYS) * DAY_MS;
}

/** The instant a day-N reminder is due: N days after acceptance, clamped to not
 * run before REFERRAL_TIMERS_SINCE. Returns null when the day is past the deadline. */
export function referredReminderAtMs(acceptedAtMs: number, day: (typeof REFERRED_REMINDER_DAYS)[number]): number | null {
  const base = Math.max(acceptedAtMs, REFERRAL_TIMERS_SINCE);
  const reminder = base + day * DAY_MS;
  const due = referredDueAtMs(acceptedAtMs, false);
  return reminder >= due ? null : reminder;
}

/** Cards and urgency copy treat an ask as "expiring soon" inside this window. */
export const ASK_EXPIRING_SOON_DAYS = 2;
export const ASK_EXPIRING_SOON_MS = ASK_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

function createdAtMs(createdAt: Date | string | number | null | undefined): number | null {
  if (createdAt == null) return null;
  const ms = createdAt instanceof Date ? createdAt.getTime() : typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * D-034/D-061: the clock fields of an ask's shelf life. `coverageVisibleAt` is
 * when an available verified referrer could first see the ask (null while it
 * still waits for coverage); `waitingForCoverage` means no referrer can see it
 * yet, so only the 90-day coverage wait runs. Rows from before migration 0095
 * have no coverageVisibleAt and keep their exact old lifecycle (visible since
 * creation).
 */
export type AskExpiryWindow = {
  coverageVisibleAt?: Date | string | number | null;
  waitingForCoverage?: boolean | null;
};

/** The instant the 7-day clock starts: first visibility, or creation for pre-0095 rows. */
export function getAskVisibleSinceMs(input: { createdAt: Date | string | number | null | undefined } & AskExpiryWindow): number | null {
  return createdAtMs(input.coverageVisibleAt ?? null) ?? createdAtMs(input.createdAt);
}

/** Absolute expiry instant for an ask, or null when it cannot be established (fail open: never strand). Creation-based: the D-050 held-ask shelf life. */
export function getAskExpiresAtMs(createdAt: Date | string | number | null | undefined): number | null {
  const base = createdAtMs(createdAt);
  return base === null ? null : base + ASK_TTL_MS;
}

/** D-061 deadline of an unclaimed ask: waiting asks close COVERAGE_WAIT_DAYS after creation at no cost; everything else ASK_TTL_DAYS after first visibility. */
export function getAskShelfLifeEndsAtMs(input: { createdAt: Date | string | number | null | undefined } & AskExpiryWindow): number | null {
  if (input.waitingForCoverage) {
    const base = createdAtMs(input.createdAt);
    return base === null ? null : base + COVERAGE_WAIT_MS;
  }
  const since = getAskVisibleSinceMs(input);
  return since === null ? null : since + ASK_TTL_MS;
}

/** True only for unclaimed pending asks past their D-061 shelf life. */
export function isAskExpired(input: { status: ReferralStatus; referrerId?: number | null; createdAt: Date | string | number | null | undefined } & AskExpiryWindow, nowMs: number = Date.now()): boolean {
  if (input.status !== "pending" || input.referrerId != null) return false;
  const expiresAt = getAskShelfLifeEndsAtMs(input);
  return expiresAt !== null && nowMs >= expiresAt;
}

/** Whole days left before the 7-day shelf life ends. Null when unstated or while the ask waits for coverage; <=0 means expired. */
export function askDaysLeft(input: { createdAt: Date | string | number | null | undefined } & AskExpiryWindow, nowMs: number = Date.now()): number | null {
  if (input.waitingForCoverage) return null;
  const expiresAt = getAskShelfLifeEndsAtMs(input);
  if (expiresAt === null) return null;
  return Math.floor((expiresAt - nowMs) / (24 * 60 * 60 * 1000));
}

/** Days to show in "Expires in N days": rounds a partial day up so a fresh 7-day ask reads 7, not 6. Today/tomorrow bands still use the floor above. */
export function askDaysShown(input: { createdAt: Date | string | number | null | undefined } & AskExpiryWindow, nowMs: number = Date.now()): number | null {
  if (input.waitingForCoverage) return null;
  const expiresAt = getAskShelfLifeEndsAtMs(input);
  if (expiresAt === null) return null;
  const day = 24 * 60 * 60 * 1000;
  const floor = Math.floor((expiresAt - nowMs) / day);
  return floor >= 2 ? Math.ceil((expiresAt - nowMs) / day) : floor;
}

/** Row countdown copy. Returns null when no expiry applies (including while an ask waits for coverage). A personal-link ask its employee has not acted on (`heldForReferrer`, D-050) counts down like an unclaimed one. */
export function formatAskExpiry(input: { status: ReferralStatus; referrerId?: number | null; heldForReferrer?: boolean; createdAt: Date | string | number | null | undefined } & AskExpiryWindow, nowMs: number = Date.now()): string | null {
  if (input.status !== "pending" || (input.referrerId != null && input.heldForReferrer !== true)) return null;
  const days = askDaysShown(input, nowMs);
  if (days === null) return null;
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}
