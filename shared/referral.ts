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
  if (input.status === "withdrawn") return { label: "Withdrawn", title: "You withdrew this request.", detail: "Your credit was returned to your balance. You can request another referral anytime.", tone: "slate" };
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
/** Cards and urgency copy treat an ask as "expiring soon" inside this window. */
export const ASK_EXPIRING_SOON_DAYS = 2;
export const ASK_EXPIRING_SOON_MS = ASK_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;

function createdAtMs(createdAt: Date | string | number | null | undefined): number | null {
  if (createdAt == null) return null;
  const ms = createdAt instanceof Date ? createdAt.getTime() : typeof createdAt === "number" ? createdAt : Date.parse(createdAt);
  return Number.isFinite(ms) ? ms : null;
}

/** Absolute expiry instant for an ask, or null when it cannot be established (fail open: never strand). */
export function getAskExpiresAtMs(createdAt: Date | string | number | null | undefined): number | null {
  const base = createdAtMs(createdAt);
  return base === null ? null : base + ASK_TTL_MS;
}

/** True only for unclaimed pending asks past their shelf life. */
export function isAskExpired(input: { status: ReferralStatus; referrerId?: number | null; createdAt: Date | string | number | null | undefined }, nowMs: number = Date.now()): boolean {
  if (input.status !== "pending" || input.referrerId != null) return false;
  const expiresAt = getAskExpiresAtMs(input.createdAt);
  return expiresAt !== null && nowMs >= expiresAt;
}

/** Whole days left before expiry. Null when unstated; <=0 means expired. */
export function askDaysLeft(input: { createdAt: Date | string | number | null | undefined }, nowMs: number = Date.now()): number | null {
  const expiresAt = getAskExpiresAtMs(input.createdAt);
  if (expiresAt === null) return null;
  return Math.floor((expiresAt - nowMs) / (24 * 60 * 60 * 1000));
}

/** Row countdown copy. Returns null when no expiry applies. */
export function formatAskExpiry(input: { status: ReferralStatus; referrerId?: number | null; createdAt: Date | string | number | null | undefined }, nowMs: number = Date.now()): string | null {
  if (input.status !== "pending" || input.referrerId != null) return null;
  const days = askDaysLeft(input, nowMs);
  if (days === null) return null;
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}
